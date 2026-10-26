package com.cargoplanner.backend.text.workbook;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Executes a model-proposed coordinate mapping; numeric cargo values always come from source cells. */
public final class WorkbookPlanExecutor {
  private static final Pattern DIMENSIONS = Pattern.compile(
      "(?i)^\\s*(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)?\\s*[x×*]\\s*(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)?\\s*[x×*]\\s*(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)?\\s*$");
  private static final List<String> COLUMN_FIELDS = List.of("packageIdColumn", "marksColumn", "packageQuantityColumn",
      "nameColumn", "modelColumn", "innerQuantityColumn", "innerUnitWeightColumn", "combinedDimensionsColumn",
      "lengthColumn", "widthColumn", "heightColumn", "grossWeightColumn", "netWeightColumn",
      "typeColumn", "nonStackColumn", "keepUprightColumn", "remarkColumn");
  private static final Pattern IDENTITY_RANGE = Pattern.compile("(?iu)\\d+\\s*(?:[-–—~～]|\\.\\.|\\bto\\b|至|到)\\s*#?\\s*\\d+");

  public WorkbookPlanExecutor(ObjectMapper objectMapper) {
    // Same construction contract as the other workbook components; no model or IO dependency.
  }

  public Map<String, Object> execute(Map<String, Object> document, Map<String, Object> proposed) {
    List<Map<String, Object>> plans = WorkbookEvidenceService.list(proposed.get("plans"));
    if (plans.isEmpty() || plans.size() > 32) throw new IllegalArgumentException("A workbook plan must identify 1–32 source regions");
    List<Map<String, Object>> cargos = new ArrayList<>();
    List<Map<String, Object>> blocks = new ArrayList<>();
    List<Map<String, Object>> warnings = new ArrayList<>();
    Set<String> identities = new HashSet<>(), coveredRows = new HashSet<>(), totalCells = new HashSet<>();
    Map<String, Double> declared = new LinkedHashMap<>();
    for (Map<String, Object> plan : plans) {
      Source source = new Source(WorkbookEvidenceService.findSheet(document, text(plan.get("sheet"))));
      validatePlan(source, plan);
      int first = integer(plan.get("firstDataRow")), last = integer(plan.get("lastDataRow"));
      List<Integer> group = new ArrayList<>();
      for (int row = first; row <= last; row++) {
        if (!coveredRows.add(source.name + ":" + row)) throw new IllegalArgumentException("Workbook plans overlap source rows");
        boolean identified = !source.raw(row, plan.get("packageIdColumn")).isBlank()
            || !source.raw(row, plan.get("marksColumn")).isBlank();
        boolean quantityRow = "quantity-column".equals(plan.get("quantityBasis"))
            && !source.raw(row, plan.get("packageQuantityColumn")).isBlank();
        if (identified || quantityRow) {
          if (!group.isEmpty()) cargos.add(packageCargo(source, plan, group, identities, blocks));
          group = new ArrayList<>();
        }
        if (source.hasMappedData(row, plan)) {
          if (group.isEmpty() && !identified && !quantityRow) {
            blocks.add(issue("PACKAGE_ORPHAN_CONTENT", "Source content has no package identity or explicit package count", source.name, row));
          } else {
            group.add(row);
          }
        }
      }
      if (!group.isEmpty()) cargos.add(packageCargo(source, plan, group, identities, blocks));
      Map<String, Object> totals = map(plan.get("totals"));
      for (String metric : List.of("packageCount", "innerQuantity", "grossWeight", "netWeight", "volume")) {
        String address = text(totals.get(metric + "Cell"));
        if (address.isEmpty()) continue;
        int[] position = WorkbookEvidenceService.coordinate(address);
        if (position[0] >= first && position[0] <= last) throw new IllegalArgumentException("A control total cannot be inside the cargo data rows");
        String key = source.name + ":" + address;
        if (!totalCells.add(key)) continue;
        BigDecimal value = number(source.at(position[0], position[1]));
        if (value == null || value.signum() < 0) {
          blocks.add(issue("PACKAGE_TOTAL_INVALID", "A mapped source control total is not numeric: " + address, source.name, position[0]));
          continue;
        }
        if (metric.endsWith("Weight")) value = value.multiply(weightFactor(text(plan.get("weightUnit"))));
        declared.merge(metric, value.doubleValue(), Double::sum);
      }
    }
    blocks.addAll(WorkbookPlanCoverage.issues(document, proposed));
    Map<String, Object> actual = totals(cargos);
    Map<String, Object> expected = new LinkedHashMap<>(actual);
    for (Map.Entry<String, Double> entry : declared.entrySet()) {
      String metric = switch (entry.getKey()) {
        case "grossWeight" -> "grossWeightKg";
        case "netWeight" -> "netWeightKg";
        case "volume" -> "declaredVolumeM3";
        default -> entry.getKey();
      };
      expected.put(metric, entry.getValue());
      if (!entry.getKey().equals("volume")) {
        Object observedValue = actual.get(metric);
        if (!(observedValue instanceof Number observed)
            || Math.abs(observed.doubleValue() - entry.getValue()) > (metric.endsWith("Kg") ? 0.01 : 0.000001)) {
          blocks.add(issue("PACKAGE_CONSERVATION_MISMATCH", metric + ": source total " + entry.getValue() + ", extracted " + observedValue, "", 0));
        }
      }
    }
    if (declared.containsKey("volume")) {
      actual.put("declaredVolumeM3", declared.get("volume"));
      double computed = ((Number) actual.get("calculatedVolumeM3")).doubleValue();
      if (Math.abs(computed - declared.get("volume")) > 0.000001) {
        warnings.add(issue("PACKAGE_SOURCE_VOLUME_MISMATCH", "Source declares " + declared.get("volume")
            + " m³; package dimensions calculate " + computed + " m³. Confirm this source discrepancy; dimensions were not changed.", "", 0));
      }
    }
    if (cargos.isEmpty()) blocks.add(issue("PACKAGE_DATA_MISSING", "No physical handling units were extracted", "", 0));
    Map<String, Object> reconciliation = new LinkedHashMap<>();
    reconciliation.put("basis", "source-coordinate-plan");
    reconciliation.put("status", !blocks.isEmpty() ? "blocked" : warnings.isEmpty() ? "matched" : "review-required");
    reconciliation.put("blockingIssues", blocks);
    reconciliation.put("warnings", warnings);
    reconciliation.put("expected", expected);
    reconciliation.put("actual", actual);
    reconciliation.put("reconstructedPackageCount", cargos.size());
    List<Map<String, Object>> issues = new ArrayList<>(blocks);
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("rows", cargos);
    result.put("issues", issues);
    result.put("reconciliation", reconciliation);
    result.put("partial", !blocks.isEmpty());
    result.put("totalSourceRows", coveredRows.size());
    result.put("notes", "Mapped source coordinates were read directly. Package counts, product counts and per-package weights remain separate.");
    return result;
  }

