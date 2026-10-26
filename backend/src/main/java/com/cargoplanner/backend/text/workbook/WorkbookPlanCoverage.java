package com.cargoplanner.backend.text.workbook;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Independent whole-sheet coverage checks using proposed coordinates, never customer header aliases. */
public final class WorkbookPlanCoverage {
  private static final List<String> NUMERIC_FIELDS = List.of("packageQuantityColumn", "innerQuantityColumn",
      "innerUnitWeightColumn", "grossWeightColumn", "netWeightColumn", "lengthColumn", "widthColumn", "heightColumn",
      "combinedDimensionsColumn");
  private static final Pattern TRIPLE_DIMENSIONS = Pattern.compile(
      "(?i).*\\d+(?:[.,]\\d+)?\\s*(?:mm|cm|m)?\\s*[x×*]\\s*\\d+(?:[.,]\\d+)?\\s*(?:mm|cm|m)?\\s*[x×*]\\s*\\d+(?:[.,]\\d+)?.*");

  private WorkbookPlanCoverage() {}

  public static List<Map<String, Object>> issues(Map<String, Object> document, Map<String, Object> proposed) {
    List<Map<String, Object>> issues = new ArrayList<>();
    Map<String, Map<String, Object>> sheets = new LinkedHashMap<>();
    for (Map<String, Object> sheet : WorkbookEvidenceService.list(document.get("sheets"))) {
      sheets.put(text(sheet.get("name")), sheet);
    }
    Map<String, List<Map<String, Object>>> selected = new LinkedHashMap<>();
    for (Map<String, Object> plan : WorkbookEvidenceService.list(proposed.get("plans"))) {
      String name = text(plan.get("sheet"));
      if (!sheets.containsKey(name)) {
        issues.add(scopeIssue("A plan references an unknown sheet", name));
        continue;
      }
      selected.computeIfAbsent(name, unused -> new ArrayList<>()).add(plan);
    }
    Set<String> ignored = ignoredSheets(proposed, sheets.keySet(), selected.keySet(), issues);
    for (Map.Entry<String, Map<String, Object>> entry : sheets.entrySet()) {
      String name = entry.getKey();
      Map<String, Object> sheet = entry.getValue();
      List<Map<String, Object>> plans = selected.getOrDefault(name, List.of());
      if (plans.isEmpty()) {
        if (!ignored.contains(name) && hasEvidence(sheet)) {
          issues.add(issue("UNMAPPED_SOURCE_SHEET", "A non-empty worksheet was neither mapped nor explicitly ignored", name, List.of()));
        }
        continue;
      }
      Source source = new Source(sheet);
      List<Integer> uncovered = new ArrayList<>();
      for (int row : source.rows()) {
        if (plans.stream().anyMatch(plan -> within(row, integer(plan.get("firstDataRow")), integer(plan.get("lastDataRow"))))) continue;
        boolean business = false;
        boolean control = false;
        for (Map<String, Object> plan : plans) {
          if (!isBusinessRow(source, plan, row)) continue;
          business = true;
          if (isExplicitControlRow(source, plan, row)) control = true;
          else {
            control = false;
            break;
          }
        }
        if (business && !control) uncovered.add(row);
      }
      if (!uncovered.isEmpty()) {
        issues.add(issue("UNMAPPED_SOURCE_ROWS",
            "Source rows with package or product evidence remain outside every mapping region; a partial table cannot be accepted",
            name, uncovered));
      }
    }
    return issues;
  }

  private static Set<String> ignoredSheets(Map<String, Object> proposed, Set<String> available,
      Set<String> selected, List<Map<String, Object>> issues) {
    Object rawIgnored = proposed.get("ignoredSheets");
    if (rawIgnored == null) return Set.of();
    if (!(rawIgnored instanceof List<?> values)) {
      issues.add(scopeIssue("ignoredSheets must be an array", ""));
      return Set.of();
    }
    Set<String> ignored = new HashSet<>();
    for (Object value : values) {
      if (!(value instanceof Map<?, ?> item)) {
        issues.add(scopeIssue("An ignored-sheet declaration must be an object", ""));
        continue;
      }
      String name = item.get("sheet") instanceof String text ? text.trim() : "";
      String reason = item.get("reason") instanceof String text ? text.trim() : "";
      if (!item.keySet().equals(Set.of("sheet", "reason")) || !available.contains(name) || reason.isEmpty()
          || reason.length() > 1000 || selected.contains(name) || !ignored.add(name)) {
        issues.add(scopeIssue("Ignored sheets need a unique known sheet, a non-empty reason, and no mapping plan for the same sheet", name));
      }
    }
    return ignored;
  }

