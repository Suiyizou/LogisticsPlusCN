package com.cargoplanner.backend.text.workbook;

import static org.junit.jupiter.api.Assertions.*;

import com.cargoplanner.backend.common.ApiException;
import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class WorkbookEvidenceServiceTest {
  private final WorkbookEvidenceService reader = new WorkbookEvidenceService();

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void preservesCoordinatesMergedCellsNativeNumbersAndFormulaCaches(boolean legacy) throws Exception {
    byte[] bytes;
    try (Workbook book = legacy ? new HSSFWorkbook() : new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      var sheet = book.createSheet("Packages");
      var header = sheet.createRow(0);
      header.createCell(0).setCellValue("Item"); header.createCell(1).setCellValue("Contents");
      var first = sheet.createRow(1);
      first.createCell(0).setCellValue(1);
      first.createCell(1).setCellValue("Valve A");
      first.createCell(2).setCellValue(0.125);
      first.createCell(3).setCellFormula("SUM(1,2)");
      sheet.createRow(2).createCell(1).setCellValue("Valve B");
      sheet.addMergedRegion(new CellRangeAddress(1, 2, 0, 0));
      sheet.getRow(2).setZeroHeight(true);
      sheet.setColumnHidden(2, true);
      book.getCreationHelper().createFormulaEvaluator().evaluateAll();
      book.write(out); bytes = out.toByteArray();
    }
    Map<String, Object> document = reader.parse(bytes, legacy ? "source.xls" : "source.xlsx");
    Map<String, Object> range = WorkbookEvidenceService.readRange(document, "Packages", "A1:D3");
    List<Map<String, Object>> cells = WorkbookEvidenceService.list(range.get("cells"));
    assertEquals(0.125, cells.stream().filter(c -> c.get("address").equals("C2")).findFirst().orElseThrow().get("value"));
    var formula = cells.stream().filter(c -> c.get("address").equals("D2")).findFirst().orElseThrow();
    assertEquals("SUM(1,2)", formula.get("formula")); assertEquals(3.0, formula.get("cachedValue"));
    assertTrue(cells.stream().noneMatch(c -> c.get("address").equals("A3")), "Merged child must remain empty");
    assertEquals("A2:A3", WorkbookEvidenceService.list(range.get("merges")).get(0).get("range"));
    var source = WorkbookEvidenceService.findSheet(document, "Packages");
    assertEquals(List.of(3), source.get("hiddenRows")); assertEquals(List.of(3), source.get("hiddenColumns"));
    assertEquals(false, range.get("truncated"));
  }

  @Test
  void preservesQuotedIdentifierPrefixesWithoutTreatingLiteralEAsAnExponent() throws Exception {
    byte[] bytes;
    List<String> formats = List.of("\"CASE\"0000", "\"CASE#\"0000", "\"CODE\"000;[Red]-\"CODE\"000", "000000", "0.00E+00");
    List<String> expected = List.of("CASE0007", "CASE#0007", "CODE007", "000007", "7.00E+00");
    try (Workbook book = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      var row = book.createSheet("Packages").createRow(0);
      for (int i = 0; i < formats.size(); i++) {
        var cell = row.createCell(i); cell.setCellValue(7);
        var style = book.createCellStyle(); style.setDataFormat(book.createDataFormat().getFormat(formats.get(i)));
        cell.setCellStyle(style);
      }
      book.write(out); bytes = out.toByteArray();
    }
    var cells = WorkbookEvidenceService.list(WorkbookEvidenceService.readRange(reader.parse(bytes, "source.xlsx"), "Packages", "A1:E1").get("cells"));
    for (int i = 0; i < formats.size(); i++) {
      assertEquals(expected.get(i), cells.get(i).get("displayValue"));
      assertEquals(7.0, cells.get(i).get("value"));
    }
  }

  @Test
  void readsCsvQuotedMultilineEscapedQuotesAndLeadingZeroIdentifiersWithoutGuessingTypes() {
    var doc = reader.parse("Code,Note,QTY\r\n001,\"Two lines\nwith \"\"quotes\"\"\",20\r\n".getBytes(StandardCharsets.UTF_8), "source.csv");
    var range = WorkbookEvidenceService.readRange(doc, "Data", "A1:C2");
    var cells = WorkbookEvidenceService.list(range.get("cells"));
    assertEquals("001", cells.stream().filter(c -> c.get("address").equals("A2")).findFirst().orElseThrow().get("value"));
    assertEquals("Two lines\nwith \"quotes\"", cells.stream().filter(c -> c.get("address").equals("B2")).findFirst().orElseThrow().get("value"));
    assertEquals(2, WorkbookEvidenceService.findSheet(doc, "Data").get("rowCount"));
  }

  @Test
  void supportsTsvAndGb18030WithoutReplacingCharacters() {
    var doc = reader.parse("Name\tQTY\n阀门\t6\n".getBytes(Charset.forName("GB18030")), "source.tsv");
    var cells = WorkbookEvidenceService.list(WorkbookEvidenceService.readRange(doc, "Data", "A1:B2").get("cells"));
    assertEquals("阀门", cells.stream().filter(c -> c.get("address").equals("A2")).findFirst().orElseThrow().get("value"));
  }

  @Test
  void refusesUnclosedQuotesTrailingDataBinaryAndOversizedCells() {
    for (String invalid : List.of("A\n\"unclosed", "A\n\"closed\"garbage", "A\nabc\u0000xyz", "A\n" + "x".repeat(4001))) {
      assertThrows(ApiException.class, () -> reader.parse(invalid.getBytes(StandardCharsets.UTF_8), "source.csv"));
    }
  }

  @Test
  void refusesInvalidRangesUnknownSheetsAndSilentTruncation() {
    var doc = reader.parse("A,B\n1,2\n".getBytes(StandardCharsets.UTF_8), "source.csv");
    for (String range : List.of("A1:B201", "A1:AE2", "A0:B2", "B2:A1", "A1:B3", "../../file", "XFD1048576")) {
      assertThrows(IllegalArgumentException.class, () -> WorkbookEvidenceService.readRange(doc, "Data", range));
    }
    assertThrows(IllegalArgumentException.class, () -> WorkbookEvidenceService.readRange(doc, "Missing", "A1"));
    assertThrows(ApiException.class, () -> reader.parse(new byte[0], "empty.xlsx"));
    assertThrows(ApiException.class, () -> reader.parse(new byte[] {1, 2, 3}, "source.exe"));
  }
}