  private void validatePlan(Source source, Map<String, Object> plan) {
    int first = integer(plan.get("firstDataRow")), last = integer(plan.get("lastDataRow"));
    if (first < 1 || last < first || last > source.rowCount) throw new IllegalArgumentException("Cargo row range is outside the worksheet");
    for (String field : COLUMN_FIELDS) {
      String column = text(plan.get(field));
      if (!column.isEmpty() && column(column) > source.columnCount) throw new IllegalArgumentException("Mapped column is outside the worksheet: " + field);
    }
    if (!Set.of("per-identity", "quantity-column").contains(text(plan.get("quantityBasis")))) throw new IllegalArgumentException("Unknown package quantity basis");
    if (text(plan.get("quantityBasis")).equals("per-identity") && text(plan.get("packageIdColumn")).isEmpty()
        && text(plan.get("marksColumn")).isEmpty()) throw new IllegalArgumentException("One-package-per-identity needs a source identity column");
    if (text(plan.get("quantityBasis")).equals("quantity-column") && text(plan.get("packageQuantityColumn")).isEmpty()) throw new IllegalArgumentException("Package count column is required");
    dimensionFactor(text(plan.get("dimensionUnit")));
    weightFactor(text(plan.get("weightUnit")));
    if (!Set.of("per-package", "group-total").contains(text(plan.get("weightBasis")))) throw new IllegalArgumentException("Unknown package weight basis");
    if (text(plan.get("nameColumn")).isEmpty()) throw new IllegalArgumentException("A source content name column is required");
    for (String mapping : List.of("typeMapping", "nonStackMapping", "keepUprightMapping")) {
      Object configured = plan.get(mapping);
      if (configured != null && !(configured instanceof Map<?, ?>)) throw new IllegalArgumentException(mapping + " must be an object");
      Map<String, Object> normalizedKeys = new HashMap<>();
      for (Map.Entry<String, Object> entry : map(configured).entrySet()) {
        if (entry.getKey().isBlank()) throw new IllegalArgumentException("Mapping keys cannot be empty");
        if (mapping.equals("typeMapping") && !Set.of("normal", "pallet", "upright", "nonstack").contains(text(entry.getValue()))) {
          throw new IllegalArgumentException("Unsupported mapped package type");
        }
        if (!mapping.equals("typeMapping") && !(entry.getValue() instanceof Boolean)) throw new IllegalArgumentException("Constraint mappings require boolean values");
        String normalizedKey = entry.getKey().trim().toLowerCase(Locale.ROOT);
        if (normalizedKeys.containsKey(normalizedKey) && !normalizedKeys.get(normalizedKey).equals(entry.getValue())) {
          throw new IllegalArgumentException("A source value has conflicting mappings");
        }
        normalizedKeys.put(normalizedKey, entry.getValue());
      }
    }
  }

