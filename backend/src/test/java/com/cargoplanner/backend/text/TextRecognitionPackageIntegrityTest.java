package com.cargoplanner.backend.text;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.cargoplanner.backend.admin.LlmSettingsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.test.util.ReflectionTestUtils;

class TextRecognitionPackageIntegrityTest {
  private final ObjectMapper mapper = new ObjectMapper();
  private JdbcTemplate jdbc;
  private TextRecognitionService service;

  @BeforeEach
  void setUp() {
    jdbc = mock(JdbcTemplate.class);
    service = new TextRecognitionService(jdbc, mapper, mock(LlmSettingsService.class), 3);
  }

  @AfterEach
  void tearDown() {
    service.shutdownRecognitionExecutor();
  }

  @Test
  void bareProductQuantityCannotReplaceOnePhysicalPackage() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH", "SHEET 1: Packages", "DETECTED_HEADER_ROW: 8",
        "R8: A=\"Item\" | B=\"Marks\" | C=\"Product\" | E=\"QTY\" | H=\"G.W (kg)\"",
        "R9: A=\"1\" | B=\"PACK#1\" | C=\"Valve\" | E=\"20\" | H=\"810\"");
    Map<String, Object> row = packageCargo("1", "PACK#1", "Packages", List.of(9, 10));
    ReflectionTestUtils.invokeMethod(service, "applyExplicitSourceFields", row, input, 9);
    assertEquals(1, row.get("quantity"));
    assertEquals(810.0, row.get("weightKg"));
    assertEquals(22, inner(row).get("totalQuantity"));
  }

  @Test
  void explicitlyNamedPackageCountStillRepairsIncompleteModelQuantity() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH", "SHEET 1: Packages", "DETECTED_HEADER_ROW: 1",
        "R1: A=\"货物名称\" | B=\"最终搬运单元数量\" | C=\"单箱毛重\"",
        "R2: A=\"Crates\" | B=\"6\" | C=\"810\"");
    Map<String, Object> row = packageCargo("1", "PACK#1", "Packages", List.of(2));
    row.put("quantity", 0);
    ReflectionTestUtils.invokeMethod(service, "applyExplicitSourceFields", row, input, 2);
    assertEquals(6, row.get("quantity"));
  }

  @Test
  void normalizationRetainsPackageIdentitySingleSourceRowAndAllMixedContents() {
    Map<String, Object> row = packageCargo("1", "PACK#1", "Packages", List.of(9, 10));
    row.remove("sourceRowNumbers");
    Map<String, Object> cargo = normalized(row, 9);
    assertEquals("1", cargo.get("packageNo"));
    assertEquals("PACK#1", cargo.get("marks"));
    assertEquals("Packages", cargo.get("sourceSheet"));
    assertEquals(9, cargo.get("sourceRowNumber"));
    assertEquals(List.of(9, 10), cargo.get("sourceRowNumbers"));
    assertEquals(22, inner(cargo).get("totalQuantity"));
    assertEquals(2, ((List<?>) inner(cargo).get("lines")).size());
  }

  @Test
  void physicallyDistinctPackagesNeverCollapseEvenWhenDimensionsWeightAndSkuMatch() {
    Map<String, Object> first = normalized(packageCargo("1", "PACK#1", "A", List.of(9, 10)), 9);
    Map<String, Object> second = normalized(packageCargo("2", "PACK#2", "A", List.of(11, 12)), 11);
    Map<String, Object> otherSheet = normalized(packageCargo("1", "PACK#1", "B", List.of(9, 10)), 9);
    List<Map<String, Object>> rows = aggregated(List.of(first, second, otherSheet));
    assertEquals(3, rows.size());
    assertEquals(3, rows.stream().mapToInt(row -> ((Number) row.get("quantity")).intValue()).sum());
    assertEquals(2430.0, rows.stream().mapToDouble(row -> ((Number) row.get("quantity")).doubleValue()
        * ((Number) row.get("weightKg")).doubleValue()).sum());
    assertEquals("B", rows.get(2).get("sourceSheet"));
  }

  @Test
  void duplicateIdentityRemainsVisibleForValidationInsteadOfSilentlyAddingItsQuantity() {
    Map<String, Object> first = normalized(packageCargo("1", "PACK#1", "A", List.of(9, 10)), 9);
    Map<String, Object> duplicate = normalized(packageCargo("1", "PACK#1", "A", List.of(11, 12)), 11);
    assertEquals(2, aggregated(List.of(first, duplicate)).size());
  }

  @Test
  void sourcePackageGroupsKeepTheirSeparateInnerContentsEvenWithoutIndividualBoxNumbers() {
    Map<String, Object> first = packageCargo("1", "PACK#1", "A", List.of(9, 10));
    first.remove("packageNo"); first.remove("marks");
    first.put("quantity", 6);
    first.put("packageInfo", Map.of("algorithmBasis", "source-package-group", "sourceRows", List.of(9, 10),
        "innerCargo", Map.of("totalQuantity", 36, "lines", List.of(Map.of("name", "Valve", "quantity", 36)))));
    Map<String, Object> second = new LinkedHashMap<>(first);
    second.put("packageInfo", Map.of("algorithmBasis", "source-package-group", "sourceRows", List.of(11, 12),
        "innerCargo", Map.of("totalQuantity", 48, "lines", List.of(Map.of("name", "Valve", "quantity", 48)))));
    List<Map<String, Object>> rows = aggregated(List.of(first, second));
    assertEquals(2, rows.size());
    assertEquals(36, inner(rows.get(0)).get("totalQuantity"));
    assertEquals(48, inner(rows.get(1)).get("totalQuantity"));
  }

  @Test
  void anonymousInterchangeableCargoStillAggregatesWithPerUnitWeight() {
    Map<String, Object> first = packageCargo("1", "PACK#1", "A", List.of(9));
    for (String field : List.of("packageNo", "marks", "sourceSheet", "packageInfo")) first.remove(field);
    Map<String, Object> second = new LinkedHashMap<>(first);
    List<Map<String, Object>> rows = aggregated(List.of(first, second));
    assertEquals(1, rows.size());
    assertEquals(2, rows.get(0).get("quantity"));
    assertEquals(810.0, rows.get(0).get("weightKg"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void excelExportKeepsLegacyColumnsAndRoundTripsProvenanceAndMixedContents() throws Exception {
    Map<String, Object> cargo = normalized(packageCargo("1", "PACK#1", "Packages", List.of(9, 10)), 9);
    Map<String, Object> reconciliation = Map.of("status", "review-required", "expected",
        Map.of("declaredVolumeM3", 96), "actual", Map.of("calculatedVolumeM3", 93.528148));
    Map<String, Object> task = Map.of("cleanedRows", List.of(cargo), "reconciliation", reconciliation);
    when(jdbc.query(anyString(), any(RowMapper.class), eq(7L))).thenReturn(List.of(task));
    try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(service.cleanedWorkbook(7L)))) {
      var sheet = workbook.getSheetAt(0);
      List<String> headers = new ArrayList<>();
      sheet.getRow(0).forEach(cell -> headers.add(cell.getStringCellValue()));
      assertEquals(List.of("name", "model", "lengthCm", "widthCm", "heightCm", "quantity", "weightKg", "type",
          "nonStack", "keepUpright", "color", "sku", "remark"), headers.subList(0, 13));
      assertEquals("PACK#1", sheet.getRow(1).getCell(headers.indexOf("marks")).getStringCellValue());
      assertEquals("[9,10]", sheet.getRow(1).getCell(headers.indexOf("sourceRows")).getStringCellValue());
      assertEquals(22.0, sheet.getRow(1).getCell(headers.indexOf("innerQuantity")).getNumericCellValue());
      assertEquals(810.0, sheet.getRow(1).getCell(headers.indexOf("totalWeightKg")).getNumericCellValue());
      Map<String, Object> exportedInfo = mapper.readValue(
          sheet.getRow(1).getCell(headers.indexOf("packageInfoJson")).getStringCellValue(), Map.class);
      assertEquals("PACK#1", exportedInfo.get("marks"));
      assertEquals(22, ((Map<?, ?>) exportedInfo.get("innerCargo")).get("totalQuantity"));
      assertNotNull(workbook.getSheet("reconciliation"));
    }
  }

  @Test
  void exposesNewEngineAndConservationFailuresAsBlocking() {
    assertEquals("excel-package-evidence-v7", service.capabilities().get("engineVersion"));
    assertTrue(Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(service, "isBlockingRecognitionIssueCode", "PACKAGE_SOURCE_INVALID")));
    assertTrue(Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(service, "isBlockingRecognitionIssueCode", "PACKAGE_CONSERVATION_MISMATCH")));
    assertFalse(Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(service, "isBlockingRecognitionIssueCode", "PACKAGE_RECONCILIATION")));
  }

  @Test
  void persistedReconciliationIsExposedAndConservationIssueMakesTheTaskPartial() throws Exception {
    Map<String, Object> reconciliation = Map.of("status", "blocked", "blockingIssues", List.of(
        Map.of("code", "PACKAGE_SOURCE_INVALID", "message", "Missing package gross weight")));
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getString("cleaned_json")).thenReturn("[]");
    when(resultSet.getString("issues_json")).thenReturn(mapper.writeValueAsString(List.of(
        Map.of("code", "PACKAGE_RECONCILIATION", "reconciliation", reconciliation),
        Map.of("code", "PACKAGE_CONSERVATION_MISMATCH", "errors", List.of("Confirm missing weight")))));
    Map<String, Object> task = ReflectionTestUtils.invokeMethod(service, "mapTaskRow", resultSet, true);
    assertNotNull(task);
    assertEquals(reconciliation, task.get("reconciliation"));
    assertEquals(true, task.get("partial"));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> normalized(Map<String, Object> row, int sourceRow) {
    Object parsed = ReflectionTestUtils.invokeMethod(service, "normalizeCargo", row, sourceRow, "package source");
    return ReflectionTestUtils.invokeMethod(parsed, "cargo");
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> aggregated(List<Map<String, Object>> rows) {
    return ReflectionTestUtils.invokeMethod(service, "aggregateCargos", rows);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> inner(Map<String, Object> row) {
    return (Map<String, Object>) ((Map<String, Object>) row.get("packageInfo")).get("innerCargo");
  }

  private Map<String, Object> packageCargo(String packageNo, String marks, String sheet, List<Integer> sourceRows) {
    Map<String, Object> inner = Map.of("totalQuantity", 22, "quantityUnit", "pcs", "lines", List.of(
        Map.of("name", "Valve", "model", "DN200", "quantity", 20, "unitNetWeightKg", 36),
        Map.of("name", "Valve", "model", "DN100", "quantity", 2, "unitNetWeightKg", 13)));
    Map<String, Object> info = new LinkedHashMap<>();
    info.put("packageNo", packageNo);
    info.put("marks", marks);
    info.put("sourceSheet", sheet);
    info.put("sourceRows", sourceRows);
    info.put("packageQuantity", 1);
    info.put("packageGrossWeightKg", 810.0);
    info.put("innerCargo", inner);
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("name", "Valve");
    row.put("model", "DN200 / DN100");
    row.put("lengthCm", 110.0);
    row.put("widthCm", 110.0);
    row.put("heightCm", 115.0);
    row.put("quantity", 1);
    row.put("weightKg", 810.0);
    row.put("type", "normal");
    row.put("sku", "same-sku");
    row.put("packageNo", packageNo);
    row.put("marks", marks);
    row.put("sourceSheet", sheet);
    row.put("sourceRowNumber", sourceRows.get(0));
    row.put("sourceRowNumbers", sourceRows);
    row.put("packageInfo", info);
    return row;
  }
}
