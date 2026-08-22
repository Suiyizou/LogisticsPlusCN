package com.cargoplanner.backend.text;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.cargoplanner.backend.admin.LlmSettingsService;
import com.cargoplanner.backend.admin.LlmSettingsService.LlmRuntimeSettings;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

class TextRecognitionServiceTest {
  private TextRecognitionService service;

  @BeforeEach
  void setUp() {
    service = new TextRecognitionService(
        mock(JdbcTemplate.class),
        new ObjectMapper(),
        mock(LlmSettingsService.class),
        3
    );
  }

  @AfterEach
  void tearDown() {
    service.shutdownRecognitionExecutor();
  }

  @Test
  void rejectsCartonDimensionsAsLoadedPalletDimensions() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: 货代装箱清单",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"序号\" | B=\"托盘号\" | C=\"托内箱数\" | D=\"货物名称\" | F=\"单箱尺寸(长×宽×高cm)\"",
        "R3: A=\"1\" | B=\"PAL01\" | C=\"14\" | D=\"膨胀管\" | F=\"79×78×54\""
    );
    Map<String, Object> cargo = palletCargo(79, 78, 54);

    Boolean onlyInnerDimensions = ReflectionTestUtils.invokeMethod(
        service,
        "palletDimensionsAreOnlyInnerPackageSource",
        input,
        3,
        cargo
    );

    assertTrue(Boolean.TRUE.equals(onlyInnerDimensions));
  }

  @Test
  void acceptsExplicitLoadedPalletDimensionHeaders() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: 40托盘装箱明细",
        "DETECTED_HEADER_ROW: 4",
        "R4: A=\"托盘编号\" | E=\"装货后托盘外廓长(cm)\" | F=\"装货后托盘外廓宽(cm)\" | G=\"装货后托盘外廓高(cm)\" | I=\"单箱毛重(kg)\"",
        "R5: A=\"PLT-001\" | E=\"120\" | F=\"100\" | G=\"138\""
    );
    Map<String, Object> cargo = palletCargo(120, 100, 138);

    Boolean onlyInnerDimensions = ReflectionTestUtils.invokeMethod(
        service,
        "palletDimensionsAreOnlyInnerPackageSource",
        input,
        5,
        cargo
    );

    assertFalse(Boolean.TRUE.equals(onlyInnerDimensions));
    Object explicitDimensions = ReflectionTestUtils.invokeMethod(
        service,
        "explicitPalletDimensionsFromSource",
        input,
        5
    );
    assertNotNull(explicitDimensions);
    assertEquals(120.0, ReflectionTestUtils.invokeMethod(explicitDimensions, "lengthCm"));
    assertEquals(100.0, ReflectionTestUtils.invokeMethod(explicitDimensions, "widthCm"));
    assertEquals(138.0, ReflectionTestUtils.invokeMethod(explicitDimensions, "heightCm"));
  }

  @Test
  void rejectsCartonDimensionsWhenPalletColumnsExistButCurrentRowIsBlank() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: mixed dimensions",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"货物名称\" | B=\"单箱尺寸(cm)\" | C=\"托盘长(cm)\" | D=\"托盘宽(cm)\" | E=\"托盘高(cm)\"",
        "R3: A=\"膨胀管\" | B=\"79×78×54\" | C=\"-\" | D=\"待定\" | E=\"\""
    );

    Boolean onlyInnerDimensions = ReflectionTestUtils.invokeMethod(
        service,
        "palletDimensionsAreOnlyInnerPackageSource",
        input,
        3,
        palletCargo(79, 78, 54)
    );

    assertTrue(Boolean.TRUE.equals(onlyInnerDimensions));
  }

  @Test
  void parsesInlineUnitsInSeparatePalletDimensionColumns() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: inline units",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"货物名称\" | C=\"托盘长(cm)\" | D=\"托盘宽(cm)\" | E=\"托盘高(cm)\"",
        "R3: A=\"膨胀管\" | C=\"120 cm\" | D=\"100cm\" | E=\"1380mm\""
    );

    Object dimensions = ReflectionTestUtils.invokeMethod(
        service,
        "explicitPalletDimensionsFromSource",
        input,
        3
    );

    assertNotNull(dimensions);
    assertEquals(120.0, ReflectionTestUtils.invokeMethod(dimensions, "lengthCm"));
    assertEquals(100.0, ReflectionTestUtils.invokeMethod(dimensions, "widthCm"));
    assertEquals(138.0, ReflectionTestUtils.invokeMethod(dimensions, "heightCm"));
  }

  @Test
  void parsesThreeDecimalMetreValuesAsDecimalsInCombinedColumn() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: metre combined",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"货物名称\" | B=\"托盘尺寸(m)\"",
        "R3: A=\"膨胀管\" | B=\"1.200m×0.800m×1.380m\""
    );

    assertDimensions(input, 3, 120.0, 80.0, 138.0);
  }

  @Test
  void parsesThreeDecimalMetreValuesAsDecimalsInSeparateColumns() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: metre separate",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"货物名称\" | C=\"托盘长(m)\" | D=\"托盘宽(m)\" | E=\"托盘高(m)\"",
        "R3: A=\"膨胀管\" | C=\"1.200\" | D=\"0.800\" | E=\"1.380\""
    );

    assertDimensions(input, 3, 120.0, 80.0, 138.0);
  }

  @Test
  void honorsMixedInlineUnitsInCombinedPalletDimensions() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: mixed units",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"货物名称\" | B=\"托盘尺寸\"",
        "R3: A=\"膨胀管\" | B=\"1.20m×100cm×1380mm\""
    );

    assertDimensions(input, 3, 120.0, 100.0, 138.0);
  }

  @Test
  void appliesDimensionUnitDeclaredInCartonHeader() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: millimetres",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"货物名称\" | B=\"单箱尺寸(mm)\"",
        "R3: A=\"膨胀管\" | B=\"790×780×540\""
    );

    Boolean onlyInnerDimensions = ReflectionTestUtils.invokeMethod(
        service,
        "palletDimensionsAreOnlyInnerPackageSource",
        input,
        3,
        palletCargo(79, 78, 54)
    );

    assertTrue(Boolean.TRUE.equals(onlyInnerDimensions));
    Object innerDimensions = ReflectionTestUtils.invokeMethod(
        service,
        "innerPackageDimensionsFromSource",
        input,
        3
    );
    assertNotNull(innerDimensions);
    Map<String, Object> modelRow = new LinkedHashMap<>(palletCargo(79, 78, 54));
    ReflectionTestUtils.invokeMethod(service, "markPalletDimensionsMissing", modelRow, innerDimensions);
    @SuppressWarnings("unchecked")
    Map<String, Object> packageInfo = (Map<String, Object>) modelRow.get("packageInfo");
    @SuppressWarnings("unchecked")
    Map<String, Object> innerCargo = (Map<String, Object>) packageInfo.get("innerCargo");
    assertEquals(79.0, innerCargo.get("lengthCm"));
    assertEquals(78.0, innerCargo.get("widthCm"));
    assertEquals(54.0, innerCargo.get("heightCm"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void preservesSourceCartonDimensionsWhenPalletDimensionsAreCleared() {
    Map<String, Object> modelRow = new LinkedHashMap<>(palletCargo(79, 78, 54));

    ReflectionTestUtils.invokeMethod(
        service,
        "markPalletDimensionsMissing",
        modelRow,
        "R3: F=\"79×78×54\""
    );

    assertEquals(0, modelRow.get("lengthCm"));
    assertEquals(0, modelRow.get("widthCm"));
    assertEquals(0, modelRow.get("heightCm"));
    assertEquals(true, modelRow.get("palletDimensionsMissing"));
    Map<String, Object> packageInfo = (Map<String, Object>) modelRow.get("packageInfo");
    Map<String, Object> innerCargo = (Map<String, Object>) packageInfo.get("innerCargo");
    assertEquals(79.0, innerCargo.get("lengthCm"));
    assertEquals(78.0, innerCargo.get("widthCm"));
    assertEquals(54.0, innerCargo.get("heightCm"));
  }

  @Test
  void retriesOnlyTransientProviderStatuses() {
    assertTrue(Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(service, "isTransientProviderStatus", 429)));
    assertTrue(Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(service, "isTransientProviderStatus", 503)));
    assertFalse(Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(service, "isTransientProviderStatus", 400)));
    assertFalse(Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(service, "isTransientProviderStatus", 401)));
  }

  @Test
  void keepsPalletTypeWhileApplyingBothIndependentConstraints() {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("type", "pallet");
    cargo.put("remark", "\u4e0d\u53ef\u91cd\u538b \u4fdd\u6301\u671d\u4e0a");

    ReflectionTestUtils.invokeMethod(
        service,
        "applyIndependentConstraints",
        cargo,
        new Object[] { null, null, null, null }
    );

    assertEquals("pallet", cargo.get("type"));
    assertTrue(Boolean.TRUE.equals(cargo.get("nonStack")));
    assertTrue(Boolean.TRUE.equals(cargo.get("keepUpright")));
  }

  @Test
  void explicitFalseOverridesPositiveConstraintText() {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("type", "normal");
    cargo.put("remark", "\u4e0d\u53ef\u91cd\u538b \u4fdd\u6301\u671d\u4e0a");

    ReflectionTestUtils.invokeMethod(
        service,
        "applyIndependentConstraints",
        cargo,
        new Object[] { false, null, false, null }
    );

    assertFalse(Boolean.TRUE.equals(cargo.get("nonStack")));
    assertFalse(Boolean.TRUE.equals(cargo.get("keepUpright")));
  }

  @Test
  void negativePhrasesDoNotCreateConstraints() {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("type", "normal");
    cargo.put("remark", "\u975e\u6613\u788e\u54c1 \u53ef\u4ee5\u91cd\u538b \u53ef\u5806\u53e0 \u65e0\u9700\u4fdd\u6301\u671d\u4e0a stackable");

    ReflectionTestUtils.invokeMethod(
        service,
        "applyIndependentConstraints",
        cargo,
        new Object[] { null, null, null, null }
    );

    assertFalse(Boolean.TRUE.equals(cargo.get("nonStack")));
    assertFalse(Boolean.TRUE.equals(cargo.get("keepUpright")));
  }

  @Test
  void recognizesNonstackableWithoutTreatingStackableSubstringAsNegative() {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("type", "normal");
    cargo.put("remark", "nonstackable");

    ReflectionTestUtils.invokeMethod(
        service,
        "applyIndependentConstraints",
        cargo,
        new Object[] { null, null, null, null }
    );

    assertTrue(Boolean.TRUE.equals(cargo.get("nonStack")));
  }

  @Test
  @SuppressWarnings("unchecked")
  void normalizesLegacyConstraintTypesBeforeAggregation() {
    Map<String, Object> legacyRow = recognitionCargoRow("nonstackable");
    Map<String, Object> standardRow = recognitionCargoRow("normal");
    standardRow.put("nonStack", true);

    Object legacyParsed = ReflectionTestUtils.invokeMethod(service, "normalizeCargo", legacyRow, 1, "");
    Object standardParsed = ReflectionTestUtils.invokeMethod(service, "normalizeCargo", standardRow, 2, "");
    Map<String, Object> legacyCargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(legacyParsed, "cargo");
    Map<String, Object> standardCargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(standardParsed, "cargo");
    List<Map<String, Object>> aggregated = (List<Map<String, Object>>) ReflectionTestUtils.invokeMethod(
        service,
        "aggregateCargos",
        List.of(legacyCargo, standardCargo)
    );

    assertEquals("normal", legacyCargo.get("type"));
    assertTrue(Boolean.TRUE.equals(legacyCargo.get("nonStack")));
    assertEquals(1, aggregated.size());
    assertEquals(2, aggregated.get(0).get("quantity"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void preservesPalletIdentityWhenLegacyTypeCarriesUprightConstraint() {
    Map<String, Object> row = recognitionCargoRow("upright");
    row.put("packageInfo", new LinkedHashMap<>(Map.of(
        "handlingUnitType", "pallet",
        "packageUnit", "pallet",
        "dimensionSource", "explicit",
        "handlingUnitDimensionsExplicit", true
    )));

    Object parsed = ReflectionTestUtils.invokeMethod(service, "normalizeCargo", row, 1, "");
    Map<String, Object> cargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(parsed, "cargo");

    assertEquals("pallet", cargo.get("type"));
    assertTrue(Boolean.TRUE.equals(cargo.get("keepUpright")));
    assertFalse(Boolean.TRUE.equals(cargo.get("nonStack")));
  }

  @Test
  @SuppressWarnings("unchecked")
  void normalizesCrateAndWoodenCrateWithoutTreatingBareCaseAsPallet() {
    Map<String, Object> cratePackageRow = recognitionCargoRow("normal");
    cratePackageRow.put("packageInfo", new LinkedHashMap<>(Map.of(
        "handlingUnitType", "crate",
        "packageUnit", "crate",
        "dimensionSource", "explicit",
        "handlingUnitDimensionsExplicit", true
    )));
    Object crateParsed = ReflectionTestUtils.invokeMethod(service, "normalizeCargo", cratePackageRow, 1, "");
    Map<String, Object> crateCargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(crateParsed, "cargo");

    Object woodenParsed = ReflectionTestUtils.invokeMethod(
        service,
        "normalizeCargo",
        recognitionCargoRow("wooden crate"),
        2,
        ""
    );
    Map<String, Object> woodenCargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(woodenParsed, "cargo");

    Object bareCaseParsed = ReflectionTestUtils.invokeMethod(
        service,
        "normalizeCargo",
        recognitionCargoRow("display case"),
        3,
        ""
    );
    Map<String, Object> bareCaseCargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(bareCaseParsed, "cargo");

    assertEquals("pallet", crateCargo.get("type"));
    assertEquals("pallet", woodenCargo.get("type"));
    assertEquals("normal", bareCaseCargo.get("type"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void preservesBothConstraintsInDimensionLineFallback() {
    Object parsed = ReflectionTestUtils.invokeMethod(
        service,
        "parseLine",
        "\u4e0d\u53ef\u91cd\u538b \u4fdd\u6301\u671d\u4e0a precision-device 80x40x30cm 1pcs 10kg",
        "",
        1
    );
    Map<String, Object> cargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(parsed, "cargo");

    assertTrue(Boolean.TRUE.equals(cargo.get("nonStack")));
    assertTrue(Boolean.TRUE.equals(cargo.get("keepUpright")));
  }

  @Test
  @SuppressWarnings("unchecked")
  void preservesBothConstraintsInPackingListFallback() {
    Object parsed = ReflectionTestUtils.invokeMethod(
        service,
        "parsePackingListTableLine",
        "PLITEM 10 2 20 1 2 10 20 60 40 30 1 1 1 2 3 \u4e0d\u53ef\u91cd\u538b \u4fdd\u6301\u671d\u4e0a",
        1
    );
    Map<String, Object> cargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(parsed, "cargo");

    assertTrue(Boolean.TRUE.equals(cargo.get("nonStack")));
    assertTrue(Boolean.TRUE.equals(cargo.get("keepUpright")));
  }

  @Test
  @SuppressWarnings("unchecked")
  void selectsCompleteCargoSheetAndSkipsSummarySheetCandidates() {
    String input = String.join("\n",
        "EXCEL_FORMATTED_TABLE_FOR_AGENT",
        "SHEET 1: \u6700\u7ec8\u6258\u76d8\u5bfc\u5165",
        "DETECTED_HEADER_ROW: 6",
        "ROWS_WITH_EXCEL_COORDINATES:",
        "R6: A=\"\u6258\u76d8\u7f16\u53f7\" | B=\"\u8d27\u7269\u540d\u79f0\" | C=\"\u578b\u53f7/\u89c4\u683c\" | D=\"\u88c5\u8d27\u540e\u6258\u76d8\u5916\u5ed3\u957f(cm)\" | E=\"\u88c5\u8d27\u540e\u6258\u76d8\u5916\u5ed3\u5bbd(cm)\" | F=\"\u88c5\u8d27\u540e\u6258\u76d8\u5916\u5ed3\u9ad8(cm)\" | G=\"\u6700\u7ec8\u642c\u8fd0\u5355\u5143\u6570\u91cf\" | H=\"\u5355\u6258\u603b\u6bdb\u91cd(kg)\"",
        "R7: A=\"PLT-A-01\" | B=\"\u667a\u80fd\u4f20\u611f\u5668\u6258\u76d8\" | C=\"SENSOR-A / PALLET-B\" | D=\"120\" | E=\"100\" | F=\"116\" | G=\"6\" | H=\"455\"",
        "SHEET 2: \u6d4b\u8bd5\u8bf4\u660e",
        "DETECTED_HEADER_ROW: 8",
        "ROWS_WITH_EXCEL_COORDINATES:",
        "R8: A=\"\u5305\u88c5\u7ec4\" | B=\"\u539f\u59cb\u6563\u4ef6\" | C=\"\u6bcf\u6258\u5185\u88c5\" | D=\"\u6700\u7ec8\u6258\u76d8\" | E=\"\u538b\u7f29\u500d\u6570\" | F=\"\u7ea6\u675f\"",
        "R9: A=\"\u667a\u80fd\u4f20\u611f\u5668\u6258\u76d8\" | B=\"300\" | C=\"50\" | D=\"6\" | E=\"50\" | F=\"\u53ef\u627f\u91cd\""
    );

    List<?> batches = ReflectionTestUtils.invokeMethod(service, "buildExcelAgentBatches", input);

    assertNotNull(batches);
    assertEquals(1, batches.size());
    Object batch = batches.get(0);
    List<?> targetRows = ReflectionTestUtils.invokeMethod(batch, "targetRows");
    assertNotNull(targetRows);
    assertEquals(1, targetRows.size());
    assertEquals(7, (int) ReflectionTestUtils.invokeMethod(targetRows.get(0), "rowNumber"));
    Object section = ReflectionTestUtils.invokeMethod(batch, "section");
    assertEquals("SHEET 1: \u6700\u7ec8\u6258\u76d8\u5bfc\u5165", ReflectionTestUtils.invokeMethod(section, "sheetLine"));
  }

  @Test
  void keepsIrregularCargoSheetWhenACompleteSheetAlsoExists() {
    String input = String.join("\n",
        "EXCEL_FORMATTED_TABLE_FOR_AGENT",
        "SHEET 1: standard",
        "DETECTED_HEADER_ROW: 1",
        "R1: A=\"货物名称\" | B=\"长度\" | C=\"宽度\" | D=\"高度\" | E=\"数量\" | F=\"单重\"",
        "R2: A=\"标准货物\" | B=\"120\" | C=\"100\" | D=\"80\" | E=\"1\" | F=\"100\"",
        "SHEET 2: irregular cargo notes",
        "DETECTED_HEADER_ROW: 1",
        "R1: A=\"描述\" | B=\"混合信息\"",
        "R2: A=\"异形货物\" | B=\"长90宽70高50，2件，每件80kg\""
    );

    List<?> batches = ReflectionTestUtils.invokeMethod(service, "buildExcelAgentBatches", input);

    assertNotNull(batches);
    assertEquals(2, batches.size());
    Object irregularSection = ReflectionTestUtils.invokeMethod(batches.get(1), "section");
    assertEquals("SHEET 2: irregular cargo notes", ReflectionTestUtils.invokeMethod(irregularSection, "sheetLine"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void selectsOnlyFinalPackageCandidateAnchorsAndKeepsMergedRowsAsContext() throws Exception {
    String input = String.join("\n",
        "EXCEL_FORMATTED_TABLE_FOR_AGENT",
        "SHEET 1: packing-list-2",
        "DETECTED_HEADER_ROW: 2",
        "MERGED_RANGES: M3:Q4",
        finalPackageCandidateLine(1, 3, List.of(3, 4), "loaded pallet 1", 116, 116, 168, 1, 845.8),
        finalPackageCandidateLine(2, 5, List.of(5), "loaded pallet 2", 116, 116, 91, 6, 358.6),
        finalPackageCandidateLine(3, 6, List.of(6), "loaded pallet 3", 121, 116, 131, 8, 312),
        finalPackageCandidateLine(4, 7, List.of(7), "loaded pallet 4", 161, 116, 171, 8, 627.6),
        finalPackageCandidateLine(5, 8, List.of(8), "mixed loaded pallet", 161, 116, 171, 1, 356.6),
        "ROWS_WITH_EXCEL_COORDINATES:",
        "R2: A=\"product\" | D=\"quantity\" | H=\"carton dimensions\" | M=\"pallet dimensions\" | O=\"quantity\" | Q=\"weight\"",
        "R3: A=\"downlight\" | D=\"1000\" | M=\"116*116*168CM\" | O=\"1\" | Q=\"438\"",
        "R4: A=\"strip light\" | D=\"200\"",
        "R5: A=\"round light A\" | D=\"100\" | M=\"116*116*91CM\" | O=\"6\" | Q=\"1758\"",
        "R6: A=\"round light B\" | D=\"100\" | M=\"121*116*131CM\" | O=\"8\" | Q=\"1368\"",
        "R7: A=\"round light C\" | D=\"100\" | M=\"161*116*171CM\" | O=\"8\" | Q=\"2640\"",
        "R8: A=\"total\" | M=\"161*116*171CM\" | O=\"1\" | Q=\"194\""
    );

    List<?> batches = ReflectionTestUtils.invokeMethod(service, "buildExcelAgentBatches", input);

    assertNotNull(batches);
    assertEquals(1, batches.size());
    Object batch = batches.get(0);
    List<?> targetRows = ReflectionTestUtils.invokeMethod(batch, "targetRows");
    assertNotNull(targetRows);
    List<Integer> targetRowNumbers = targetRows.stream()
        .map(row -> (Integer) ReflectionTestUtils.invokeMethod(row, "rowNumber"))
        .toList();
    assertEquals(List.of(3, 5, 6, 7, 8), targetRowNumbers);

    String rendered = ReflectionTestUtils.invokeMethod(service, "renderExcelAgentBatch", batch, false);
    assertNotNull(rendered);
    assertTrue(rendered.contains("BATCH_TARGET_SOURCE_ROWS: 3,5,6,7,8"));
    int targetBlockStart = rendered.indexOf("BATCH_TARGET_ROWS:");
    assertTrue(targetBlockStart > 0);
    assertTrue(rendered.substring(0, targetBlockStart).contains("R4: A=\"strip light\""));
    assertFalse(rendered.substring(targetBlockStart).contains("\nR4:"));
  }

  @Test
  void selectsTheSingleFinalPackageAnchorAfterMultiRowHeaders() throws Exception {
    String input = String.join("\n",
        "EXCEL_FORMATTED_TABLE_FOR_AGENT",
        "SHEET 1: packing-list-4",
        "DETECTED_HEADER_ROW: 4",
        finalPackageCandidateLine(1, 6, List.of(6), "6012", 130, 120, 210, 12, 327.5),
        "ROWS_WITH_EXCEL_COORDINATES:",
        "R1: A=\"PACKING LIST\"",
        "R2: A=\"marks\" | B=\"description\"",
        "R3: A=\"outer package\" | B=\"carton details\"",
        "R4: A=\"item\" | B=\"qty\" | C=\"weight\"",
        "R5: A=\"reference\"",
        "R6: A=\"6012\" | B=\"180\" | C=\"3930\""
    );

    List<?> batches = ReflectionTestUtils.invokeMethod(service, "buildExcelAgentBatches", input);

    assertNotNull(batches);
    assertEquals(1, batches.size());
    List<?> targetRows = ReflectionTestUtils.invokeMethod(batches.get(0), "targetRows");
    assertNotNull(targetRows);
    assertEquals(1, targetRows.size());
    assertEquals(6, (int) ReflectionTestUtils.invokeMethod(targetRows.get(0), "rowNumber"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void finalPackageCandidateOverridesAgentAndGenericLeftSideColumns() throws Exception {
    String candidateLine = finalPackageCandidateLine(
        1,
        3,
        List.of(3, 4),
        "\u660e\u88c5\u7b52\u706f + \u7ebf\u6761\u706f",
        116,
        116,
        168,
        1,
        845.8
    );
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: packing-list-2",
        "DETECTED_HEADER_ROW: 2",
        candidateLine,
        "R2: A=\"\u54c1\u540d\" | D=\"\u6570\u91cf\" | H=\"\u5916\u7bb1\u5c3a\u5bf8\" | J=\"\u6bdb\u91cd\" | M=\"\u514d\u718f\u84b8\u6728\u6258\u76d8\u4f53\u79ef\"",
        "R3: A=\"\u660e\u88c5\u7b52\u706f\" | D=\"1000\" | H=\"37*37*38cm\" | J=\"14.8kg\" | M=\"116*116*168CM\"",
        "R4: A=\"\u7ebf\u6761\u706f\" | D=\"200\" | H=\"101*21*21cm\" | J=\"8.6kg\""
    );
    Map<String, Object> agentRow = new LinkedHashMap<>();
    agentRow.put("name", "wrong loose product");
    agentRow.put("model", "wrong model");
    agentRow.put("spec", "wrong spec alias");
    agentRow.put("lengthCm", 37);
    agentRow.put("widthCm", 37);
    agentRow.put("heightCm", 38);
    agentRow.put("quantity", 1000);
    agentRow.put("weightKg", 14.8);
    agentRow.put("type", "normal");

    ReflectionTestUtils.invokeMethod(service, "applyExplicitSourceFields", agentRow, input, 3);

    assertEquals("\u660e\u88c5\u7b52\u706f + \u7ebf\u6761\u706f", agentRow.get("name"));
    assertEquals("", agentRow.get("model"));
    assertFalse(agentRow.containsKey("spec"));
    assertEquals(116.0, agentRow.get("lengthCm"));
    assertEquals(116.0, agentRow.get("widthCm"));
    assertEquals(168.0, agentRow.get("heightCm"));
    assertEquals(1, agentRow.get("quantity"));
    assertEquals(845.8, agentRow.get("weightKg"));
    assertEquals("pallet", agentRow.get("type"));
    assertEquals(3, agentRow.get("sourceRowNumber"));
    assertEquals(List.of(3, 4), agentRow.get("sourceRowNumbers"));
    assertEquals("R3:R4", agentRow.get("sourceRange"));
    Map<String, Object> packageInfo = (Map<String, Object>) agentRow.get("packageInfo");
    assertEquals(845.8, packageInfo.get("packageGrossWeightKg"));
    assertEquals(List.of(3, 4), packageInfo.get("sourceRows"));

    Object parsed = ReflectionTestUtils.invokeMethod(service, "normalizeCargo", agentRow, 3, "candidate row");
    Map<String, Object> cargo = ReflectionTestUtils.invokeMethod(parsed, "cargo");
    assertNotNull(cargo);
    assertEquals("", cargo.get("model"));
    assertEquals(1, cargo.get("quantity"));
    assertEquals(845.8, cargo.get("weightKg"));
    assertEquals(List.of(3, 4), cargo.get("sourceRowNumbers"));
    assertEquals("R3:R4", cargo.get("sourceRange"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void explicitStructuredColumnsOverrideIncompleteAgentFields() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: \u6700\u7ec8\u6258\u76d8\u5bfc\u5165",
        "DETECTED_HEADER_ROW: 6",
        "R6: A=\"\u6258\u76d8\u7f16\u53f7\" | B=\"\u8d27\u7269\u540d\u79f0\" | C=\"\u578b\u53f7/\u89c4\u683c\" | D=\"\u88c5\u8d27\u540e\u6258\u76d8\u5916\u5ed3\u957f(cm)\" | E=\"\u88c5\u8d27\u540e\u6258\u76d8\u5916\u5ed3\u5bbd(cm)\" | F=\"\u88c5\u8d27\u540e\u6258\u76d8\u5916\u5ed3\u9ad8(cm)\" | G=\"\u6700\u7ec8\u642c\u8fd0\u5355\u5143\u6570\u91cf\" | H=\"\u5355\u6258\u603b\u6bdb\u91cd(kg)\" | I=\"\u8d27\u7269\u7c7b\u578b\" | J=\"\u4e0d\u53ef\u91cd\u538b\" | K=\"\u4fdd\u6301\u671d\u4e0a\" | L=\"\u539f\u59cb\u6563\u4ef6\u6570\u91cf\" | M=\"\u6bcf\u6258\u5185\u88c5\u4ef6\u6570\" | N=\"\u6258\u76d8/\u6728\u7bb1\u81ea\u91cd(kg)\" | O=\"\u5185\u88c5\u5355\u4ef6\u51c0\u91cd(kg)\" | P=\"\u5305\u88c5\u5173\u7cfb\u4e0e\u88c5\u7bb1\u5907\u6ce8\"",
        "R7: A=\"PLT-A-01\" | B=\"\u667a\u80fd\u4f20\u611f\u5668\u6258\u76d8\" | C=\"SENSOR-A / PALLET-B\" | D=\"120\" | E=\"100\" | F=\"116\" | G=\"6\" | H=\"455\" | I=\"\u6258\u76d8\" | J=\"\u5426\" | K=\"\u5426\" | L=\"300\" | M=\"50\" | N=\"25\" | O=\"8.6\" | P=\"50 \u4ef6\u4f20\u611f\u5668 A \u88c5\u5165 1 \u4e2a\u6258\u76d8 B\""
    );
    Map<String, Object> agentRow = new LinkedHashMap<>();
    agentRow.put("name", "wrong");
    agentRow.put("model", "");
    agentRow.put("lengthCm", 0);
    agentRow.put("widthCm", 0);
    agentRow.put("heightCm", 0);
    agentRow.put("quantity", 1);
    agentRow.put("weightKg", 0);
    agentRow.put("type", "normal");

    ReflectionTestUtils.invokeMethod(service, "applyExplicitSourceFields", agentRow, input, 7);

    assertEquals("\u667a\u80fd\u4f20\u611f\u5668\u6258\u76d8", agentRow.get("name"));
    assertEquals("SENSOR-A / PALLET-B", agentRow.get("model"));
    assertEquals("PLT-A-01", agentRow.get("sku"));
    assertEquals(120.0, agentRow.get("lengthCm"));
    assertEquals(100.0, agentRow.get("widthCm"));
    assertEquals(116.0, agentRow.get("heightCm"));
    assertEquals(6, agentRow.get("quantity"));
    assertEquals(455.0, agentRow.get("weightKg"));
    assertEquals("pallet", agentRow.get("type"));
    assertEquals(false, agentRow.get("nonStack"));
    assertEquals(false, agentRow.get("keepUpright"));
    Map<String, Object> packageInfo = (Map<String, Object>) agentRow.get("packageInfo");
    assertEquals(6, packageInfo.get("packageQuantity"));
    assertEquals(455.0, packageInfo.get("packageGrossWeightKg"));
    assertEquals(25.0, packageInfo.get("palletTareWeightKg"));
    Map<String, Object> innerCargo = (Map<String, Object>) packageInfo.get("innerCargo");
    assertEquals(300, innerCargo.get("totalQuantity"));
    assertEquals(50, innerCargo.get("piecesPerPackage"));
    assertEquals(8.6, innerCargo.get("unitNetWeightKg"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void recoversCompleteSourceRowWhenAgentOnlyReportsMissingPalletDimensions() throws Exception {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: 最终托盘导入",
        "DETECTED_HEADER_ROW: 6",
        "BATCH_CONTEXT_ONLY:",
        "R6: A=\"托盘编号\" | B=\"货物名称\" | C=\"型号/规格\" | D=\"装货后托盘外廓长(cm)\" | E=\"装货后托盘外廓宽(cm)\" | F=\"装货后托盘外廓高(cm)\" | G=\"最终搬运单元数量\" | H=\"单托总毛重(kg)\" | I=\"货物类型\"",
        "BATCH_TARGET_ROWS:",
        "BATCH_TARGET_SOURCE_ROWS: 7",
        "R7: A=\"PLT-A-01\" | B=\"智能传感器托盘\" | C=\"SENSOR-A / PALLET-B\" | D=\"120\" | E=\"100\" | F=\"116\" | G=\"6\" | H=\"455\" | I=\"托盘\""
    );
    String agentContent = new ObjectMapper().writeValueAsString(Map.of(
        "rows", List.of(),
        "issues", List.of(Map.of(
            "sourceRowNumber", 7,
            "code", "PALLET_DIMENSIONS_MISSING",
            "message", "未识别到最终托盘外廓尺寸"
        )),
        "notes", ""
    ));
    String response = new ObjectMapper().writeValueAsString(Map.of(
        "choices", List.of(Map.of("message", Map.of("content", agentContent)))
    ));
    RestTemplate restTemplate = (RestTemplate) ReflectionTestUtils.getField(service, "restTemplate");
    assertNotNull(restTemplate);
    MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
    server.expect(once(), anything()).andRespond(withSuccess(response, MediaType.APPLICATION_JSON));

    Object result = ReflectionTestUtils.invokeMethod(
        service,
        "recognizeWithOpenAiCompatible",
        new LlmRuntimeSettings(true, "https://mock.local", "mock-model", "secret"),
        input,
        "zh-CN"
    );

    assertNotNull(result);
    List<Map<String, Object>> rows = (List<Map<String, Object>>) ReflectionTestUtils.invokeMethod(result, "cleanedRows");
    assertNotNull(rows);
    assertEquals(1, rows.size());
    assertEquals("智能传感器托盘", rows.get(0).get("name"));
    assertEquals("SENSOR-A / PALLET-B", rows.get(0).get("model"));
    assertEquals(120.0, rows.get(0).get("lengthCm"));
    assertEquals(100.0, rows.get(0).get("widthCm"));
    assertEquals(116.0, rows.get(0).get("heightCm"));
    assertEquals(6, rows.get(0).get("quantity"));
    assertEquals(455.0, rows.get(0).get("weightKg"));
    server.verify();
  }

  private Map<String, Object> recognitionCargoRow(String type) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("name", "precision-device");
    row.put("lengthCm", 100);
    row.put("widthCm", 80);
    row.put("heightCm", 60);
    row.put("quantity", 1);
    row.put("weightKg", 120);
    row.put("type", type);
    return row;
  }

  private Map<String, Object> palletCargo(double length, double width, double height) {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("type", "pallet");
    cargo.put("lengthCm", length);
    cargo.put("widthCm", width);
    cargo.put("heightCm", height);
    cargo.put("packageInfo", new LinkedHashMap<>(Map.of(
        "handlingUnitType", "pallet",
        "dimensionSource", "explicit",
        "handlingUnitDimensionsExplicit", true
    )));
    return cargo;
  }

  private String finalPackageCandidateLine(
      int candidateNumber,
      int sourceRowNumber,
      List<Integer> sourceRowNumbers,
      String name,
      double lengthCm,
      double widthCm,
      double heightCm,
      int quantity,
      double weightKg
  ) throws Exception {
    String sourceRange = "R" + sourceRowNumbers.get(0) + ":R" + sourceRowNumbers.get(sourceRowNumbers.size() - 1);
    Map<String, Object> packageInfo = new LinkedHashMap<>();
    packageInfo.put("algorithmBasis", "source-final-package");
    packageInfo.put("handlingUnitType", "pallet");
    packageInfo.put("packageUnit", "pallet");
    packageInfo.put("packageQuantity", quantity);
    packageInfo.put("dimensionSource", "explicit source pallet columns");
    packageInfo.put("handlingUnitDimensionsExplicit", true);
    packageInfo.put("packageGrossWeightKg", weightKg);
    packageInfo.put("packageTotalGrossWeightKg", weightKg * quantity);
    packageInfo.put("sourceRows", sourceRowNumbers);
    packageInfo.put("sourceRange", sourceRange);

    Map<String, Object> candidate = new LinkedHashMap<>();
    candidate.put("sourceRowNumber", sourceRowNumber);
    candidate.put("sourceRowNumbers", sourceRowNumbers);
    candidate.put("sourceRange", sourceRange);
    candidate.put("name", name);
    candidate.put("model", "");
    candidate.put("lengthCm", lengthCm);
    candidate.put("widthCm", widthCm);
    candidate.put("heightCm", heightCm);
    candidate.put("quantity", quantity);
    candidate.put("weightKg", weightKg);
    candidate.put("type", "pallet");
    candidate.put("nonStack", false);
    candidate.put("keepUpright", false);
    candidate.put("remark", "source-derived final package");
    candidate.put("packageInfo", packageInfo);
    return "FINAL_PACKAGE_CANDIDATE " + candidateNumber + ": "
        + new ObjectMapper().writeValueAsString(candidate);
  }

  private void assertDimensions(
      String input,
      int rowNumber,
      double expectedLength,
      double expectedWidth,
      double expectedHeight
  ) {
    Object dimensions = ReflectionTestUtils.invokeMethod(
        service,
        "explicitPalletDimensionsFromSource",
        input,
        rowNumber
    );
    assertNotNull(dimensions);
    assertEquals(expectedLength, ReflectionTestUtils.invokeMethod(dimensions, "lengthCm"));
    assertEquals(expectedWidth, ReflectionTestUtils.invokeMethod(dimensions, "widthCm"));
    assertEquals(expectedHeight, ReflectionTestUtils.invokeMethod(dimensions, "heightCm"));
  }
}