  private void applySourceConstraints(Map<String, Object> cargo, Map<String, Object> packageInfo,
      Source source, Map<String, Object> plan, List<Integer> rows, List<Map<String, Object>> blocks) {
    boolean nonStack = false, upright = false;
    Set<String> physicalTypes = new HashSet<>();
    for (int row : rows) {
      String rawType = source.mergedText(row, plan.get("typeColumn"));
      if (!rawType.isBlank()) {
        Object mapped = mappedValue(rawType, map(plan.get("typeMapping")));
        String type = mapped == null ? rawType.toLowerCase(Locale.ROOT) : text(mapped);
        switch (type) {
          case "normal", "pallet" -> physicalTypes.add(type);
          case "nonstack" -> nonStack = true;
          case "upright" -> upright = true;
          default -> blocks.add(issue("PACKAGE_TYPE_UNMAPPED", "Source package type needs an explicit mapping: " + rawType, source.name, row));
        }
      }
      for (String field : List.of("nonStack", "keepUpright")) {
        String raw = source.mergedText(row, plan.get(field + "Column"));
        if (raw.isBlank()) continue;
        Object mapped = mappedValue(raw, map(plan.get(field + "Mapping")));
        Boolean value = mapped instanceof Boolean bool ? bool : standardBoolean(raw);
        if (value == null) {
          blocks.add(issue("PACKAGE_CONSTRAINT_UNMAPPED", "Source handling constraint needs an explicit boolean mapping: " + raw, source.name, row));
        } else if (field.equals("nonStack")) {
          nonStack |= value;
        } else {
          upright |= value;
        }
      }
    }
    if (physicalTypes.size() > 1) {
      blocks.add(issue("PACKAGE_TYPE_CONFLICT", "One package has conflicting physical package types", source.name, rows.get(0)));
    }
    String physical = physicalTypes.contains("pallet") ? "pallet" : "normal";
    cargo.put("type", physical);
    cargo.put("nonStack", nonStack);
    cargo.put("keepUpright", upright);
    if (physical.equals("pallet")) {
      packageInfo.put("handlingUnitType", "pallet");
      packageInfo.put("packageUnit", "pallet");
    }
  }

