package com.cargoplanner.backend.cargoimport;

import com.cargoplanner.backend.common.ApiException;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class CargoImportParseService {
  private static final int VALID_ROW_SAMPLE_LIMIT = 500;
  private static final Pattern NUMBER_PATTERN = Pattern.compile("-?\\d+(?:\\.\\d+)?");
  private static final Pattern DIMENSION_NUMBER_PATTERN = Pattern.compile("\\d+(?:\\.\\d+)?");
  private static final Pattern HAS_NAME_PATTERN = Pattern.compile(".*[\\p{IsHan}A-Za-z].*");

  private static final List<FieldDef> STANDARD_FIELDS = List.of(
      new FieldDef("name", true),
      new FieldDef("model", false),
      new FieldDef("lengthCm", true),
      new FieldDef("widthCm", true),
      new FieldDef("heightCm", true),
      new FieldDef("quantity", true),
      new FieldDef("weightKg", true),
      new FieldDef("totalWeightKg", false),
      new FieldDef("type", false),
      new FieldDef("nonStack", false),
      new FieldDef("keepUpright", false),
      new FieldDef("color", false),
      new FieldDef("id", false),
      new FieldDef("remark", false),
      new FieldDef("dimensionText", false)
  );

  private static final Map<String, List<String>> FIELD_ALIASES = Map.ofEntries(
      Map.entry("name", List.of("name", "cargo", "cargoname", "goods", "goodsname", "product", "item",
          "\u8d27\u7269", "\u8d27\u7269\u540d\u79f0", "\u8d27\u540d", "\u540d\u79f0", "\u54c1\u540d", "\u4ea7\u54c1\u540d\u79f0", "\u7bb1\u540d")),
      Map.entry("model", List.of("model", "spec", "specification", "specmodel", "variant",
          "\u578b\u53f7", "\u89c4\u683c", "\u89c4\u683c\u578b\u53f7", "\u4ea7\u54c1\u578b\u53f7", "\u8d27\u7269\u578b\u53f7")),
      Map.entry("lengthCm", List.of("lengthcm", "length", "len", "l",
          "\u957f", "\u957f\u5ea6", "\u5916\u957f", "\u957fcm", "\u957f\u5ea6cm", "\u957fmm", "\u957f\u5ea6mm", "\u957fm", "\u957f\u5ea6m")),
      Map.entry("widthCm", List.of("widthcm", "width", "wid", "w",
          "\u5bbd", "\u5bbd\u5ea6", "\u5916\u5bbd", "\u5bbdcm", "\u5bbd\u5ea6cm", "\u5bbdmm", "\u5bbd\u5ea6mm", "\u5bbdm", "\u5bbd\u5ea6m")),
      Map.entry("heightCm", List.of("heightcm", "height", "h",
          "\u9ad8", "\u9ad8\u5ea6", "\u5916\u9ad8", "\u9ad8cm", "\u9ad8\u5ea6cm", "\u9ad8mm", "\u9ad8\u5ea6mm", "\u9ad8m", "\u9ad8\u5ea6m")),
      Map.entry("quantity", List.of("quantity", "qty", "count", "num", "pcs", "pieces", "palletqty", "pallets", "skids",
          "\u6570\u91cf", "\u4ef6\u6570", "\u7bb1\u6570", "\u4e2a\u6570", "\u603b\u4ef6\u6570", "\u6258\u76d8\u6570", "\u6258\u6570", "\u6808\u677f\u6570")),
      Map.entry("weightKg", List.of("weightkg", "unitweight", "unitweightkg", "weight", "netweight",
          "\u5355\u91cd", "\u5355\u4ef6\u91cd\u91cf", "\u6bcf\u4ef6\u91cd\u91cf", "\u91cd\u91cfkg", "\u5355\u91cdkg", "\u51c0\u91cdkg")),
      Map.entry("totalWeightKg", List.of("totalweight", "totalweightkg", "grossweight", "totalgrossweight",
          "\u603b\u91cd", "\u603b\u91cd\u91cf", "\u603b\u6bdb\u91cd", "\u6bdb\u91cd", "\u5408\u8ba1\u91cd\u91cf")),
      Map.entry("type", List.of("type", "cargotype", "rule", "stackrule",
          "\u7c7b\u578b", "\u8d27\u7269\u7c7b\u578b", "\u89c4\u5219", "\u6446\u653e\u89c4\u5219", "\u5806\u53e0\u89c4\u5219", "\u5c5e\u6027")),
      Map.entry("nonStack", List.of("nonstack", "nonstackable",
          "\u4e0d\u53ef\u91cd\u538b", "\u4e0d\u80fd\u91cd\u538b", "\u7981\u6b62\u91cd\u538b", "\u6613\u788e", "\u627f\u538b\u9650\u5236")),
      Map.entry("keepUpright", List.of("keepupright", "upright",
          "\u4fdd\u6301\u671d\u4e0a", "\u671d\u4e0a", "\u4e0d\u53ef\u5012\u7f6e", "\u65b9\u5411\u9650\u5236")),
      Map.entry("color", List.of("color", "\u989c\u8272", "\u8272\u503c", "\u663e\u793a\u989c\u8272")),
      Map.entry("id", List.of("id", "sku", "code", "cargoid", "goodsid", "productid",
          "\u8d27\u7269id", "\u8d27\u7269\u7f16\u53f7", "\u8d27\u53f7", "\u7f16\u53f7", "\u7269\u6599\u7f16\u7801", "\u4ea7\u54c1\u7f16\u53f7", "\u6761\u7801")),
      Map.entry("remark", List.of("remark", "remarks", "note", "notes", "comment",
          "\u5907\u6ce8", "\u8bf4\u660e", "\u7279\u6b8a\u8981\u6c42", "\u88c5\u7bb1\u8981\u6c42")),
      Map.entry("dimensionText", List.of("dimension", "dimensions", "size", "sizes",
          "palletsize", "skidsize", "packagesize",
          "\u5c3a\u5bf8", "\u89c4\u683c", "\u5916\u5c3a\u5bf8", "\u957f\u5bbd\u9ad8", "\u5c3a\u5bf8cm", "\u5c3a\u5bf8mm", "\u89c4\u683c\u5c3a\u5bf8",
          "\u6258\u76d8\u5c3a\u5bf8", "\u6258\u76d8\u5c3a\u5bf8cm", "\u6808\u677f\u5c3a\u5bf8", "\u5305\u88c5\u5c3a\u5bf8"))
  );

  private static final List<TypeAlias> TYPE_ALIASES = List.of(
      new TypeAlias("nonstack", List.of("\u4e0d\u53ef\u91cd\u538b", "\u4e0d\u80fd\u91cd\u538b", "\u52ff\u538b", "\u6613\u788e", "fragile", "nonstack", "non-stack", "no stack")),
      new TypeAlias("pallet", List.of("\u6258\u76d8", "\u6728\u7bb1", "\u6808\u677f", "pallet", "wooden", "wood")),
      new TypeAlias("upright", List.of("\u5411\u4e0a", "\u671d\u4e0a", "\u4e0d\u53ef\u5012\u7f6e", "\u4fdd\u6301\u671d\u4e0a", "upright", "this side up")),
      new TypeAlias("normal", List.of("\u666e\u901a", "\u53ef\u5806\u53e0", "normal", "standard"))
  );

  public Map<String, Object> parse(Path filePath, String originalFileName) {
    String fileName = originalFileName == null ? filePath.getFileName().toString() : originalFileName;
    String lower = fileName.toLowerCase(Locale.ROOT);
    try {
      ParseBundle bundle;
      if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
        char delimiter = lower.endsWith(".tsv") ? '\t' : ',';
        bundle = parseDelimited(filePath, fileName, delimiter);
      } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        bundle = parseWorkbook(filePath, fileName);
      } else {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Only Excel, CSV, or TSV files are supported");
      }
      return buildResponse(fileName, bundle);
    } catch (ApiException error) {
      throw error;
    } catch (Exception error) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to parse uploaded file");
    }
  }

  private ParseBundle parseWorkbook(Path filePath, String fileName) throws IOException {
    List<Map<String, Object>> sheets = new ArrayList<>();
    List<ParsedRow> rows = new ArrayList<>();
    DataFormatter formatter = new DataFormatter(Locale.ROOT);
    try (InputStream input = Files.newInputStream(filePath); Workbook workbook = WorkbookFactory.create(input)) {
      for (int sheetIndex = 0; sheetIndex < workbook.getNumberOfSheets(); sheetIndex++) {
        Sheet sheet = workbook.getSheetAt(sheetIndex);
        SheetParseResult sheetResult = parseSheet(sheet.getSheetName(), readSheetRows(sheet, formatter));
        sheets.add(sheetResult.summary());
        rows.addAll(sheetResult.rows());
      }
    }
    return new ParseBundle(fileName, sheets, rows);
  }

  private ParseBundle parseDelimited(Path filePath, String fileName, char delimiter) throws IOException {
    List<List<String>> table = readDelimitedRows(filePath, delimiter);
    SheetParseResult sheetResult = parseSheet(fileName.endsWith(".tsv") ? "TSV" : "CSV", table);
    return new ParseBundle(fileName, List.of(sheetResult.summary()), sheetResult.rows());
  }

  private List<List<String>> readSheetRows(Sheet sheet, DataFormatter formatter) {
    List<List<String>> rows = new ArrayList<>();
    int lastRow = sheet.getLastRowNum();
    for (int rowIndex = 0; rowIndex <= lastRow; rowIndex++) {
      Row row = sheet.getRow(rowIndex);
      if (row == null) {
        rows.add(List.of());
        continue;
      }
      int lastCell = Math.max(row.getLastCellNum(), (short) 0);
      List<String> cells = new ArrayList<>();
      for (int cellIndex = 0; cellIndex < lastCell; cellIndex++) {
        cells.add(cleanCell(formatter.formatCellValue(row.getCell(cellIndex))));
      }
      rows.add(cells);
    }
    return rows;
  }

  private List<List<String>> readDelimitedRows(Path filePath, char delimiter) throws IOException {
    byte[] bytes = Files.readAllBytes(filePath);
    Charset charset = detectCharset(bytes);
    int offset = hasUtf8Bom(bytes) ? 3 : 0;
    List<List<String>> rows = new ArrayList<>();
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(new ByteArrayInputStream(bytes, offset, bytes.length - offset), charset))) {
      String line;
      while ((line = reader.readLine()) != null) {
        rows.add(parseDelimitedLine(line, delimiter));
      }
    }
    return rows;
  }

  private Charset detectCharset(byte[] bytes) {
    if (hasUtf8Bom(bytes)) return StandardCharsets.UTF_8;
    try {
      StandardCharsets.UTF_8.newDecoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT)
          .decode(ByteBuffer.wrap(bytes));
      return StandardCharsets.UTF_8;
    } catch (CharacterCodingException error) {
      return Charset.forName("GB18030");
    }
  }

  private boolean hasUtf8Bom(byte[] bytes) {
    return bytes.length >= 3
        && (bytes[0] & 0xFF) == 0xEF
        && (bytes[1] & 0xFF) == 0xBB
        && (bytes[2] & 0xFF) == 0xBF;
  }

  private List<String> parseDelimitedLine(String line, char delimiter) {
    List<String> cells = new ArrayList<>();
    StringBuilder cell = new StringBuilder();
    boolean quoted = false;
    for (int i = 0; i < line.length(); i++) {
      char ch = line.charAt(i);
      if (ch == '"') {
        if (quoted && i + 1 < line.length() && line.charAt(i + 1) == '"') {
          cell.append('"');
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch == delimiter && !quoted) {
        cells.add(cleanCell(cell.toString()));
        cell.setLength(0);
      } else {
        cell.append(ch);
      }
    }
    cells.add(cleanCell(cell.toString()));
    return cells;
  }

  private SheetParseResult parseSheet(String sheetName, List<List<String>> rows) {
    if (rows == null || rows.isEmpty()) {
      return new SheetParseResult(sheetSummary(sheetName, 0, List.of(), Map.of(), 0), List.of());
    }
    int headerRowIndex = findHeaderRow(rows);
    List<String> headers = uniquifyHeaders(cleanCells(rows.get(headerRowIndex)));
    Map<String, String> mapping = refineMapping(headers, guessMapping(headers));
    List<ParsedRow> parsed = new ArrayList<>();
    for (int rowIndex = headerRowIndex + 1; rowIndex < rows.size(); rowIndex++) {
      List<String> cells = padRow(rows.get(rowIndex), headers.size());
      if (cells.stream().allMatch(String::isBlank)) continue;
      Map<String, String> raw = rowObject(headers, cells);
      if (shouldSkipDataRow(raw, mapping, cells)) continue;
      parsed.add(parseCargoRow(sheetName, rowIndex + 1, raw, mapping));
    }
    return new SheetParseResult(sheetSummary(sheetName, headerRowIndex, headers, mapping, parsed.size()), parsed);
  }

  private Map<String, Object> buildResponse(String fileName, ParseBundle bundle) {
    List<Map<String, Object>> validRows = new ArrayList<>();
    List<Map<String, Object>> invalidRows = new ArrayList<>();
    List<Map<String, Object>> validCargos = new ArrayList<>();

    for (ParsedRow row : bundle.rows()) {
      Map<String, Object> mapped = row.toMap();
      if (row.errors().isEmpty()) {
        if (validRows.size() < VALID_ROW_SAMPLE_LIMIT) validRows.add(mapped);
        validCargos.add(row.cargo());
      } else {
        invalidRows.add(mapped);
      }
    }

    List<Map<String, Object>> aggregated = aggregateCargos(validCargos);
    int importedQuantity = aggregated.stream().mapToInt((cargo) -> intValue(cargo.get("quantity"))).sum();

    Map<String, Object> preview = new LinkedHashMap<>();
    preview.put("totalRows", bundle.rows().size());
    preview.put("validRowCount", validCargos.size());
    preview.put("invalidRowCount", invalidRows.size());
    preview.put("validRows", validRows);
    preview.put("validRowsSampled", validCargos.size() > validRows.size());
    preview.put("invalidRows", invalidRows);
    preview.put("aggregated", aggregated);
    preview.put("importedQuantity", importedQuantity);
    preview.put("skippedRows", invalidRows.size());

    Map<String, Object> workbook = new LinkedHashMap<>();
    workbook.put("source", "backend");
    workbook.put("fileName", fileName);
    workbook.put("sheets", bundle.sheets());

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("source", "backend");
    response.put("fileName", fileName);
    response.put("workbook", workbook);
    response.put("activeSheet", bundle.sheets().isEmpty() ? null : bundle.sheets().get(0));
    response.put("preview", preview);
    return response;
  }

  private Map<String, Object> sheetSummary(
      String sheetName,
      int headerRowIndex,
      List<String> headers,
      Map<String, String> mapping,
      int rowCount
  ) {
    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("name", sheetName);
    summary.put("headerRowIndex", headerRowIndex);
    summary.put("headers", headers);
    summary.put("mapping", mapping);
    summary.put("rowCount", rowCount);
    summary.put("rows", List.of());
    summary.put("source", "backend");
    return summary;
  }

  private ParsedRow parseCargoRow(String sheetName, int rowNumber, Map<String, String> raw, Map<String, String> mapping) {
    List<String> notes = new ArrayList<>();
    List<String> errors = new ArrayList<>();
    String dimensionText = valueFor(raw, mapping.get("dimensionText"));
    List<Double> dimensions = parseDimensionText(dimensionText);
    Integer quantity = positiveInteger(valueFor(raw, mapping.get("quantity")));
    if ((quantity == null || quantity <= 0) && isPackingListMapping(mapping)) {
      quantity = inferPackageQuantity(
          valueFor(raw, mapping.get("__sourceQuantity")),
          valueFor(raw, mapping.get("__packingQuantity"))
      );
      if (quantity != null && quantity > 0) {
        notes.add("\u5df2\u7528\u4ea7\u54c1\u6570\u91cf / \u88c5\u7bb1\u6570\u91cf\u6362\u7b97\u8fd0\u8f93\u4ef6\u6570");
      }
    }
    Double lengthCm = positiveNumber(valueFor(raw, mapping.get("lengthCm")), unitFromText(mapping.get("lengthCm"), valueFor(raw, mapping.get("lengthCm"))), dimensionValue(dimensions, 0));
    Double widthCm = positiveNumber(valueFor(raw, mapping.get("widthCm")), unitFromText(mapping.get("widthCm"), valueFor(raw, mapping.get("widthCm"))), dimensionValue(dimensions, 1));
    Double heightCm = positiveNumber(valueFor(raw, mapping.get("heightCm")), unitFromText(mapping.get("heightCm"), valueFor(raw, mapping.get("heightCm"))), dimensionValue(dimensions, 2));
    Double totalWeightKg = nonNegativeNumber(valueFor(raw, mapping.get("totalWeightKg")), weightUnitFromText(mapping.get("totalWeightKg"), valueFor(raw, mapping.get("totalWeightKg"))), null);
    String weightHeader = mapping.get("weightKg");
    String totalWeightHeader = mapping.get("totalWeightKg");
    String weightSource = weightHeader != null && !weightHeader.equals(totalWeightHeader) ? valueFor(raw, weightHeader) : "";
    Double weightKg = nonNegativeNumber(
        weightSource,
        weightUnitFromText(mapping.get("weightKg"), valueFor(raw, mapping.get("weightKg"))),
        totalWeightKg != null && quantity != null && quantity > 0 ? totalWeightKg / quantity : null
    );
    String name = cleanCell(firstNonBlank(valueFor(raw, mapping.get("name")), valueFor(raw, mapping.get("id"))));
    String model = cleanCell(valueFor(raw, mapping.get("model")));
    String remark = cleanCell(valueFor(raw, mapping.get("remark")));
    String type = normalizeType(valueFor(raw, mapping.get("type")), remark);
    if ("normal".equals(type) && "pallet".equals(packageUnitFromMapping(mapping))) type = "pallet";
    String color = normalizeColor(valueFor(raw, mapping.get("color")));
    String sku = cleanCell(valueFor(raw, mapping.get("id")));

    if (name.isBlank()) errors.add("\u7f3a\u5c11\u8d27\u7269\u540d\u79f0");
    if (lengthCm == null || lengthCm <= 0) errors.add("\u957f\u5ea6\u5fc5\u987b\u5927\u4e8e 0");
    if (widthCm == null || widthCm <= 0) errors.add("\u5bbd\u5ea6\u5fc5\u987b\u5927\u4e8e 0");
    if (heightCm == null || heightCm <= 0) errors.add("\u9ad8\u5ea6\u5fc5\u987b\u5927\u4e8e 0");
    if (quantity == null || quantity <= 0) errors.add("\u6570\u91cf\u5fc5\u987b\u662f\u6b63\u6574\u6570");
    if (weightKg == null) errors.add("\u5355\u4ef6\u91cd\u91cf\u5fc5\u987b\u5927\u4e8e\u7b49\u4e8e 0");
    if (!dimensionText.isBlank() && dimensions == null) notes.add("\u5408\u5e76\u5c3a\u5bf8\u672a\u8bc6\u522b\uff0c\u5df2\u5c1d\u8bd5\u4f7f\u7528\u72ec\u7acb\u957f\u5bbd\u9ad8\u5b57\u6bb5");
    if (totalWeightKg != null && weightSource.isBlank()) notes.add("\u5df2\u7528\u603b\u91cd\u91cf / \u6570\u91cf\u6362\u7b97\u5355\u4ef6\u91cd\u91cf");

    Map<String, Object> cargo = cargoMap(name, model, lengthCm, widthCm, heightCm, quantity, weightKg, type, color, sku, remark);
    applyIndependentConstraints(
        cargo,
        valueFor(raw, mapping.get("type")),
        valueFor(raw, mapping.get("nonStack")),
        valueFor(raw, mapping.get("keepUpright")),
        remark
    );
    Map<String, Object> packageInfo = buildPackageInfo(mapping, raw, quantity, lengthCm, widthCm, heightCm, weightKg, totalWeightKg);
    if (!packageInfo.isEmpty()) {
      cargo.put("packageInfo", packageInfo);
      if (isPackingListMapping(mapping)) {
        notes.add("\u5bfc\u5165\u53e3\u5f84\uff1a\u7b97\u6cd5\u8d27\u7269=\u5916\u5305\u88c5\u7bb1/\u6258\u76d8\uff0c\u6563\u4ef6\u6570\u91cf\u4ec5\u4fdd\u5b58\u4e3a\u5305\u88c5\u660e\u7ec6");
      }
    }
    return new ParsedRow(sheetName, rowNumber, raw, cargo, errors, notes, buildSuggestion(raw, cargo, errors, rowNumber));
  }

  private Map<String, Object> cargoMap(
      String name,
      String model,
      Double lengthCm,
      Double widthCm,
      Double heightCm,
      Integer quantity,
      Double weightKg,
      String type,
      String color,
      String sku,
      String remark
  ) {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("name", name);
    cargo.put("model", model);
    cargo.put("lengthCm", round2(lengthCm));
    cargo.put("widthCm", round2(widthCm));
    cargo.put("heightCm", round2(heightCm));
    cargo.put("quantity", quantity == null ? 0 : quantity);
    cargo.put("weightKg", round2(weightKg));
    cargo.put("type", "pallet".equalsIgnoreCase(cleanCell(type)) ? "pallet" : "normal");
    cargo.put("color", color);
    cargo.put("sku", sku);
    cargo.put("remark", remark);
    applyIndependentConstraints(cargo, type, remark);
    return cargo;
  }

  private Map<String, Object> buildSuggestion(Map<String, String> raw, Map<String, Object> cargo, List<String> errors, int rowNumber) {
    List<Double> fallbackDimensions = inferDimensionsFromRow(raw);
    Map<String, Object> suggested = new LinkedHashMap<>();
    suggested.put("name", firstNonBlank(String.valueOf(cargo.getOrDefault("name", "")), inferNameFromRow(raw), "\u7b2c " + rowNumber + " \u884c\u8d27\u7269"));
    suggested.put("model", String.valueOf(cargo.getOrDefault("model", "")));
    suggested.put("lengthCm", positiveOrFallback(cargo.get("lengthCm"), dimensionValue(fallbackDimensions, 0)));
    suggested.put("widthCm", positiveOrFallback(cargo.get("widthCm"), dimensionValue(fallbackDimensions, 1)));
    suggested.put("heightCm", positiveOrFallback(cargo.get("heightCm"), dimensionValue(fallbackDimensions, 2)));
    suggested.put("quantity", positiveIntegerValue(cargo.get("quantity"), 1));
    suggested.put("weightKg", nonNegativeValue(cargo.get("weightKg"), 0));
    suggested.put("type", firstNonBlank(String.valueOf(cargo.getOrDefault("type", "")), "normal"));
    suggested.put("nonStack", Boolean.TRUE.equals(cargo.get("nonStack")));
    suggested.put("keepUpright", Boolean.TRUE.equals(cargo.get("keepUpright")));
    suggested.put("color", String.valueOf(cargo.getOrDefault("color", "")));
    suggested.put("sku", String.valueOf(cargo.getOrDefault("sku", "")));
    suggested.put("remark", String.valueOf(cargo.getOrDefault("remark", "")));

    List<String> notes = new ArrayList<>();
    if (errors.stream().anyMatch((error) -> error.contains("\u540d\u79f0"))) notes.add("\u540d\u79f0\u7f3a\u5931\uff0c\u5df2\u7528\u539f\u59cb\u884c\u6587\u672c\u6216\u884c\u53f7\u751f\u6210\u4e34\u65f6\u540d\u79f0");
    if (errors.stream().anyMatch((error) -> error.contains("\u6570\u91cf"))) notes.add("\u6570\u91cf\u7f3a\u5931\uff0c\u5efa\u8bae\u5148\u6309 1 \u4ef6\u5bfc\u5165\uff0c\u8bf7\u786e\u8ba4");
    if (errors.stream().anyMatch((error) -> error.contains("\u91cd\u91cf"))) notes.add("\u91cd\u91cf\u7f3a\u5931\uff0c\u5efa\u8bae\u5148\u6309 0 kg \u5bfc\u5165\uff0c\u8bf7\u786e\u8ba4");
    if (errors.stream().anyMatch((error) -> error.contains("\u957f\u5ea6") || error.contains("\u5bbd\u5ea6") || error.contains("\u9ad8\u5ea6"))) {
      notes.add(fallbackDimensions == null ? "\u5c3a\u5bf8\u4ecd\u672a\u8bc6\u522b\uff0c\u9700\u8981\u624b\u52a8\u8865\u5165\u957f\u5bbd\u9ad8" : "\u5df2\u4ece\u6574\u884c\u6587\u672c\u4e2d\u91cd\u65b0\u8bc6\u522b\u957f\u5bbd\u9ad8");
    }

    Map<String, Object> suggestion = new LinkedHashMap<>();
    suggestion.put("cargo", suggested);
    suggestion.put("notes", notes);
    suggestion.put("errors", validateCargo(suggested));
    return suggestion;
  }

  private List<Map<String, Object>> aggregateCargos(List<Map<String, Object>> cargos) {
    Map<String, Map<String, Object>> aggregate = new LinkedHashMap<>();
    for (Map<String, Object> cargo : cargos) {
      String key = List.of(
          String.valueOf(cargo.getOrDefault("sku", "")),
          String.valueOf(cargo.getOrDefault("name", "")),
          String.valueOf(cargo.getOrDefault("model", "")),
          String.valueOf(cargo.getOrDefault("lengthCm", "")),
          String.valueOf(cargo.getOrDefault("widthCm", "")),
          String.valueOf(cargo.getOrDefault("heightCm", "")),
          String.valueOf(cargo.getOrDefault("weightKg", "")),
          String.valueOf(cargo.getOrDefault("type", "")),
          String.valueOf(cargo.getOrDefault("nonStack", false)),
          String.valueOf(cargo.getOrDefault("keepUpright", false)),
          String.valueOf(cargo.getOrDefault("color", ""))
      ).toString();
      Map<String, Object> existing = aggregate.get(key);
      if (existing == null) {
        aggregate.put(key, new LinkedHashMap<>(cargo));
      } else {
        existing.put("quantity", intValue(existing.get("quantity")) + intValue(cargo.get("quantity")));
        Map<String, Object> mergedPackageInfo = mergePackageInfo(existing.get("packageInfo"), cargo.get("packageInfo"), intValue(existing.get("quantity")));
        if (!mergedPackageInfo.isEmpty()) existing.put("packageInfo", mergedPackageInfo);
      }
    }
    return assignCargoModels(new ArrayList<>(aggregate.values()));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> mergePackageInfo(Object leftValue, Object rightValue, int packageQuantity) {
    Map<String, Object> left = leftValue instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
    Map<String, Object> right = rightValue instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
    if (left.isEmpty() && right.isEmpty()) return Map.of();
    Map<String, Object> base = new LinkedHashMap<>(left.isEmpty() ? right : left);
    base.put("packageQuantity", packageQuantity);

    Map<String, Object> leftInner = left.get("innerCargo") instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
    Map<String, Object> rightInner = right.get("innerCargo") instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
    double totalInnerQuantity = numberValue(leftInner.get("totalQuantity")) + numberValue(rightInner.get("totalQuantity"));
    if (totalInnerQuantity > 0) {
      Map<String, Object> inner = new LinkedHashMap<>(leftInner);
      inner.putAll(rightInner);
      inner.put("totalQuantity", Math.round(totalInnerQuantity));
      inner.putIfAbsent("quantityUnit", "pcs");
      base.put("innerCargo", inner);
    }

    double totalWeight = numberValue(left.get("packageTotalGrossWeightKg")) + numberValue(right.get("packageTotalGrossWeightKg"));
    if (totalWeight > 0) base.put("packageTotalGrossWeightKg", round2(totalWeight));
    return compactObject(base);
  }

  private List<Map<String, Object>> assignCargoModels(List<Map<String, Object>> cargos) {
    Map<String, List<Map<String, Object>>> byName = new LinkedHashMap<>();
    for (Map<String, Object> cargo : cargos) {
      String name = cleanCell(cargo.get("name"));
      if (!name.isBlank()) byName.computeIfAbsent(name, (ignored) -> new ArrayList<>()).add(cargo);
    }
    List<Map<String, Object>> result = new ArrayList<>();
    for (Map<String, Object> cargo : cargos) {
      Map<String, Object> next = new LinkedHashMap<>(cargo);
      List<Map<String, Object>> siblings = byName.getOrDefault(cleanCell(cargo.get("name")), List.of());
      List<String> dimensionKeys = siblings.stream().map(this::dimensionKey).distinct().sorted(this::compareDimensionKey).toList();
      if (dimensionKeys.size() > 1 && cleanCell(cargo.get("model")).isBlank()) {
        int index = Math.max(0, dimensionKeys.indexOf(dimensionKey(cargo)));
        next.put("model", "\u578b\u53f7 " + modelLabel(index));
      }
      result.add(next);
    }
    return result;
  }

  private List<String> validateCargo(Map<String, Object> cargo) {
    List<String> errors = new ArrayList<>();
    if (cleanCell(cargo.get("name")).isBlank()) errors.add("\u7f3a\u5c11\u8d27\u7269\u540d\u79f0");
    if (numberValue(cargo.get("lengthCm")) <= 0) errors.add("\u957f\u5ea6\u5fc5\u987b\u5927\u4e8e 0");
    if (numberValue(cargo.get("widthCm")) <= 0) errors.add("\u5bbd\u5ea6\u5fc5\u987b\u5927\u4e8e 0");
    if (numberValue(cargo.get("heightCm")) <= 0) errors.add("\u9ad8\u5ea6\u5fc5\u987b\u5927\u4e8e 0");
    if (numberValue(cargo.get("quantity")) <= 0 || numberValue(cargo.get("quantity")) % 1 != 0) errors.add("\u6570\u91cf\u5fc5\u987b\u662f\u6b63\u6574\u6570");
    if (numberValue(cargo.get("weightKg")) < 0) errors.add("\u5355\u4ef6\u91cd\u91cf\u5fc5\u987b\u5927\u4e8e\u7b49\u4e8e 0");
    return errors;
  }

  private int findHeaderRow(List<List<String>> rows) {
    int bestIndex = 0;
    double bestScore = -1;
    int limit = Math.min(rows.size(), 12);
    for (int i = 0; i < limit; i++) {
      double score = 0;
      for (String cell : rows.get(i)) {
        String normalized = normalizeHeader(cell);
        if (normalized.isBlank()) continue;
        boolean matched = FIELD_ALIASES.values().stream()
            .flatMap(List::stream)
            .map(this::normalizeHeader)
            .anyMatch((alias) -> !alias.isBlank() && (normalized.equals(alias) || normalized.contains(alias)));
        score += matched ? 2 : 0.25;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  private Map<String, String> guessMapping(List<String> headers) {
    List<String> normalizedHeaders = headers.stream().map(this::normalizeHeader).toList();
    Map<String, String> mapping = new LinkedHashMap<>();
    for (FieldDef field : STANDARD_FIELDS) {
      List<String> aliases = FIELD_ALIASES.getOrDefault(field.key(), List.of()).stream().map(this::normalizeHeader).toList();
      int matchIndex = -1;
      for (int i = 0; i < normalizedHeaders.size(); i++) {
        if (aliases.contains(normalizedHeaders.get(i))) {
          matchIndex = i;
          break;
        }
      }
      if (matchIndex < 0) {
        for (int i = 0; i < normalizedHeaders.size(); i++) {
          String header = normalizedHeaders.get(i);
          if (aliases.stream().anyMatch((alias) -> !alias.isBlank() && canFuzzyMatchAlias(alias) && header.contains(alias))) {
            matchIndex = i;
            break;
          }
        }
      }
      mapping.put(field.key(), matchIndex >= 0 ? headers.get(matchIndex) : "");
    }
    if (mapping.get("name").isBlank() && !mapping.get("id").isBlank()) mapping.put("name", mapping.get("id"));
    return mapping;
  }

  private Map<String, String> refineMapping(List<String> headers, Map<String, String> mapping) {
    Map<String, String> refined = new LinkedHashMap<>(mapping);
    applyPackingListMapping(headers, refined);
    return refined;
  }

  private void applyPackingListMapping(List<String> headers, Map<String, String> mapping) {
    int productColumnLimit = firstPalletColumnIndex(headers);
    List<String> productHeaders = headers.subList(0, productColumnLimit);
    String nameHeader = firstHeader(productHeaders, this::isCargoNameHeader);
    String outerDimensionHeader = firstHeader(productHeaders, this::isOuterCartonDimensionHeader);
    String packageCountHeader = firstHeader(productHeaders, this::isPackageCountHeader);
    String packingQuantityHeader = firstHeader(productHeaders, this::isPackingQuantityHeader);
    String sourceQuantityHeader = firstHeader(productHeaders, this::isSourceQuantityHeader);
    String unitGrossWeightHeader = firstHeader(productHeaders, this::isUnitGrossWeightHeader);
    String totalWeightHeader = firstHeader(productHeaders, this::isTotalWeightHeader);
    String remarkHeader = firstHeader(productHeaders, this::isRemarkHeader);

    boolean looksLikePackingList = !nameHeader.isBlank()
        && !outerDimensionHeader.isBlank()
        && (!packageCountHeader.isBlank()
            || !packingQuantityHeader.isBlank()
            || !unitGrossWeightHeader.isBlank()
            || !totalWeightHeader.isBlank());
    if (!looksLikePackingList) return;

    mapping.put("__packingList", "true");
    mapping.put("__packageUnit", "carton");
    mapping.put("name", nameHeader);
    mapping.put("dimensionText", outerDimensionHeader);
    mapping.put("lengthCm", "");
    mapping.put("widthCm", "");
    mapping.put("heightCm", "");
    if (!packageCountHeader.isBlank()) {
      mapping.put("quantity", packageCountHeader);
    } else if (!sourceQuantityHeader.isBlank() && !packingQuantityHeader.isBlank()) {
      mapping.put("quantity", "");
    }
    if (!unitGrossWeightHeader.isBlank()) {
      mapping.put("weightKg", unitGrossWeightHeader);
    } else if (!totalWeightHeader.isBlank()) {
      mapping.put("weightKg", "");
    }
    if (!totalWeightHeader.isBlank()) mapping.put("totalWeightKg", totalWeightHeader);
    if (!remarkHeader.isBlank()) mapping.put("remark", remarkHeader);
    if (!sourceQuantityHeader.isBlank()) mapping.put("__sourceQuantity", sourceQuantityHeader);
    if (!packingQuantityHeader.isBlank()) mapping.put("__packingQuantity", packingQuantityHeader);
  }

  private int firstPalletColumnIndex(List<String> headers) {
    for (int i = 0; i < headers.size(); i++) {
      if (isPalletHeader(headers.get(i))) return i;
    }
    return headers.size();
  }

  private String firstHeader(List<String> headers, HeaderPredicate predicate) {
    return headers.stream()
        .filter((header) -> predicate.test(normalizeHeader(header)))
        .findFirst()
        .orElse("");
  }

  private boolean isCargoNameHeader(String header) {
    return header.equals("\u54c1\u540d")
        || header.equals("\u4ea7\u54c1\u540d\u79f0")
        || header.equals("\u8d27\u7269\u540d\u79f0")
        || header.equals("\u8d27\u540d")
        || header.equals("\u540d\u79f0")
        || header.equals("size")
        || header.equals("name")
        || header.equals("goodsname")
        || header.equals("productname");
  }

  private boolean isOuterCartonDimensionHeader(String header) {
    return header.contains("\u5916\u7bb1\u5c3a\u5bf8")
        || header.contains("\u5916\u7bb1\u89c4\u683c")
        || header.contains("\u7eb8\u7bb1\u5c3a\u5bf8")
        || header.contains("\u5305\u88c5\u5c3a\u5bf8")
        || header.equals("\u7bb1\u89c4")
        || header.equals("\u7bb1\u5c3a\u5bf8")
        || header.contains("cartonsize")
        || header.contains("outersize")
        || header.contains("outercarton");
  }

  private boolean isPackageCountHeader(String header) {
    return (header.equals("\u4ef6\u6570")
        || header.equals("\u7bb1\u6570")
        || header.equals("\u603b\u4ef6\u6570")
        || header.equals("\u603b\u7bb1\u6570")
        || header.equals("ctn")
        || header.equals("ctns")
        || header.equals("tctn")
        || header.equals("tctns")
        || header.equals("totalctn")
        || header.equals("totalctns")
        || header.equals("totalcarton")
        || header.equals("totalcartons")
        || header.equals("carton")
        || header.equals("cartons")
        || header.equals("boxes"))
        && !header.contains("\u88c5\u7bb1");
  }

  private boolean isPackingQuantityHeader(String header) {
    return header.contains("\u88c5\u7bb1\u6570\u91cf")
        || header.contains("\u6bcf\u7bb1\u6570\u91cf")
        || header.contains("\u5165\u6570")
        || header.contains("pcsctn")
        || header.contains("qtyctn");
  }

  private boolean isSourceQuantityHeader(String header) {
    return header.equals("\u6570\u91cf")
        || header.equals("\u4ea7\u54c1\u6570\u91cf")
        || header.equals("\u603b\u6570\u91cf")
        || header.equals("qty")
        || header.equals("quantity")
        || header.equals("orderqty")
        || header.equals("orderquantity")
        || header.equals("pcs");
  }

  private boolean isUnitGrossWeightHeader(String header) {
    return (header.equals("\u6bdb\u91cd")
        || header.equals("\u6bdb\u91cdkg")
        || header.equals("\u5355\u7bb1\u6bdb\u91cd")
        || header.equals("\u5355\u7bb1\u6bdb\u91cdkg")
        || header.equals("\u6bcf\u7bb1\u6bdb\u91cd")
        || header.equals("\u7bb1\u6bdb\u91cd")
        || header.equals("\u7bb1\u91cd")
        || header.equals("gw")
        || header.equals("gwkg")
        || header.equals("gwkgs")
        || header.equals("gweight")
        || header.equals("gweightkg")
        || header.equals("gweightkgs")
        || header.equals("grossweight"))
        && !header.contains("\u603b")
        && !isPalletHeader(header);
  }

  private boolean isTotalWeightHeader(String header) {
    return (header.contains("\u603b\u91cd\u91cf")
        || header.contains("\u603b\u91cd")
        || header.contains("\u603b\u6bdb\u91cd")
        || header.contains("\u91cd\u91cf\u5408\u8ba1")
        || header.contains("\u5408\u8ba1\u91cd\u91cf")
        || header.contains("totalweight")
        || header.contains("tgw")
        || header.contains("tgwkg")
        || header.contains("tgwkgs")
        || header.contains("totalgw")
        || header.contains("grossweighttotal"))
        && !header.contains("\u4f53\u79ef")
        && !isPalletHeader(header);
  }

  private boolean isRemarkHeader(String header) {
    return header.equals("\u5907\u6ce8") || header.equals("remark") || header.equals("remarks") || header.equals("note");
  }

  private boolean isPalletHeader(String header) {
    String normalized = normalizeHeader(header);
    return normalized.contains("\u6258\u76d8")
        || normalized.contains("\u6808\u677f")
        || normalized.contains("\u514d\u718f\u84b8")
        || normalized.contains("pallet");
  }

  private boolean isPackingListMapping(Map<String, String> mapping) {
    return "true".equals(mapping.get("__packingList"));
  }

  private Integer inferPackageQuantity(String sourceQuantity, String packingQuantity) {
    Double total = numberFromCell(sourceQuantity);
    Double perPackage = numberFromCell(packingQuantity);
    if (total == null || perPackage == null || total <= 0 || perPackage <= 0) return null;
    return Math.max(1, (int) Math.ceil(total / perPackage));
  }

  private Map<String, Object> buildPackageInfo(
      Map<String, String> mapping,
      Map<String, String> raw,
      Integer quantity,
      Double lengthCm,
      Double widthCm,
      Double heightCm,
      Double weightKg,
      Double totalWeightKg
  ) {
    double innerTotalQuantity = numberValue(numberFromCell(valueFor(raw, mapping.get("__sourceQuantity"))));
    double innerPiecesPerPackage = numberValue(numberFromCell(valueFor(raw, mapping.get("__packingQuantity"))));
    String dimensionHeader = normalizeHeader(mapping.getOrDefault("dimensionText", ""));
    boolean hasPackageSignal = isPackingListMapping(mapping)
        || dimensionHeader.contains("pallet")
        || dimensionHeader.contains("skid")
        || dimensionHeader.contains("\u6258\u76d8")
        || dimensionHeader.contains("\u6808\u677f");
    boolean hasInnerInfo = innerTotalQuantity > 0 || innerPiecesPerPackage > 0;
    if (!hasPackageSignal && !hasInnerInfo) return Map.of();

    int packageQuantity = Math.max(0, quantity == null ? 0 : quantity);
    double packageGrossWeightKg = round2(weightKg);
    double packageTotalGrossWeightKg = totalWeightKg != null
        ? round2(totalWeightKg)
        : round2(packageGrossWeightKg * packageQuantity);

    Map<String, Object> dimensions = new LinkedHashMap<>();
    dimensions.put("lengthCm", round2(lengthCm));
    dimensions.put("widthCm", round2(widthCm));
    dimensions.put("heightCm", round2(heightCm));

    Map<String, Object> innerCargo = new LinkedHashMap<>();
    if (innerTotalQuantity > 0) innerCargo.put("totalQuantity", Math.round(innerTotalQuantity));
    if (innerPiecesPerPackage > 0) innerCargo.put("piecesPerPackage", round2(innerPiecesPerPackage));
    if (!innerCargo.isEmpty()) innerCargo.put("quantityUnit", "pcs");

    Map<String, Object> info = new LinkedHashMap<>();
    info.put("algorithmBasis", "package-unit");
    info.put("packageUnit", packageUnitFromMapping(mapping));
    info.put("packageQuantity", packageQuantity);
    info.put("packageDimensionsCm", compactObject(dimensions));
    info.put("packageGrossWeightKg", packageGrossWeightKg);
    info.put("packageTotalGrossWeightKg", packageTotalGrossWeightKg);
    if (!innerCargo.isEmpty()) info.put("innerCargo", innerCargo);
    return compactObject(info);
  }

  private String packageUnitFromMapping(Map<String, String> mapping) {
    String text = normalizeHeader(mapping.getOrDefault("__packageUnit", "") + " " + mapping.getOrDefault("dimensionText", ""));
    if (text.contains("pallet") || text.contains("skid") || text.contains("\u6258\u76d8") || text.contains("\u6808\u677f")) return "pallet";
    if (text.contains("crate") || text.contains("wood") || text.contains("\u6728\u7bb1")) return "crate";
    return "carton";
  }

  private Map<String, Object> compactObject(Map<String, Object> object) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (Map.Entry<String, Object> entry : object.entrySet()) {
      Object value = entry.getValue();
      if (value == null) continue;
      if (value instanceof String text && text.isBlank()) continue;
      if (value instanceof Number number && !Double.isFinite(number.doubleValue())) continue;
      if (value instanceof Map<?, ?> map && map.isEmpty()) continue;
      result.put(entry.getKey(), value);
    }
    return result;
  }

  private boolean shouldSkipDataRow(Map<String, String> raw, Map<String, String> mapping, List<String> cells) {
    String name = cleanCell(valueFor(raw, mapping.get("name")));
    if (isSummaryText(name)) return true;
    if (isPackingListMapping(mapping) && name.isBlank()) return true;
    boolean hasSummaryCell = cells.stream()
        .map(this::normalizeHeader)
        .anyMatch(this::isSummaryText);
    return hasSummaryCell && name.isBlank();
  }

  private boolean isSummaryText(String value) {
    String text = normalizeHeader(value);
    return text.equals("\u5408\u8ba1")
        || text.equals("\u5c0f\u8ba1")
        || text.equals("\u603b\u8ba1")
        || text.equals("total")
        || text.equals("subtotal");
  }

  private boolean canFuzzyMatchAlias(String alias) {
    return alias.length() > 2 || Pattern.compile("[\\p{IsHan}]").matcher(alias).find();
  }

  private List<Double> parseDimensionText(String value) {
    String text = cleanCell(value);
    if (text.isBlank()) return null;
    Matcher matcher = DIMENSION_NUMBER_PATTERN.matcher(text);
    List<Double> numbers = new ArrayList<>();
    while (matcher.find()) numbers.add(Double.parseDouble(matcher.group()));
    if (numbers.size() < 3) return null;
    String unit = unitFromText(text, text);
    return numbers.stream().limit(3).map((number) -> round2(convertDimension(number, unit))).toList();
  }

  private List<Double> inferDimensionsFromRow(Map<String, String> raw) {
    for (String value : raw.values()) {
      List<Double> dimensions = parseDimensionText(value);
      if (dimensions != null) return dimensions;
    }
    List<Double> numbers = raw.values().stream()
        .map(this::numberFromCell)
        .filter((value) -> value != null && value > 0)
        .toList();
    return numbers.size() >= 3 ? numbers.subList(0, 3).stream().map(this::round2).toList() : null;
  }

  private String inferNameFromRow(Map<String, String> raw) {
    return raw.values().stream()
        .map(this::cleanCell)
        .filter((value) -> !value.isBlank() && HAS_NAME_PATTERN.matcher(value).matches() && numberFromCell(value) == null)
        .findFirst()
        .orElse("");
  }

  private Double positiveNumber(String value, String unit, Double fallback) {
    Double number = numberFromCell(value);
    if (number == null) return fallback;
    double converted = convertDimension(number, unit);
    return converted > 0 ? round2(converted) : null;
  }

  private Double nonNegativeNumber(String value, String unit, Double fallback) {
    Double number = numberFromCell(value);
    if (number == null) return fallback;
    double converted = convertWeight(number, unit);
    return converted >= 0 ? round2(converted) : null;
  }

  private Integer positiveInteger(String value) {
    Double number = numberFromCell(value);
    if (number == null) return null;
    int integer = (int) Math.round(number);
    return integer > 0 ? integer : null;
  }

  private Double numberFromCell(String value) {
    String text = cleanCell(value).replace(",", "");
    if (text.isBlank()) return null;
    Matcher matcher = NUMBER_PATTERN.matcher(text);
    if (!matcher.find()) return null;
    try {
      return Double.parseDouble(matcher.group());
    } catch (NumberFormatException error) {
      return null;
    }
  }

  private String unitFromText(String header, String value) {
    String text = (cleanCell(header) + " " + cleanCell(value)).toLowerCase(Locale.ROOT);
    if (text.contains("mm") || text.contains("\u6beb\u7c73")) return "mm";
    if ((Pattern.compile("(^|[^c])m([^m]|$)").matcher(text).find() || text.contains("\u7c73"))
        && !text.contains("cm") && !text.contains("\u5398\u7c73")) {
      return "m";
    }
    return "cm";
  }

  private String weightUnitFromText(String header, String value) {
    String text = (cleanCell(header) + " " + cleanCell(value)).toLowerCase(Locale.ROOT);
    if (text.contains("kg") || text.contains("kgs") || text.contains("\u516c\u65a4") || text.contains("\u5343\u514b")) return "kg";
    if (text.contains("\u5428") || text.contains("ton") || Pattern.compile("\\bt\\b").matcher(text).find()) return "t";
    if ((text.contains("\u514b") || Pattern.compile("\\bg\\b").matcher(text).find())
        && !text.contains("kg") && !text.contains("\u516c\u65a4") && !text.contains("\u5343\u514b")) {
      return "g";
    }
    return "kg";
  }

  private double convertDimension(double value, String unit) {
    if ("mm".equals(unit)) return value / 10;
    if ("m".equals(unit)) return value * 100;
    return value;
  }

  private double convertWeight(double value, String unit) {
    if ("g".equals(unit)) return value / 1000;
    if ("t".equals(unit)) return value * 1000;
    return value;
  }

  private String normalizeType(String value, String remark) {
    String explicit = cleanCell(value).toLowerCase(Locale.ROOT);
    String note = cleanCell(remark).toLowerCase(Locale.ROOT);
    String combined = explicit + " " + note;
    if (typeAliasMatches("pallet", combined)) return "pallet";
    return "normal";
  }

  private boolean typeAliasMatches(String type, String text) {
    return TYPE_ALIASES.stream()
        .filter((alias) -> alias.type().equals(type))
        .flatMap((alias) -> alias.words().stream())
        .anyMatch((word) -> text.contains(word.toLowerCase(Locale.ROOT)));
  }

  private void applyIndependentConstraints(Map<String, Object> cargo, Object... sources) {
    StringBuilder text = new StringBuilder();
    text.append(' ').append(cleanCell(cargo.get("type")));
    text.append(' ').append(cleanCell(cargo.get("remark")));
    for (Object source : sources) text.append(' ').append(cleanCell(source));
    String normalized = text.toString().toLowerCase(Locale.ROOT);
    Boolean explicitNonStack = sources.length >= 3 ? constraintBoolean(sources[1]) : null;
    Boolean explicitKeepUpright = sources.length >= 3 ? constraintBoolean(sources[2]) : null;
    boolean detectedNonStack = detectsNonStackConstraint(normalized);
    boolean detectedKeepUpright = detectsKeepUprightConstraint(normalized);
    boolean nonStack = explicitNonStack != null
        ? explicitNonStack
        : Boolean.TRUE.equals(cargo.get("nonStack")) || truthyConstraint(cargo.get("nonStackable")) || detectedNonStack;
    boolean keepUpright = explicitKeepUpright != null
        ? explicitKeepUpright
        : Boolean.TRUE.equals(cargo.get("keepUpright")) || truthyConstraint(cargo.get("upright")) || detectedKeepUpright;
    cargo.put("nonStack", nonStack);
    cargo.put("keepUpright", keepUpright);
  }

  private boolean detectsNonStackConstraint(String value) {
    String probe = cleanCell(value).toLowerCase(Locale.ROOT);
    for (String phrase : List.of(
        "not non-stackable", "not nonstackable", "not non stackable",
        "非不可重压", "无需不可重压", "不要求不可重压")) {
      probe = probe.replace(phrase, " ");
    }
    for (String phrase : List.of(
        "non-stackable", "non stackable", "nonstackable", "unstackable",
        "not stackable", "do not stack", "no stack", "non-stack", "non stack", "nonstack",
        "不可重压", "不能重压", "禁止重压", "勿压", "不可堆叠", "不能堆叠", "禁止堆叠")) {
      probe = probe.replace(phrase, " __non_stack__ ");
    }
    for (String phrase : List.of(
        "非易碎", "不是易碎", "not fragile", "non-fragile", "non fragile",
        "可重压", "允许重压", "可以重压", "可堆叠", "允许堆叠", "可以堆叠",
        "can be stacked", "stacking allowed")) {
      probe = probe.replace(phrase, " ");
    }
    probe = probe.replaceAll("(?<![\\p{L}\\p{N}-])stackable(?![\\p{L}\\p{N}-])", " ");
    return probe.contains("__non_stack__") || containsAny(probe, "易碎", "fragile");
  }

  private boolean detectsKeepUprightConstraint(String value) {
    String probe = cleanCell(value).toLowerCase(Locale.ROOT);
    for (String phrase : List.of(
        "无需保持朝上", "不需要保持朝上", "不要求保持朝上", "无需朝上",
        "可以倒置", "允许倒置", "keep upright not required", "upright not required", "not upright")) {
      probe = probe.replace(phrase, " ");
    }
    return containsAny(probe,
        "保持朝上", "朝上", "向上", "不可倒置", "请勿倒置",
        "upright", "this side up", "keep upright");
  }

  private Boolean constraintBoolean(Object value) {
    if (value instanceof Boolean bool) return bool;
    if (value instanceof Number number) return number.doubleValue() == 0 ? false : number.doubleValue() == 1 ? true : null;
    String text = cleanCell(value).toLowerCase(Locale.ROOT);
    if (text.isBlank()) return null;
    if (List.of("1", "true", "yes", "y", "是", "有", "需要", "必需", "√", "✓").contains(text)) return true;
    if (List.of("0", "false", "no", "n", "否", "无", "不需要", "×", "✕").contains(text)) return false;
    return null;
  }

  private boolean truthyConstraint(Object value) {
    return Boolean.TRUE.equals(constraintBoolean(value));
  }

  private boolean containsAny(String text, String... words) {
    for (String word : words) if (text.contains(word)) return true;
    return false;
  }

  private String normalizeColor(String value) {
    String text = cleanCell(value);
    return text.matches("^#[0-9a-fA-F]{6}$") ? text : "";
  }

  private String dimensionKey(Map<String, Object> cargo) {
    return String.join("|",
        String.valueOf(round2(numberValue(cargo.get("lengthCm")))),
        String.valueOf(round2(numberValue(cargo.get("widthCm")))),
        String.valueOf(round2(numberValue(cargo.get("heightCm")))),
        String.valueOf(round2(numberValue(cargo.get("weightKg")))),
        String.valueOf(cargo.getOrDefault("type", "normal")),
        String.valueOf(cargo.getOrDefault("nonStack", false)),
        String.valueOf(cargo.getOrDefault("keepUpright", false))
    );
  }

  private int compareDimensionKey(String a, String b) {
    String[] aParts = a.split("\\|");
    String[] bParts = b.split("\\|");
    for (int i = 0; i < 4; i++) {
      double diff = numberValue(i < aParts.length ? aParts[i] : "0") - numberValue(i < bParts.length ? bParts[i] : "0");
      if (Math.abs(diff) > 0.0001) return diff > 0 ? 1 : -1;
    }
    String aType = aParts.length > 4 ? aParts[4] : "";
    String bType = bParts.length > 4 ? bParts[4] : "";
    return aType.compareTo(bType);
  }

  private String modelLabel(int index) {
    String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (index < alphabet.length()) return String.valueOf(alphabet.charAt(index));
    return alphabet.charAt(index % alphabet.length()) + String.valueOf(index / alphabet.length() + 1);
  }

  private String cleanCell(Object value) {
    if (value == null) return "";
    return String.valueOf(value).replace("\uFEFF", "").trim();
  }

  private String normalizeHeader(String value) {
    return cleanCell(value).toLowerCase(Locale.ROOT).replaceAll("[\\s_()（）\\-:：/\\\\.。【】\\[\\]]", "");
  }

  private List<String> cleanCells(List<String> cells) {
    return cells.stream().map(this::cleanCell).toList();
  }

  private List<String> uniquifyHeaders(List<String> headers) {
    Map<String, Integer> seen = new LinkedHashMap<>();
    List<String> result = new ArrayList<>();
    for (int i = 0; i < headers.size(); i++) {
      String fallback = headers.get(i).isBlank() ? "\u672a\u547d\u540d\u5217" + (i + 1) : headers.get(i);
      int count = seen.getOrDefault(fallback, 0);
      seen.put(fallback, count + 1);
      result.add(count == 0 ? fallback : fallback + "_" + (count + 1));
    }
    return result;
  }

  private List<String> padRow(List<String> row, int length) {
    List<String> padded = new ArrayList<>(row);
    while (padded.size() < length) padded.add("");
    return padded.subList(0, length);
  }

  private Map<String, String> rowObject(List<String> headers, List<String> cells) {
    Map<String, String> row = new LinkedHashMap<>();
    for (int i = 0; i < headers.size(); i++) {
      row.put(headers.get(i), i < cells.size() ? cells.get(i) : "");
    }
    return row;
  }

  private String valueFor(Map<String, String> raw, String header) {
    return header == null || header.isBlank() ? "" : raw.getOrDefault(header, "");
  }

  private String firstNonBlank(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) return value;
    }
    return "";
  }

  private Double dimensionValue(List<Double> dimensions, int index) {
    return dimensions != null && dimensions.size() > index ? dimensions.get(index) : null;
  }

  private Object positiveOrFallback(Object value, Double fallback) {
    double number = numberValue(value);
    return number > 0 ? round2(number) : fallback == null ? "" : round2(fallback);
  }

  private int positiveIntegerValue(Object value, int fallback) {
    int number = (int) Math.round(numberValue(value));
    return number > 0 ? number : fallback;
  }

  private double nonNegativeValue(Object value, double fallback) {
    double number = numberValue(value);
    return number >= 0 ? round2(number) : fallback;
  }

  private int intValue(Object value) {
    return (int) Math.round(numberValue(value));
  }

  private double numberValue(Object value) {
    if (value instanceof Number number) return number.doubleValue();
    Double parsed = numberFromCell(String.valueOf(value == null ? "" : value));
    return parsed == null ? 0 : parsed;
  }

  private double round2(Double value) {
    if (value == null) return 0;
    return Math.round(value * 100.0) / 100.0;
  }

  private record FieldDef(String key, boolean required) {}

  private record TypeAlias(String type, List<String> words) {}

  private interface HeaderPredicate {
    boolean test(String normalizedHeader);
  }

  private record ParseBundle(String fileName, List<Map<String, Object>> sheets, List<ParsedRow> rows) {}

  private record SheetParseResult(Map<String, Object> summary, List<ParsedRow> rows) {}

  private record ParsedRow(
      String sheetName,
      int rowNumber,
      Map<String, String> raw,
      Map<String, Object> cargo,
      List<String> errors,
      List<String> notes,
      Map<String, Object> suggestion
  ) {
    Map<String, Object> toMap() {
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("sheetName", sheetName);
      row.put("rowNumber", rowNumber);
      row.put("raw", raw);
      row.put("cargo", cargo);
      row.put("errors", errors);
      row.put("notes", notes);
      row.put("suggestion", suggestion);
      return row;
    }
  }
}