  private static boolean isBusinessRow(Source source, Map<String, Object> plan, int row) {
    boolean identity = !source.raw(row, plan.get("packageIdColumn")).isEmpty()
        || !source.raw(row, plan.get("marksColumn")).isEmpty();
    boolean content = !source.raw(row, plan.get("nameColumn")).isEmpty()
        || !source.raw(row, plan.get("modelColumn")).isEmpty();
    boolean dimensions = hasDimensions(source, plan, row);
    boolean numeric = NUMERIC_FIELDS.stream().anyMatch(field -> numeric(source.raw(row, plan.get(field))));
    boolean productCount = numeric(source.raw(row, plan.get("innerQuantityColumn")));
    boolean gross = numeric(source.raw(row, plan.get("grossWeightColumn")));
    return (identity && (numeric || dimensions)) || (content && productCount)
        || (dimensions && (content || gross));
  }

  private static boolean isExplicitControlRow(Source source, Map<String, Object> plan, int row) {
    // An actual package row with its outer dimensions cannot be hidden by declaring its weight a total.
    if (hasDimensions(source, plan, row)) return false;
    Object rawTotals = plan.get("totals");
    if (!(rawTotals instanceof Map<?, ?> totals)) return false;
    Set<String> controls = new HashSet<>();
    for (Object address : totals.values()) {
      if (address instanceof String cell) controls.add(cell);
    }
    Set<String> numericEvidence = new LinkedHashSet<>();
    for (String field : NUMERIC_FIELDS) {
      Object rawColumn = plan.get(field);
      String column = text(rawColumn);
      if (!column.isEmpty() && numeric(source.raw(row, rawColumn))) numericEvidence.add(column + row);
    }
    return !numericEvidence.isEmpty() && controls.containsAll(numericEvidence);
  }

  private static boolean hasDimensions(Source source, Map<String, Object> plan, int row) {
    String combined = source.raw(row, plan.get("combinedDimensionsColumn"));
    if (TRIPLE_DIMENSIONS.matcher(combined).matches()) return true;
    return numeric(source.raw(row, plan.get("lengthColumn")))
        && numeric(source.raw(row, plan.get("widthColumn")))
        && numeric(source.raw(row, plan.get("heightColumn")));
  }

  private static boolean numeric(String value) {
    if (value.isEmpty()) return false;
    String normalized = value.matches("[+-]?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?") ? value.replace(",", "") : value;
    try {
      new BigDecimal(normalized);
      return true;
    } catch (NumberFormatException error) {
      return false;
    }
  }

  private static boolean hasEvidence(Map<String, Object> sheet) {
    return WorkbookEvidenceService.list(sheet.get("cells")).stream().anyMatch(cell ->
        !text(cell.get("value")).isEmpty() || !text(cell.get("displayValue")).isEmpty() || !text(cell.get("formula")).isEmpty());
  }

  private static boolean within(int value, int first, int last) { return first > 0 && value >= first && value <= last; }
  private static int integer(Object value) { return value instanceof Number number ? number.intValue() : 0; }
  private static String text(Object value) { return value == null ? "" : String.valueOf(value).trim(); }

  private static Map<String, Object> scopeIssue(String message, String sheet) {
    return issue("WORKBOOK_SHEET_SCOPE_INVALID", message, sheet, List.of());
  }

  private static Map<String, Object> issue(String code, String message, String sheet, List<Integer> rows) {
    Map<String, Object> issue = new LinkedHashMap<>();
    issue.put("code", code); issue.put("message", message); issue.put("errors", List.of(message));
    issue.put("sourceSheet", sheet); issue.put("sourceRowNumber", rows.isEmpty() ? 0 : rows.get(0));
    issue.put("rowNumber", rows.isEmpty() ? 0 : rows.get(0));
    issue.put("sourceRowNumbers", rows.size() <= 200 ? List.copyOf(rows) : List.copyOf(rows.subList(0, 200)));
    issue.put("unmappedRowCount", rows.size());
    issue.put("sourceRowNumbersTruncated", rows.size() > 200);
    return issue;
  }

  private static final class Source {
    private final Map<String, Map<Integer, Object>> values = new HashMap<>();
    private final Set<Integer> rows = new java.util.TreeSet<>();

    private Source(Map<String, Object> sheet) {
      for (Map<String, Object> cell : WorkbookEvidenceService.list(sheet.get("cells"))) {
        String address = text(cell.get("address"));
        if (address.isEmpty()) continue;
        int row = integer(cell.get("row"));
        rows.add(row);
        values.computeIfAbsent(address.replaceAll("[0-9]+$", ""), unused -> new HashMap<>()).put(row, cell.get("value"));
      }
    }

    private Set<Integer> rows() { return rows; }
    private String raw(int row, Object column) {
      return text(column).isEmpty() ? "" : text(values.getOrDefault(text(column), Map.of()).get(row));
    }
  }
}