  private static Object mappedValue(String raw, Map<String, Object> mapping) {
    if (mapping.containsKey(raw)) return mapping.get(raw);
    for (Map.Entry<String, Object> entry : mapping.entrySet()) {
      if (entry.getKey().trim().equalsIgnoreCase(raw.trim())) return entry.getValue();
    }
    return null;
  }

  private static Boolean standardBoolean(String raw) {
    return switch (raw.trim().toLowerCase(Locale.ROOT)) {
      case "true", "yes", "1" -> true;
      case "false", "no", "0" -> false;
      default -> null;
    };
  }

  private boolean usesExplicitInnerDimensions(Source source, Map<String, Object> plan) {
    for (String field : List.of("combinedDimensionsColumn", "lengthColumn", "widthColumn", "heightColumn")) {
      if (text(plan.get(field)).isEmpty()) continue;
      for (int row = Math.max(1, integer(plan.get("firstDataRow")) - 4); row < integer(plan.get("firstDataRow")); row++) {
        String header = source.mergedText(row, plan.get(field)).toLowerCase(Locale.ROOT);
        boolean inner = header.contains("inner") || header.contains("内箱") || header.contains("内装");
        boolean carton = header.contains("carton") || header.contains("单箱") || header.contains("纸箱");
        boolean outerPallet = (header.contains("pallet") || header.contains("托盘"))
            && (header.contains("outer") || header.contains("loaded") || header.contains("外廓") || header.contains("装货后"));
        if (inner || (carton && !outerPallet)) return true;
      }
    }
    return false;
  }

