package com.cargoplanner.backend.text.workbook;

import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.ss.format.CellFormat;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/** Read-only workbook evidence. Reading does not assign business meanings to columns. */
@Service
public class WorkbookEvidenceService {
  private static final int MAX_BYTES = 16 * 1024 * 1024;
  private static final int MAX_ROWS = 20_000;
  private static final int MAX_COLUMNS = 256;
  private static final int MAX_CELLS = 200_000;
  private static final int MAX_CELL_CHARS = 4_000;
  private static final int MAX_TOTAL_CELL_CHARS = 2_000_000;
  private static final Pattern ADDRESS = Pattern.compile("^([A-Z]{1,3})([1-9][0-9]{0,5})$");
  private static final Pattern QUOTED_EXPONENT_LETTER = Pattern.compile("\"[^\"]*[eE][^\"]*\"");

  public Map<String, Object> parse(MultipartFile file) {
    if (file == null || file.isEmpty() || file.getSize() > MAX_BYTES) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a non-empty workbook no larger than 16 MB");
    }
    try {
      return parse(file.getBytes(), file.getOriginalFilename());
    } catch (IOException error) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Could not read uploaded workbook");
    }
  }

  public Map<String, Object> parse(byte[] bytes, String originalName) {
    if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) throw invalid("Workbook file size is invalid");
    String fileName = originalName == null ? "workbook.xlsx" : originalName.replace('\\', '/');
    fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
    String extension = fileName.toLowerCase(Locale.ROOT);
    List<Map<String, Object>> sheets;
    try {
      if (extension.endsWith(".csv") || extension.endsWith(".tsv")) {
        sheets = List.of(delimitedSheet(decode(bytes), extension.endsWith(".tsv") ? '\t' : ','));
      } else if (extension.endsWith(".xls") || extension.endsWith(".xlsx")) {
        sheets = excelSheets(bytes);
      } else {
        throw invalid("Only XLSX, XLS, CSV and TSV are supported");
      }
    } catch (ApiException error) {
      throw error;
    } catch (Exception error) {
      throw invalid("Workbook is unreadable, encrypted, or exceeds the supported limits");
    }
    long cellCount = sheets.stream().mapToLong(sheet -> list(sheet.get("cells")).size()).sum();
    if (cellCount == 0 || cellCount > MAX_CELLS) throw invalid("Workbook cell count is unsupported");
    Map<String, Object> document = new LinkedHashMap<>();
    document.put("formatVersion", "workbook-evidence-v1");
    document.put("fileName", fileName);
    document.put("sheets", sheets);
    document.put("formulaPolicy", "cached-values-only; no formulas, macros or external links are executed");
    document.put("truncated", false);
    try {
      if (new ObjectMapper().writeValueAsBytes(document).length > 8 * 1024 * 1024) {
        throw invalid("Workbook evidence exceeds 8 MB; split it into complete shipment documents");
      }
    } catch (JsonProcessingException error) {
      throw invalid("Workbook evidence cannot be serialized");
    }
    return document;
  }

  private List<Map<String, Object>> excelSheets(byte[] bytes) throws IOException {
    List<Map<String, Object>> result = new ArrayList<>();
    long totalCellChars = 0;
    DataFormatter formatter = new DataFormatter(Locale.ROOT);
    formatter.setUseCachedValuesForFormulaCells(true);
    try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
      if (workbook.getNumberOfSheets() > 32) throw invalid("Workbook has more than 32 sheets");
      for (int index = 0; index < workbook.getNumberOfSheets(); index++) {
        Sheet sheet = workbook.getSheetAt(index);
        int rowCount = sheet.getPhysicalNumberOfRows() == 0 ? 0 : sheet.getLastRowNum() + 1;
        if (rowCount > MAX_ROWS) throw invalid("Workbook has more than 20000 rows in a sheet");
        List<Map<String, Object>> cells = new ArrayList<>();
        int columnCount = 0;
        List<Integer> hiddenRows = new ArrayList<>();
        for (Row row : sheet) {
          if (row.getZeroHeight()) hiddenRows.add(row.getRowNum() + 1);
          for (Cell cell : row) {
            columnCount = Math.max(columnCount, cell.getColumnIndex() + 1);
            if (columnCount > MAX_COLUMNS) throw invalid("Workbook has more than 256 columns");
            Object value = cellValue(cell);
            String display = displayValue(cell, value, formatter);
            if (display.isEmpty() && cell.getCellType() != CellType.FORMULA) continue;
            totalCellChars += display.length() + String.valueOf(value).length();
            if (totalCellChars > MAX_TOTAL_CELL_CHARS) throw invalid("Workbook text exceeds the supported evidence size");
            Map<String, Object> evidence = cell(cell.getRowIndex() + 1, cell.getColumnIndex() + 1, value, display);
            evidence.put("type", cell.getCellType().name().toLowerCase(Locale.ROOT));
            if (cell.getCellType() == CellType.FORMULA) {
              if (cell.getCellFormula().length() > MAX_CELL_CHARS) throw invalid("A workbook formula exceeds 4000 characters");
              totalCellChars += cell.getCellFormula().length();
              if (totalCellChars > MAX_TOTAL_CELL_CHARS) throw invalid("Workbook text exceeds the supported evidence size");
              evidence.put("formula", cell.getCellFormula());
              evidence.put("cachedValue", value);
              evidence.put("cachedType", cell.getCachedFormulaResultType().name().toLowerCase(Locale.ROOT));
            }
            cells.add(evidence);
            if (cells.size() > MAX_CELLS) throw invalid("Workbook contains too many cells");
          }
        }
        List<Map<String, Object>> merges = new ArrayList<>();
        for (var range : sheet.getMergedRegions()) {
          merges.add(Map.of(
              "range", range.formatAsString(), "firstRow", range.getFirstRow() + 1,
              "lastRow", range.getLastRow() + 1, "firstColumn", range.getFirstColumn() + 1,
              "lastColumn", range.getLastColumn() + 1,
              "anchorAddress", new CellReference(range.getFirstRow(), range.getFirstColumn()).formatAsString()
          ));
        }
        Map<String, Object> evidence = sheet(sheet.getSheetName(), rowCount, columnCount, cells, merges);
        evidence.put("hidden", workbook.isSheetHidden(index) || workbook.isSheetVeryHidden(index));
        evidence.put("hiddenRows", hiddenRows);
        List<Integer> hiddenColumns = new ArrayList<>();
        for (int column = 0; column < columnCount; column++) {
          if (sheet.isColumnHidden(column)) hiddenColumns.add(column + 1);
        }
        evidence.put("hiddenColumns", hiddenColumns);
        result.add(evidence);
      }
    }
    return result;
  }

  private Object cellValue(Cell cell) {
    CellType type = cell.getCellType() == CellType.FORMULA ? cell.getCachedFormulaResultType() : cell.getCellType();
    return switch (type) {
      case NUMERIC -> cell.getNumericCellValue();
      case BOOLEAN -> cell.getBooleanCellValue();
      case STRING -> cell.getStringCellValue();
      case ERROR -> "#ERROR:" + cell.getErrorCellValue();
      default -> "";
    };
  }

  private String displayValue(Cell cell, Object value, DataFormatter formatter) {
    String format = cell.getCellStyle().getDataFormatString();
    // DataFormatter treats E inside a quoted literal (e.g. "CASE#"0000)
    // as an exponent and inserts '+'. CellFormat respects literal prefixes.
    // Numeric arithmetic always uses the original value, never this display.
    if (value instanceof Number number && format != null
        && QUOTED_EXPONENT_LETTER.matcher(format).find() && !DateUtil.isCellDateFormatted(cell)) {
      try {
        var formatted = CellFormat.getInstance(Locale.ROOT, format).apply(number.doubleValue());
        if (!formatted.applies) throw invalid("A numeric cell has an unsupported literal number format");
        return formatted.text;
      } catch (ApiException error) {
        throw error;
      } catch (RuntimeException error) {
        throw invalid("A numeric cell has an unreadable literal number format; store identifiers as text");
      }
    }
    return formatter.formatCellValue(cell);
  }

  private Map<String, Object> delimitedSheet(String text, char delimiter) {
    if (text.length() > MAX_TOTAL_CELL_CHARS / 2) throw invalid("Delimited text exceeds the supported evidence size");
    List<Map<String, Object>> cells = new ArrayList<>();
    List<String> record = new ArrayList<>();
    StringBuilder field = new StringBuilder();
    boolean quoted = false;
    boolean afterQuote = false;
    int row = 1, columns = 0;
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      if (c == '"') {
        if (quoted && i + 1 < text.length() && text.charAt(i + 1) == '"') {
          field.append('"');
          i++;
        } else if (quoted) {
          quoted = false;
          afterQuote = true;
        } else if (field.length() == 0 && !afterQuote) {
          quoted = true;
        } else {
          throw invalid("CSV quotes must enclose the entire field");
        }
      } else if (afterQuote && c != delimiter && c != '\r' && c != '\n') {
        if (!Character.isWhitespace(c)) throw invalid("Unexpected data after a quoted CSV field");
      } else if (!quoted && (c == delimiter || c == '\r' || c == '\n')) {
        record.add(field.toString());
        field.setLength(0);
        afterQuote = false;
        if (c != delimiter) {
          columns = Math.max(columns, appendRecord(cells, record, row++));
          record.clear();
          if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') i++;
        }
      } else {
        if (c == '\0') throw invalid("Delimited file contains binary data");
        field.append(c);
      }
      if (field.length() > MAX_CELL_CHARS) throw invalid("A workbook cell exceeds 4000 characters");
      if (row > MAX_ROWS + 1 || record.size() >= MAX_COLUMNS) throw invalid("Delimited file exceeds row or column limits");
    }
    if (quoted) throw invalid("CSV quoted field is not closed");
    if (field.length() > 0 || !record.isEmpty()) {
      record.add(field.toString());
      columns = Math.max(columns, appendRecord(cells, record, row++));
    }
    return sheet("Data", row - 1, columns, cells, List.of());
  }

  private int appendRecord(List<Map<String, Object>> cells, List<String> record, int row) {
    if (row > MAX_ROWS || record.size() > MAX_COLUMNS) throw invalid("Delimited file exceeds row or column limits");
    for (int column = 0; column < record.size(); column++) {
      String value = record.get(column);
      if (!value.isEmpty()) cells.add(cell(row, column + 1, value, value));
    }
    if (cells.size() > MAX_CELLS) throw invalid("Workbook contains too many cells");
    return record.size();
  }

  private String decode(byte[] bytes) {
    if (bytes.length >= 2 && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xfe) {
      return new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16LE);
    }
    if (bytes.length >= 2 && bytes[0] == (byte) 0xfe && bytes[1] == (byte) 0xff) {
      return new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16BE);
    }
    int offset = bytes.length >= 3 && bytes[0] == (byte) 0xef && bytes[1] == (byte) 0xbb && bytes[2] == (byte) 0xbf ? 3 : 0;
    for (Charset charset : List.of(StandardCharsets.UTF_8, Charset.forName("GB18030"))) {
      try {
        return charset.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes, offset, bytes.length - offset)).toString();
      } catch (CharacterCodingException error) {
        // Try the next explicitly supported encoding without replacing data.
      }
    }
    throw invalid("CSV encoding is unsupported");
  }

  private static Map<String, Object> sheet(String name, int rows, int columns,
      List<Map<String, Object>> cells, List<Map<String, Object>> merges) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("name", name);
    result.put("rowCount", rows);
    result.put("columnCount", columns);
    result.put("cells", cells);
    result.put("merges", merges);
    return result;
  }

  private static Map<String, Object> cell(int row, int column, Object value, String display) {
    if (display.length() > MAX_CELL_CHARS || String.valueOf(value).length() > MAX_CELL_CHARS) {
      throw invalid("A workbook cell exceeds 4000 characters");
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("address", address(row, column));
    result.put("row", row);
    result.put("column", column);
    result.put("type", value instanceof Number ? "numeric" : "string");
    result.put("value", value);
    result.put("displayValue", display);
    return result;
  }

  public static Map<String, Object> describe(Map<String, Object> document) {
    List<Map<String, Object>> result = new ArrayList<>();
    for (Map<String, Object> sheet : list(document.get("sheets"))) {
      Map<String, Object> summary = new LinkedHashMap<>();
      for (String field : List.of("name", "rowCount", "columnCount", "hidden", "hiddenRows", "hiddenColumns")) {
        if (sheet.containsKey(field)) summary.put(field, sheet.get(field));
      }
      summary.put("nonEmptyCells", list(sheet.get("cells")).size());
      summary.put("mergedRangeCount", list(sheet.get("merges")).size());
      summary.put("preview", list(sheet.get("cells")).stream().limit(45).toList());
      result.add(summary);
    }
    return Map.of("fileName", document.getOrDefault("fileName", "workbook"), "sheets", result,
        "instruction", "Read sheet ranges to inspect all required data, merged ranges and total cells before returning a plan.");
  }

  public static Map<String, Object> readRange(Map<String, Object> document, String sheetName, String range) {
    String[] ends = String.valueOf(range).toUpperCase(Locale.ROOT).split(":", -1);
    if (ends.length < 1 || ends.length > 2) throw new IllegalArgumentException("Use an A1 or A1:K50 range");
    int[] start = coordinate(ends[0]), end = coordinate(ends[ends.length - 1]);
    if (end[0] < start[0] || end[1] < start[1] || end[0] - start[0] >= 200 || end[1] - start[1] >= 30) {
      throw new IllegalArgumentException("Read at most 200 rows and 30 columns per call, in ascending order");
    }
    Map<String, Object> sheet = findSheet(document, sheetName);
    if (end[0] > integer(sheet.get("rowCount")) || end[1] > integer(sheet.get("columnCount"))) {
      throw new IllegalArgumentException("Range is outside the worksheet");
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("sheet", sheetName);
    result.put("range", range);
    result.put("firstRow", start[0]); result.put("lastRow", end[0]);
    result.put("firstColumn", start[1]); result.put("lastColumn", end[1]);
    result.put("cells", list(sheet.get("cells")).stream().filter(cell ->
        between(integer(cell.get("row")), start[0], end[0]) && between(integer(cell.get("column")), start[1], end[1])).toList());
    result.put("merges", list(sheet.get("merges")).stream().filter(merge ->
        integer(merge.get("firstRow")) <= end[0] && integer(merge.get("lastRow")) >= start[0]
        && integer(merge.get("firstColumn")) <= end[1] && integer(merge.get("lastColumn")) >= start[1]).toList());
    result.put("truncated", false);
    result.put("blankCellsAreEmpty", true);
    result.put("mergedValuesRemainAtAnchor", true);
    return result;
  }

  public static Map<String, Object> findSheet(Map<String, Object> document, String name) {
    return list(document.get("sheets")).stream().filter(sheet -> name.equals(sheet.get("name"))).findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Unknown worksheet"));
  }

  public static int[] coordinate(String address) {
    Matcher matcher = ADDRESS.matcher(String.valueOf(address).toUpperCase(Locale.ROOT));
    if (!matcher.matches()) throw new IllegalArgumentException("Invalid cell address");
    int column = 0;
    for (char letter : matcher.group(1).toCharArray()) column = column * 26 + letter - 'A' + 1;
    int row = Integer.parseInt(matcher.group(2));
    if (row > MAX_ROWS || column > MAX_COLUMNS) throw new IllegalArgumentException("Cell address exceeds workbook limits");
    return new int[] {row, column};
  }

  public static String address(int row, int column) {
    return CellReference.convertNumToColString(column - 1) + row;
  }

  @SuppressWarnings("unchecked")
  public static List<Map<String, Object>> list(Object value) {
    return value instanceof List<?> rows ? (List<Map<String, Object>>) rows : List.of();
  }

  private static int integer(Object value) { return ((Number) value).intValue(); }
  private static boolean between(int value, int low, int high) { return value >= low && value <= high; }
  private static ApiException invalid(String message) { return new ApiException(HttpStatus.BAD_REQUEST, message); }
}
