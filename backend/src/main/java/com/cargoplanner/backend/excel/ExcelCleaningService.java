package com.cargoplanner.backend.excel;

import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ExcelCleaningService {
  private static final List<String> OUTPUT_HEADERS = List.of(
      "name", "model", "lengthCm", "widthCm", "heightCm", "quantity", "weightKg", "type", "color", "sku", "remark"
  );
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
      new FieldDef("color", false),
      new FieldDef("id", false),
      new FieldDef("remark", false),
      new FieldDef("dimensionText", false)
  );
  private static final Map<String, List<String>> FIELD_ALIASES = Map.ofEntries(
      Map.entry("name", List.of("name", "cargo", "cargoName", "goods", "goodsName", "product", "货物", "货物名称", "货名", "名称", "品名", "产品名称", "箱名", "物品名称")),
      Map.entry("model", List.of("model", "specModel", "variant", "型号", "规格型号", "产品型号", "货物型号", "型号规格")),
      Map.entry("lengthCm", List.of("lengthCm", "length", "l", "长", "长度", "外长", "长cm", "长度cm", "长厘米", "长mm", "长度mm", "长毫米", "长m", "长度m")),
      Map.entry("widthCm", List.of("widthCm", "width", "w", "宽", "宽度", "外宽", "宽cm", "宽度cm", "宽厘米", "宽mm", "宽度mm", "宽毫米", "宽m", "宽度m")),
      Map.entry("heightCm", List.of("heightCm", "height", "h", "高", "高度", "外高", "高cm", "高度cm", "高厘米", "高mm", "高度mm", "高毫米", "高m", "高度m")),
      Map.entry("quantity", List.of("quantity", "qty", "count", "num", "pcs", "数量", "件数", "箱数", "个数", "数量pcs", "总件数")),
      Map.entry("weightKg", List.of("weightKg", "unitWeight", "unitWeightKg", "weight", "单重", "单件重量", "每件重量", "重量kg", "单重kg", "单件重量kg", "毛重kg", "净重kg")),
      Map.entry("totalWeightKg", List.of("totalWeight", "totalWeightKg", "grossWeight", "总重", "总重量", "总毛重", "毛重", "总净重", "总重量kg")),
      Map.entry("type", List.of("type", "cargoType", "rule", "货物类型", "类型", "规则", "摆放规则", "堆叠规则", "属性")),
      Map.entry("color", List.of("color", "颜色", "色值", "显示颜色")),
      Map.entry("id", List.of("id", "sku", "code", "货号", "编号", "物料编码", "产品编号", "条码")),
      Map.entry("remark", List.of("remark", "remarks", "note", "notes", "备注", "说明", "特殊要求", "装箱要求")),
      Map.entry("dimensionText", List.of("dimension", "dimensions", "size", "规格", "尺寸", "外尺寸", "长宽高", "尺寸cm", "尺寸mm", "规格尺寸"))
  );
  private static final List<TypeAlias> TYPE_ALIASES = List.of(
      new TypeAlias("nonstack", List.of("不可重压", "不能重压", "勿压", "易碎", "fragile", "nonstack", "non-stack", "no stack")),
      new TypeAlias("pallet", List.of("托盘", "木箱", "栈板", "pallet", "wooden", "wood")),
      new TypeAlias("upright", List.of("向上", "朝上", "不可倒置", "保持朝上", "upright", "this side up")),
      new TypeAlias("normal", List.of("普通", "可堆叠", "normal", "standard"))
  );
  private static final Pattern NUMBER_PATTERN = Pattern.compile("-?\\d+(?:\\.\\d+)?");
  private static final Pattern DIMENSION_NUMBER_PATTERN = Pattern.compile("\\d+(?:\\.\\d+)?");
  private static final Pattern HAS_NAME_PATTERN = Pattern.compile(".*[\\p{IsHan}A-Za-z].*");

  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public ExcelCleaningService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public Map<String, Object> createTask(MultipartFile file, String mode) {
    if (file == null || file.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Cleaning file is required");
    }

    long taskId = insertTask(file.getOriginalFilename(), normalizeSource(mode));
    jdbcTemplate.update("UPDATE cp_excel_cleaning_tasks SET status = 'RUNNING' WHERE id = ?", taskId);

    try {
      CleaningResult result = clean(file);
      String cleanedJson = objectMapper.writeValueAsString(result.cleanedRows());
      String issuesJson = objectMapper.writeValueAsString(result.issues());
      jdbcTemplate.update(
          """
          UPDATE cp_excel_cleaning_tasks
          SET status = 'SUCCEEDED',
              row_count = ?,
              valid_count = ?,
              issue_count = ?,
              cleaned_count = ?,
              cleaned_json = ?,
              issues_json = ?,
              agent_notes = ?,
              error_message = NULL,
              finished_at = ?
          WHERE id = ?
          """,
          result.rowCount(),
          result.validCount(),
          result.issueCount(),
          result.cleanedRows().size(),
          cleanedJson,
          issuesJson,
          result.agentNotes(),
          Timestamp.from(Instant.now()),
          taskId
      );
    } catch (Exception error) {
      jdbcTemplate.update(
          """
          UPDATE cp_excel_cleaning_tasks
          SET status = 'FAILED', error_message = ?, finished_at = ?
          WHERE id = ?
          """,
          trim(error.getMessage(), 1000),
          Timestamp.from(Instant.now()),
          taskId
      );
    }

    return getTask(taskId);
  }

  public List<Map<String, Object>> listTasks() {
    return jdbcTemplate.query(
        """
        SELECT id, task_no, source_channel, original_file_name, status, row_count, valid_count,
               issue_count, cleaned_count, agent_notes, error_message, created_at, updated_at, finished_at
        FROM cp_excel_cleaning_tasks
        ORDER BY created_at DESC, id DESC
        LIMIT 30
        """,
        (rs, rowNum) -> mapTaskRow(rs, false)
    );
  }

  public Map<String, Object> getTask(long id) {
    List<Map<String, Object>> rows = jdbcTemplate.query(
        """
        SELECT id, task_no, source_channel, original_file_name, status, row_count, valid_count,
               issue_count, cleaned_count, cleaned_json, issues_json, agent_notes, error_message,
               created_at, updated_at, finished_at
        FROM cp_excel_cleaning_tasks
        WHERE id = ?
        """,
        (rs, rowNum) -> mapTaskRow(rs, true),
        id
    );
    if (rows.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Cleaning task not found");
    }
    return rows.get(0);
  }

  public String cleanedJson(long id) {
    String json = jdbcTemplate.query(
        "SELECT cleaned_json FROM cp_excel_cleaning_tasks WHERE id = ?",
        (rs) -> rs.next() ? rs.getString("cleaned_json") : null,
        id
    );
    if (json == null) {
      getTask(id);
      return "[]";
    }
    return json;
  }

  public byte[] cleanedWorkbook(long id) {
    List<Map<String, Object>> rows = parseJsonList(cleanedJson(id));
    try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      Sheet sheet = workbook.createSheet("cleaned-cargos");
      Row headerRow = sheet.createRow(0);
      for (int i = 0; i < OUTPUT_HEADERS.size(); i++) {
        headerRow.createCell(i).setCellValue(OUTPUT_HEADERS.get(i));
      }
      for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
        Row sheetRow = sheet.createRow(rowIndex + 1);
        Map<String, Object> cargo = rows.get(rowIndex);
        for (int col = 0; col < OUTPUT_HEADERS.size(); col++) {
          Object value = cargo.get(OUTPUT_HEADERS.get(col));
          if (value instanceof Number number) {
            sheetRow.createCell(col).setCellValue(number.doubleValue());
          } else {
            sheetRow.createCell(col).setCellValue(value == null ? "" : String.valueOf(value));
          }
        }
      }
      for (int i = 0; i < OUTPUT_HEADERS.size(); i++) {
        sheet.autoSizeColumn(i);
      }
      workbook.write(output);
      return output.toByteArray();
    } catch (IOException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to export cleaned workbook");
    }
  }

  private long insertTask(String originalFileName, String source) {
    String taskNo = "CLEAN-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase(Locale.ROOT);
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbcTemplate.update((connection) -> {
      PreparedStatement ps = connection.prepareStatement(
          """
          INSERT INTO cp_excel_cleaning_tasks (task_no, source_channel, original_file_name, status)
          VALUES (?, ?, ?, 'PENDING')
          """,
          Statement.RETURN_GENERATED_KEYS
      );
      ps.setString(1, taskNo);
      ps.setString(2, source);
      ps.setString(3, trim(originalFileName == null || originalFileName.isBlank() ? "uploaded-file" : originalFileName, 255));
      return ps;
    }, keyHolder);
    Number key = keyHolder.getKey();
    if (key == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create cleaning task");
    }
    return key.longValue();
  }

  private CleaningResult clean(MultipartFile file) throws IOException {
    List<ParsedRow> parsedRows = new ArrayList<>();
    List<Map<String, Object>> issues = new ArrayList<>();
    String fileName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase(Locale.ROOT);

    if (fileName.endsWith(".csv") || fileName.endsWith(".tsv")) {
      char delimiter = fileName.endsWith(".tsv") ? '\t' : ',';
      parsedRows.addAll(cleanSheet("CSV", readDelimitedRows(file, delimiter)));
    } else {
      parsedRows.addAll(cleanWorkbook(file));
    }

    List<Map<String, Object>> validRows = new ArrayList<>();
    for (ParsedRow row : parsedRows) {
      if (row.errors().isEmpty()) {
        validRows.add(row.cargo());
      } else {
        issues.add(buildIssue(row));
      }
    }

    List<Map<String, Object>> cleanedRows = aggregateCargos(validRows);
    String agentNotes = "当前为规则清洗任务壳：已完成表头识别、单位换算、尺寸合并、类型识别、异常建议和同规格聚合；后续可将真实 Agent 接入此任务表异步回填。";
    return new CleaningResult(parsedRows.size(), validRows.size(), issues.size(), cleanedRows, issues, agentNotes);
  }

  private List<ParsedRow> cleanWorkbook(MultipartFile file) throws IOException {
    List<ParsedRow> parsedRows = new ArrayList<>();
    DataFormatter formatter = new DataFormatter(Locale.ROOT);
    try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
      for (int sheetIndex = 0; sheetIndex < workbook.getNumberOfSheets(); sheetIndex++) {
        Sheet sheet = workbook.getSheetAt(sheetIndex);
        parsedRows.addAll(cleanSheet(sheet.getSheetName(), sheetRows(sheet, formatter)));
      }
    }
    return parsedRows;
  }

  private List<ParsedRow> cleanSheet(String sheetName, List<List<String>> rows) {
    if (rows.isEmpty()) return List.of();
    int headerRowIndex = findHeaderRow(rows);
    List<String> headers = uniquifyHeaders(cleanCells(rows.get(headerRowIndex)));
    Map<String, String> mapping = guessMapping(headers);
    List<ParsedRow> parsed = new ArrayList<>();
    for (int rowIndex = headerRowIndex + 1; rowIndex < rows.size(); rowIndex++) {
      List<String> cells = padRow(rows.get(rowIndex), headers.size());
      if (cells.stream().allMatch(String::isBlank)) continue;
      Map<String, String> raw = rowObject(headers, cells);
      parsed.add(parseCargoRow(sheetName, rowIndex + 1, raw, mapping));
    }
    return parsed;
  }

  private List<List<String>> sheetRows(Sheet sheet, DataFormatter formatter) {
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

  private List<List<String>> readDelimitedRows(MultipartFile file, char delimiter) throws IOException {
    List<List<String>> rows = new ArrayList<>();
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        rows.add(parseDelimitedLine(line, delimiter));
      }
    }
    return rows;
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

  private ParsedRow parseCargoRow(String sheetName, int rowNumber, Map<String, String> raw, Map<String, String> mapping) {
    List<String> notes = new ArrayList<>();
    List<String> errors = new ArrayList<>();
    String dimensionText = valueFor(raw, mapping.get("dimensionText"));
    List<Double> dimensions = parseDimensionText(dimensionText);
    Integer quantity = positiveInteger(valueFor(raw, mapping.get("quantity")));
    Double lengthCm = positiveNumber(valueFor(raw, mapping.get("lengthCm")), unitFromHeader(mapping.get("lengthCm")), dimensionsValue(dimensions, 0));
    Double widthCm = positiveNumber(valueFor(raw, mapping.get("widthCm")), unitFromHeader(mapping.get("widthCm")), dimensionsValue(dimensions, 1));
    Double heightCm = positiveNumber(valueFor(raw, mapping.get("heightCm")), unitFromHeader(mapping.get("heightCm")), dimensionsValue(dimensions, 2));
    Double totalWeightKg = nonNegativeNumber(valueFor(raw, mapping.get("totalWeightKg")), weightUnitFromHeader(mapping.get("totalWeightKg")), null);
    Double weightKg = nonNegativeNumber(
        valueFor(raw, mapping.get("weightKg")),
        weightUnitFromHeader(mapping.get("weightKg")),
        totalWeightKg != null && quantity != null && quantity > 0 ? totalWeightKg / quantity : null
    );
    String name = cleanCell(firstNonBlank(valueFor(raw, mapping.get("name")), valueFor(raw, mapping.get("id"))));
    String model = cleanCell(valueFor(raw, mapping.get("model")));
    String remark = cleanCell(valueFor(raw, mapping.get("remark")));
    String type = normalizeType(valueFor(raw, mapping.get("type")), remark);
    String color = normalizeColor(valueFor(raw, mapping.get("color")));
    String sku = cleanCell(valueFor(raw, mapping.get("id")));

    if (name.isBlank()) errors.add("缺少货物名称");
    if (lengthCm == null || lengthCm <= 0) errors.add("长度必须大于 0");
    if (widthCm == null || widthCm <= 0) errors.add("宽度必须大于 0");
    if (heightCm == null || heightCm <= 0) errors.add("高度必须大于 0");
    if (quantity == null || quantity <= 0) errors.add("数量必须是正整数");
    if (weightKg == null) errors.add("单件重量必须大于等于 0");
    if (!dimensionText.isBlank() && dimensions == null) notes.add("合并尺寸未识别，已尝试使用独立长宽高字段");
    if (totalWeightKg != null && valueFor(raw, mapping.get("weightKg")).isBlank()) notes.add("已用总重量 / 数量换算单件重量");

    Map<String, Object> cargo = cargoMap(name, model, lengthCm, widthCm, heightCm, quantity, weightKg, type, color, sku, remark);
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
    cargo.put("type", type);
    cargo.put("color", color);
    cargo.put("sku", sku);
    cargo.put("remark", remark);
    return cargo;
  }

  private Map<String, Object> buildSuggestion(
      Map<String, String> raw,
      Map<String, Object> cargo,
      List<String> errors,
      int rowNumber
  ) {
    List<Double> fallbackDimensions = inferDimensionsFromRow(raw);
    String cargoRemark = String.valueOf(cargo.getOrDefault("remark", ""));
    Map<String, Object> suggested = new LinkedHashMap<>();
    suggested.put("name", firstNonBlank(String.valueOf(cargo.getOrDefault("name", "")), inferNameFromRow(raw), "第 " + rowNumber + " 行货物"));
    suggested.put("model", String.valueOf(cargo.getOrDefault("model", "")));
    suggested.put("lengthCm", positiveOrFallback(cargo.get("lengthCm"), dimensionsValue(fallbackDimensions, 0)));
    suggested.put("widthCm", positiveOrFallback(cargo.get("widthCm"), dimensionsValue(fallbackDimensions, 1)));
    suggested.put("heightCm", positiveOrFallback(cargo.get("heightCm"), dimensionsValue(fallbackDimensions, 2)));
    suggested.put("quantity", positiveIntegerValue(cargo.get("quantity"), 1));
    suggested.put("weightKg", nonNegativeValue(cargo.get("weightKg"), 0));
    suggested.put("type", firstNonBlank(String.valueOf(cargo.getOrDefault("type", "")), normalizeType("", cargoRemark)));
    suggested.put("color", String.valueOf(cargo.getOrDefault("color", "")));
    suggested.put("sku", String.valueOf(cargo.getOrDefault("sku", "")));
    suggested.put("remark", cargoRemark);

    List<String> notes = new ArrayList<>();
    if (errors.stream().anyMatch((error) -> error.contains("名称"))) notes.add("名称缺失，已用原始行文本或行号生成临时名称");
    if (errors.stream().anyMatch((error) -> error.contains("数量"))) notes.add("数量缺失，建议先按 1 件导入，请确认");
    if (errors.stream().anyMatch((error) -> error.contains("重量"))) notes.add("重量缺失，建议先按 0 kg 导入，请确认");
    if (errors.stream().anyMatch((error) -> error.contains("长度") || error.contains("宽度") || error.contains("高度"))) {
      notes.add(fallbackDimensions == null ? "尺寸仍未识别，需要手动补充长宽高" : "已从整行文本中重新识别长宽高");
    }

    Map<String, Object> suggestion = new LinkedHashMap<>();
    suggestion.put("cargo", suggested);
    suggestion.put("notes", notes);
    suggestion.put("errors", validateCargo(suggested));
    return suggestion;
  }

  private Map<String, Object> buildIssue(ParsedRow row) {
    Map<String, Object> issue = new LinkedHashMap<>();
    issue.put("sheetName", row.sheetName());
    issue.put("rowNumber", row.rowNumber());
    issue.put("errors", row.errors());
    issue.put("notes", row.notes());
    issue.put("raw", row.raw());
    issue.put("suggestion", row.suggestion());
    return issue;
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
          String.valueOf(cargo.getOrDefault("color", ""))
      ).toString();
      Map<String, Object> existing = aggregate.get(key);
      if (existing == null) {
        aggregate.put(key, new LinkedHashMap<>(cargo));
      } else {
        existing.put("quantity", numberValue(existing.get("quantity")) + numberValue(cargo.get("quantity")));
      }
    }
    return assignCargoModels(new ArrayList<>(aggregate.values()));
  }

  private List<Map<String, Object>> assignCargoModels(List<Map<String, Object>> cargos) {
    Map<String, List<Map<String, Object>>> byName = new LinkedHashMap<>();
    for (Map<String, Object> cargo : cargos) {
      String name = cleanCell(cargo.get("name"));
      if (name.isBlank()) continue;
      byName.computeIfAbsent(name, (ignored) -> new ArrayList<>()).add(cargo);
    }

    List<Map<String, Object>> result = new ArrayList<>();
    for (Map<String, Object> cargo : cargos) {
      Map<String, Object> next = new LinkedHashMap<>(cargo);
      List<Map<String, Object>> siblings = byName.getOrDefault(cleanCell(cargo.get("name")), List.of());
      List<String> dimensionKeys = siblings.stream().map(this::dimensionKey).distinct().sorted(this::compareDimensionKey).toList();
      if (dimensionKeys.size() > 1 && cleanCell(cargo.get("model")).isBlank()) {
        int index = Math.max(0, dimensionKeys.indexOf(dimensionKey(cargo)));
        next.put("model", "型号 " + modelLabel(index));
      }
      result.add(next);
    }
    return result;
  }

  private List<String> validateCargo(Map<String, Object> cargo) {
    List<String> errors = new ArrayList<>();
    if (String.valueOf(cargo.getOrDefault("name", "")).isBlank()) errors.add("缺少货物名称");
    if (numberValue(cargo.get("lengthCm")) <= 0) errors.add("长度必须大于 0");
    if (numberValue(cargo.get("widthCm")) <= 0) errors.add("宽度必须大于 0");
    if (numberValue(cargo.get("heightCm")) <= 0) errors.add("高度必须大于 0");
    if (numberValue(cargo.get("quantity")) <= 0 || numberValue(cargo.get("quantity")) % 1 != 0) errors.add("数量必须是正整数");
    if (numberValue(cargo.get("weightKg")) < 0) errors.add("单件重量必须大于等于 0");
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
            .anyMatch((alias) -> !alias.isBlank() && (normalized.contains(alias) || alias.contains(normalized)));
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
      List<String> aliases = FIELD_ALIASES.getOrDefault(field.key(), List.of()).stream()
          .map(this::normalizeHeader)
          .toList();
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
          if (aliases.stream().anyMatch((alias) -> !alias.isBlank() && (header.contains(alias) || alias.contains(header)))) {
            matchIndex = i;
            break;
          }
        }
      }
      mapping.put(field.key(), matchIndex >= 0 ? headers.get(matchIndex) : "");
    }
    if (mapping.get("name").isBlank() && !mapping.get("id").isBlank()) {
      mapping.put("name", mapping.get("id"));
    }
    return mapping;
  }

  private List<Double> parseDimensionText(String value) {
    String text = cleanCell(value);
    if (text.isBlank()) return null;
    Matcher matcher = DIMENSION_NUMBER_PATTERN.matcher(text);
    List<Double> numbers = new ArrayList<>();
    while (matcher.find()) {
      numbers.add(Double.parseDouble(matcher.group()));
    }
    if (numbers.size() < 3) return null;
    String unit = unitFromHeader(text);
    return numbers.stream().limit(3).map((number) -> convertDimension(number, unit)).toList();
  }

  private List<Double> inferDimensionsFromRow(Map<String, String> raw) {
    for (String value : raw.values()) {
      List<Double> dimensions = parseDimensionText(value);
      if (dimensions != null) return dimensions.stream().map(this::round2).toList();
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
    return converted > 0 ? converted : null;
  }

  private Double nonNegativeNumber(String value, String unit, Double fallback) {
    Double number = numberFromCell(value);
    if (number == null) return fallback;
    double converted = convertWeight(number, unit);
    return converted >= 0 ? converted : null;
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

  private String unitFromHeader(String value) {
    String text = cleanCell(value).toLowerCase(Locale.ROOT);
    if (text.contains("mm") || text.contains("毫米")) return "mm";
    if ((Pattern.compile("(^|[^c])m([^m]|$)").matcher(text).find() || text.contains("米"))
        && !text.contains("cm") && !text.contains("厘米")) {
      return "m";
    }
    return "cm";
  }

  private String weightUnitFromHeader(String value) {
    String text = cleanCell(value).toLowerCase(Locale.ROOT);
    if (text.contains("吨") || text.contains("ton") || Pattern.compile("\\bt\\b").matcher(text).find()) return "t";
    if ((text.contains("克") || Pattern.compile("\\bg\\b").matcher(text).find())
        && !text.contains("kg") && !text.contains("公斤") && !text.contains("千克")) {
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
    String text = (cleanCell(value) + " " + cleanCell(remark)).toLowerCase(Locale.ROOT);
    for (TypeAlias alias : TYPE_ALIASES) {
      if (alias.words().stream().anyMatch((word) -> text.contains(word.toLowerCase(Locale.ROOT)))) {
        return alias.type();
      }
    }
    return "normal";
  }

  private String normalizeColor(String value) {
    String text = cleanCell(value);
    return text.matches("^#[0-9a-fA-F]{6}$") ? text : "";
  }

  private String dimensionKey(Map<String, Object> cargo) {
    return List.of(
        String.valueOf(round2(numberValue(cargo.get("lengthCm")))),
        String.valueOf(round2(numberValue(cargo.get("widthCm")))),
        String.valueOf(round2(numberValue(cargo.get("heightCm")))),
        String.valueOf(round2(numberValue(cargo.get("weightKg")))),
        String.valueOf(cargo.getOrDefault("type", "normal"))
    ).stream().reduce((left, right) -> left + "|" + right).orElse("");
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
    return cleanCell(value).toLowerCase(Locale.ROOT).replaceAll("[\\s_()（）\\-:：/\\\\.【】\\[\\]]", "");
  }

  private List<String> cleanCells(List<String> cells) {
    return cells.stream().map(this::cleanCell).toList();
  }

  private List<String> uniquifyHeaders(List<String> headers) {
    Map<String, Integer> seen = new LinkedHashMap<>();
    List<String> result = new ArrayList<>();
    for (int i = 0; i < headers.size(); i++) {
      String fallback = headers.get(i).isBlank() ? "未命名列" + (i + 1) : headers.get(i);
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

  private Double dimensionsValue(List<Double> dimensions, int index) {
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

  private double numberValue(Object value) {
    if (value instanceof Number number) return number.doubleValue();
    Double parsed = numberFromCell(String.valueOf(value == null ? "" : value));
    return parsed == null ? 0 : parsed;
  }

  private double round2(Double value) {
    if (value == null) return 0;
    return Math.round(value * 100.0) / 100.0;
  }

  private String normalizeSource(String mode) {
    return "manual".equalsIgnoreCase(cleanCell(mode)) ? "MANUAL" : "AGENT";
  }

  private String trim(String value, int length) {
    if (value == null) return null;
    return value.length() <= length ? value : value.substring(0, length);
  }

  private Map<String, Object> mapTaskRow(ResultSet rs, boolean includePayload) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", rs.getLong("id"));
    row.put("taskNo", rs.getString("task_no"));
    row.put("sourceChannel", rs.getString("source_channel"));
    row.put("originalFileName", rs.getString("original_file_name"));
    row.put("status", rs.getString("status"));
    row.put("rowCount", rs.getInt("row_count"));
    row.put("validCount", rs.getInt("valid_count"));
    row.put("issueCount", rs.getInt("issue_count"));
    row.put("cleanedCount", rs.getInt("cleaned_count"));
    row.put("agentNotes", rs.getString("agent_notes"));
    row.put("errorMessage", rs.getString("error_message"));
    row.put("createdAt", stringTimestamp(rs, "created_at"));
    row.put("updatedAt", stringTimestamp(rs, "updated_at"));
    row.put("finishedAt", stringTimestamp(rs, "finished_at"));
    if (includePayload) {
      row.put("cleanedRows", parseJsonList(rs.getString("cleaned_json")));
      row.put("issues", parseJsonList(rs.getString("issues_json")));
    }
    return row;
  }

  private List<Map<String, Object>> parseJsonList(String json) {
    if (json == null || json.isBlank()) return List.of();
    try {
      return objectMapper.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
    } catch (JsonProcessingException error) {
      return List.of();
    }
  }

  private String stringTimestamp(ResultSet rs, String column) throws SQLException {
    Timestamp timestamp = rs.getTimestamp(column);
    return timestamp == null ? null : timestamp.toInstant().toString();
  }

  private record FieldDef(String key, boolean required) {}

  private record TypeAlias(String type, List<String> words) {}

  private record ParsedRow(
      String sheetName,
      int rowNumber,
      Map<String, String> raw,
      Map<String, Object> cargo,
      List<String> errors,
      List<String> notes,
      Map<String, Object> suggestion
  ) {}

  private record CleaningResult(
      int rowCount,
      int validCount,
      int issueCount,
      List<Map<String, Object>> cleanedRows,
      List<Map<String, Object>> issues,
      String agentNotes
  ) {}
}