  private Map<String, Object> packageCargo(Source source, Map<String, Object> plan, List<Integer> rows,
      Set<String> identities, List<Map<String, Object>> blocks) {
    int anchor = rows.get(0);
    int initialIssueCount = blocks.size();
    String packageNo = source.displayRaw(anchor, plan.get("packageIdColumn"));
    String marks = source.displayRaw(anchor, plan.get("marksColumn"));
    String identity = packageNo.isEmpty() ? marks : packageNo;
    if (identity.isEmpty()) identity = "R" + anchor;
    if (!identities.add(source.name + ":" + identity)) blocks.add(issue("PACKAGE_IDENTITY_DUPLICATE", "Duplicate physical package identity: " + identity, source.name, anchor));
    int quantity = 1;
    if ("quantity-column".equals(plan.get("quantityBasis"))) {
      BigDecimal count = number(source.raw(anchor, plan.get("packageQuantityColumn")));
      quantity = positiveInteger(count);
      if (quantity == 0) blocks.add(issue("PACKAGE_QUANTITY_INVALID", "Physical package count must be a positive integer", source.name, anchor));
    }
    if ("per-identity".equals(plan.get("quantityBasis"))
        && (IDENTITY_RANGE.matcher(packageNo).find() || IDENTITY_RANGE.matcher(marks).find()
            || (packageNo.isEmpty() && marks.matches("[0-9]+(?:[.,][0-9]+)?")))) {
      blocks.add(issue("PACKAGE_IDENTITY_AMBIGUOUS", "The source identity is a range or an unqualified numeric mark; one physical package is not proven", source.name, anchor));
    }
    BigDecimal gross = uniqueNumber(source, plan.get("grossWeightColumn"), rows, "PACKAGE_GROSS_WEIGHT_MISSING", blocks);
    BigDecimal net = uniqueNumber(source, plan.get("netWeightColumn"), rows, "", blocks);
    BigDecimal factor = weightFactor(text(plan.get("weightUnit")));
    gross = gross == null ? BigDecimal.ZERO : gross.multiply(factor);
    net = net == null ? BigDecimal.ZERO : net.multiply(factor);
    if ("group-total".equals(plan.get("weightBasis")) && quantity > 0) {
      gross = gross.divide(BigDecimal.valueOf(quantity), 12, RoundingMode.HALF_UP);
      net = net.divide(BigDecimal.valueOf(quantity), 12, RoundingMode.HALF_UP);
    }
    if (net.compareTo(gross) > 0) blocks.add(issue("PACKAGE_WEIGHT_CONFLICT", "Package net weight exceeds its gross weight", source.name, anchor));
    List<BigDecimal> dimensions = dimensions(source, plan, rows, blocks);
    List<Map<String, Object>> inner = new ArrayList<>();
    Set<String> seenQuantityCells = new HashSet<>();
    for (int row : rows) {
      String name = source.mergedText(row, plan.get("nameColumn")), model = source.mergedText(row, plan.get("modelColumn"));
      String rawCount = source.raw(row, plan.get("innerQuantityColumn"));
      if (rawCount.isEmpty() && name.isEmpty() && model.isEmpty()) continue;
      if (!text(plan.get("innerQuantityColumn")).isEmpty() && !rawCount.isEmpty()) {
        String cell = source.anchor(row, column(text(plan.get("innerQuantityColumn"))));
        if (!seenQuantityCells.add(cell)) continue;
      }
      Map<String, Object> line = new LinkedHashMap<>();
      line.put("name", name); line.put("model", model); line.put("sourceRowNumber", row);
      if (!text(plan.get("innerQuantityColumn")).isEmpty()) {
        int count = positiveInteger(number(rawCount));
        if (count == 0) {
          blocks.add(issue("PACKAGE_CONTENT_QUANTITY_INVALID", "A product row has no positive inner quantity", source.name, row));
        }
        line.put("quantity", count);
      }
      BigDecimal unitNet = number(source.raw(row, plan.get("innerUnitWeightColumn")));
      if (unitNet != null) line.put("unitNetWeightKg", unitNet.multiply(factor).doubleValue());
      inner.add(line);
    }
    Long innerQuantity = text(plan.get("innerQuantityColumn")).isEmpty() ? null
        : inner.stream().mapToLong(line -> ((Number) line.getOrDefault("quantity", 0)).longValue()).sum();
    if (innerQuantity != null && innerQuantity > Integer.MAX_VALUE) blocks.add(issue("PACKAGE_CONTENT_QUANTITY_OVERFLOW", "Inner quantity exceeds the supported integer range", source.name, anchor));
    if (inner.isEmpty()) blocks.add(issue("PACKAGE_CONTENT_MISSING", "Package has no source product details", source.name, anchor));
    Map<String, Object> packageInfo = new LinkedHashMap<>();
    packageInfo.put("handlingUnitType", "package");
    packageInfo.put("packageUnit", "package");
    boolean packageGroup = "quantity-column".equals(plan.get("quantityBasis")) && quantity > 1;
    packageInfo.put("algorithmBasis", packageGroup ? "source-package-group" : "source-explicit-package");
    if (packageGroup) {
      packageInfo.put("packageGroupId", source.name + "!R" + anchor);
      if (!packageNo.isEmpty()) packageInfo.put("groupPackageNo", packageNo);
      if (!marks.isEmpty()) packageInfo.put("groupMarks", marks);
    } else {
      if (!packageNo.isEmpty()) packageInfo.put("packageNo", packageNo);
      if (!marks.isEmpty()) packageInfo.put("marks", marks);
    }
    packageInfo.put("sourceSheet", source.name);
    packageInfo.put("sourceRows", List.copyOf(rows));
    packageInfo.put("sourceRange", "R" + anchor + ":R" + rows.get(rows.size() - 1));
    packageInfo.put("packageQuantity", quantity);
    packageInfo.put("packageGrossWeightKg", gross.doubleValue());
    packageInfo.put("packageNetWeightKg", net.doubleValue());
    packageInfo.put("dimensionSource", "explicit");
    packageInfo.put("handlingUnitDimensionsExplicit", dimensions.stream().allMatch(value -> value.signum() > 0));
    Map<String, Object> contents = new LinkedHashMap<>();
    if (innerQuantity != null) contents.put("quantityUnit", "pcs");
    contents.put("totalQuantity", innerQuantity); contents.put("lines", inner);
    packageInfo.put("innerCargo", contents);
    if (blocks.size() > initialIssueCount) packageInfo.put("sourceIssues", List.copyOf(blocks.subList(initialIssueCount, blocks.size())));
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("name", inner.isEmpty() ? "Package " + identity : inner.get(0).get("name"));
    cargo.put("model", inner.size() == 1 ? inner.get(0).getOrDefault("model", "") : "Mixed package");
    cargo.put("quantity", quantity);
    cargo.put("weightKg", gross.doubleValue());
    cargo.put("lengthCm", dimensions.get(0).doubleValue());
    cargo.put("widthCm", dimensions.get(1).doubleValue());
    cargo.put("heightCm", dimensions.get(2).doubleValue());
    cargo.put("sourceSheet", source.name);
    if (packageGroup) cargo.put("packageGroupId", packageInfo.get("packageGroupId"));
    else {
      if (packageInfo.containsKey("packageNo")) cargo.put("packageNo", packageInfo.get("packageNo"));
      if (packageInfo.containsKey("marks")) cargo.put("marks", marks);
    }
    applySourceConstraints(cargo, packageInfo, source, plan, rows, blocks);
    if ("pallet".equals(cargo.get("type")) && usesExplicitInnerDimensions(source, plan)) {
      cargo.put("lengthCm", 0.0); cargo.put("widthCm", 0.0); cargo.put("heightCm", 0.0);
      packageInfo.put("handlingUnitDimensionsExplicit", false);
      packageInfo.put("dimensionSource", "inner-package-only");
      blocks.add(issue("PACKAGE_DIMENSIONS_INNER_ONLY", "Inner/carton dimensions cannot prove the outer dimensions of a loaded pallet", source.name, anchor));
    }
    cargo.put("sourceRowNumber", anchor); cargo.put("sourceRowNumbers", List.copyOf(rows));
    cargo.put("sourceRange", packageInfo.get("sourceRange")); cargo.put("packageInfo", packageInfo);
    String sourceRemark = rows.stream().map(row -> source.mergedText(row, plan.get("remarkColumn")))
        .filter(value -> !value.isBlank()).distinct().reduce((left, right) -> left + " / " + right).orElse("");
    cargo.put("remark", "Package " + identity + (marks.isEmpty() ? "" : " · " + marks) + "; "
        + (innerQuantity == null ? "inner quantity not provided; " : innerQuantity + " inner pieces; ") + rows.size() + " source rows"
        + (sourceRemark.isEmpty() ? "" : "; " + sourceRemark));
    if (blocks.size() > initialIssueCount) packageInfo.put("sourceIssues", List.copyOf(blocks.subList(initialIssueCount, blocks.size())));
    return cargo;
  }

  private List<BigDecimal> dimensions(Source source, Map<String, Object> plan, List<Integer> rows, List<Map<String, Object>> blocks) {
    List<BigDecimal> result = List.of(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
    String combined = text(plan.get("combinedDimensionsColumn"));
    if (!combined.isEmpty()) {
      Set<String> values = new LinkedHashSet<>();
      for (int row : rows) {
        String value = source.merged(row, combined);
        if (!value.isEmpty()) values.add(value);
      }
      if (values.size() == 1) {
        Matcher matcher = DIMENSIONS.matcher(values.iterator().next());
        if (matcher.matches()) {
          boolean matchingUnits = true;
          for (int group : List.of(2, 4, 6)) {
            if (matcher.group(group) != null && !matcher.group(group).equalsIgnoreCase(text(plan.get("dimensionUnit")))) matchingUnits = false;
          }
          if (matchingUnits) result = List.of(new BigDecimal(matcher.group(1)), new BigDecimal(matcher.group(3)), new BigDecimal(matcher.group(5)));
        }
      }
    } else {
      BigDecimal length = uniqueNumber(source, plan.get("lengthColumn"), rows, "", blocks);
      BigDecimal width = uniqueNumber(source, plan.get("widthColumn"), rows, "", blocks);
      BigDecimal height = uniqueNumber(source, plan.get("heightColumn"), rows, "", blocks);
      if (length != null && width != null && height != null) result = List.of(length, width, height);
    }
    if (result.stream().anyMatch(value -> value.signum() <= 0)) {
      blocks.add(issue("PACKAGE_DIMENSIONS_MISSING", "Package outer dimensions are missing, conflicting, or incompatible with the mapped unit", source.name, rows.get(0)));
    }
    BigDecimal factor = dimensionFactor(text(plan.get("dimensionUnit")));
    return result.stream().map(value -> value.multiply(factor)).toList();
  }

  private BigDecimal uniqueNumber(Source source, Object column, List<Integer> rows, String missingCode, List<Map<String, Object>> blocks) {
    Set<BigDecimal> values = new LinkedHashSet<>();
    boolean invalid = false;
    for (int row : rows) {
      String raw = source.merged(row, column);
      if (raw.isEmpty()) continue;
      BigDecimal value = number(raw);
      if (value == null || value.signum() <= 0) invalid = true;
      else values.add(value.stripTrailingZeros());
    }
    if (values.size() == 1 && !invalid) return values.iterator().next();
    if (!missingCode.isEmpty() || invalid || values.size() > 1) {
      blocks.add(issue(missingCode.isEmpty() ? "PACKAGE_SOURCE_VALUE_CONFLICT" : missingCode,
          "A mapped package value is missing, invalid, or inconsistent across its rows", source.name, rows.get(0)));
    }
    return null;
  }

  private Map<String, Object> totals(List<Map<String, Object>> cargos) {
    BigDecimal gross = BigDecimal.ZERO, net = BigDecimal.ZERO, volume = BigDecimal.ZERO;
    long quantity = 0, innerQuantity = 0;
    boolean innerQuantityKnown = true;
    for (Map<String, Object> cargo : cargos) {
      int count = integer(cargo.get("quantity"));
      quantity += count;
      Map<String, Object> info = map(cargo.get("packageInfo"));
      Object innerCount = map(info.get("innerCargo")).get("totalQuantity");
      if (innerCount instanceof Number number) innerQuantity += number.longValue();
      else innerQuantityKnown = false;
      gross = gross.add(BigDecimal.valueOf(((Number) cargo.get("weightKg")).doubleValue()).multiply(BigDecimal.valueOf(count)));
      net = net.add(BigDecimal.valueOf(((Number) info.get("packageNetWeightKg")).doubleValue()).multiply(BigDecimal.valueOf(count)));
      volume = volume.add(BigDecimal.valueOf(((Number) cargo.get("lengthCm")).doubleValue())
          .multiply(BigDecimal.valueOf(((Number) cargo.get("widthCm")).doubleValue()))
          .multiply(BigDecimal.valueOf(((Number) cargo.get("heightCm")).doubleValue())).multiply(BigDecimal.valueOf(count)));
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("packageCount", quantity); result.put("innerQuantity", innerQuantityKnown ? innerQuantity : null);
    result.put("grossWeightKg", gross.doubleValue()); result.put("netWeightKg", net.doubleValue());
    result.put("calculatedVolumeM3", volume.movePointLeft(6).doubleValue());
    return result;
  }

  private static BigDecimal dimensionFactor(String unit) {
    return switch (unit) { case "mm" -> new BigDecimal("0.1"); case "cm" -> BigDecimal.ONE; case "m" -> BigDecimal.valueOf(100); default -> throw new IllegalArgumentException("Explicit dimension unit is required"); };
  }
  private static BigDecimal weightFactor(String unit) {
    return switch (unit) { case "kg" -> BigDecimal.ONE; case "g" -> new BigDecimal("0.001"); case "t" -> BigDecimal.valueOf(1000); default -> throw new IllegalArgumentException("Explicit weight unit is required"); };
  }
  private static BigDecimal number(Object value) {
    String text = text(value);
    if (text.matches("[+-]?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?")) text = text.replace(",", "");
    if (!text.matches("[+-]?\\d+(?:\\.\\d+)?")) return null;
    try { return new BigDecimal(text); } catch (NumberFormatException error) { return null; }
  }
  private static int positiveInteger(BigDecimal value) {
    if (value == null || value.signum() <= 0 || value.compareTo(BigDecimal.valueOf(Integer.MAX_VALUE)) > 0) return 0;
    try { return value.intValueExact(); } catch (ArithmeticException error) { return 0; }
  }
  private static int integer(Object value) { return value instanceof Number number ? number.intValue() : 0; }
  private static int column(String value) { return WorkbookEvidenceService.coordinate(value.toUpperCase(Locale.ROOT) + "1")[1]; }
  private static String text(Object value) {
    if (value == null) return "";
    if (value instanceof Number number) {
      try { return new BigDecimal(number.toString()).stripTrailingZeros().toPlainString(); }
      catch (NumberFormatException ignored) { return number.toString(); }
    }
    return String.valueOf(value).trim();
  }
  @SuppressWarnings("unchecked")
  private static Map<String, Object> map(Object value) { return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of(); }
  private static Map<String, Object> issue(String code, String message, String sheet, int row) {
    return Map.of("code", code, "message", message, "errors", List.of(message), "sourceSheet", sheet, "sourceRowNumber", row, "rowNumber", row);
  }

  private static final class Source {
    private final String name;
    private final int rowCount, columnCount;
    private final Map<String, Object> cells = new HashMap<>();
    private final Map<String, String> displays = new HashMap<>();
    private final List<Map<String, Object>> merges;
    private Source(Map<String, Object> sheet) {
      name = text(sheet.get("name")); rowCount = integer(sheet.get("rowCount")); columnCount = integer(sheet.get("columnCount"));
      for (Map<String, Object> cell : WorkbookEvidenceService.list(sheet.get("cells"))) {
        String address = text(cell.get("address"));
        cells.put(address, cell.get("value"));
        if (cell.get("displayValue") != null) displays.put(address, text(cell.get("displayValue")));
      }
      merges = WorkbookEvidenceService.list(sheet.get("merges"));
    }
    private String at(int row, int column) { return text(cells.get(WorkbookEvidenceService.address(row, column))); }
    private String raw(int row, Object column) { return text(column).isEmpty() ? "" : at(row, column(text(column))); }
    private String displayRaw(int row, Object column) {
      if (text(column).isEmpty()) return "";
      String address = WorkbookEvidenceService.address(row, column(text(column)));
      return displays.getOrDefault(address, text(cells.get(address)));
    }
    private String merged(int row, Object column) {
      if (text(column).isEmpty()) return "";
      return text(cells.get(anchor(row, column(text(column)))));
    }
    private String mergedText(int row, Object column) {
      if (text(column).isEmpty()) return "";
      String address = anchor(row, column(text(column)));
      return displays.getOrDefault(address, text(cells.get(address)));
    }
    private String anchor(int row, int column) {
      for (Map<String, Object> merge : merges) {
        if (row >= integer(merge.get("firstRow")) && row <= integer(merge.get("lastRow"))
            && column >= integer(merge.get("firstColumn")) && column <= integer(merge.get("lastColumn"))) {
          return WorkbookEvidenceService.address(integer(merge.get("firstRow")), integer(merge.get("firstColumn")));
        }
      }
      return WorkbookEvidenceService.address(row, column);
    }
    private boolean hasMappedData(int row, Map<String, Object> plan) {
      return COLUMN_FIELDS.stream().anyMatch(field -> !raw(row, plan.get(field)).isEmpty());
    }
  }
}
