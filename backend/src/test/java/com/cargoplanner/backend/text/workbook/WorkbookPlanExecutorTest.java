package com.cargoplanner.backend.text.workbook;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.util.CellRangeAddress;
import org.junit.jupiter.api.Test;

class WorkbookPlanExecutorTest {
  private final ObjectMapper mapper = new ObjectMapper();
  private final WorkbookPlanExecutor executor = new WorkbookPlanExecutor(mapper);

  @Test
  @SuppressWarnings("unchecked")
  void completeMixedPackageFixtureRetainsAllPhysicalUnitsAndContinuationContents() throws Exception {
    Map<String, Object> fixture;
    try (var stream = getClass().getResourceAsStream("/packing-lists/mixed-package-source.json")) {
      fixture = mapper.readValue(stream, new TypeReference<Map<String, Object>>() {});
    }
    Map<String, Object> source = (Map<String, Object>) fixture.get("sheet");
    Map<String, Object> plan = plan(9, 112);
    plan.put("dimensionUnit", "m");
    plan.put("totals", Map.of("innerQuantityCell", "E113", "grossWeightCell", "H113", "netWeightCell", "G113", "volumeCell", "I113"));
    Map<String, Object> result = executor.execute(document((List<List<Object>>) source.get("rawRows"), (List<String>) source.get("merges")), Map.of("plans", List.of(plan)));
    assertFalse((Boolean) result.get("partial"));
    assertEquals(75, rows(result).size());
    Map<String, Object> actual = map(map(result.get("reconciliation")).get("actual"));
    assertEquals(75L, actual.get("packageCount"));
    assertEquals(6925L, actual.get("innerQuantity"));
    assertEquals(74575.0, actual.get("grossWeightKg"));
    assertEquals(93.528148, ((Number) actual.get("calculatedVolumeM3")).doubleValue(), 0.000001);
    assertEquals(96.0, actual.get("declaredVolumeM3"));
    assertEquals("review-required", map(result.get("reconciliation")).get("status"));
  }

  @Test
  void explicitlyCountedPackageGroupsRetainQuantityAndDoNotInventIndividualBoxNumbers() {
    List<List<Object>> source = simpleRows("", "GROUP#1-6", "10", "600", "110*110*115", "6", "", "", "");
    Map<String, Object> plan = plan(2, 2);
    plan.put("packageIdColumn", null);
    plan.put("packageQuantityColumn", "J");
    plan.put("quantityBasis", "quantity-column");
    plan.put("weightBasis", "group-total");
    Map<String, Object> result = execute(source, plan);
    assertFalse((Boolean) result.get("partial"));
    Map<String, Object> cargo = rows(result).get(0), info = map(cargo.get("packageInfo"));
    assertEquals(6, cargo.get("quantity"));
    assertEquals(100.0, cargo.get("weightKg"));
    assertEquals("source-package-group", info.get("algorithmBasis"));
    assertEquals("Packages!R2", cargo.get("packageGroupId"));
    assertEquals("GROUP#1-6", info.get("groupMarks"));
    assertFalse(cargo.containsKey("packageNo"));
    assertFalse(cargo.containsKey("marks"));
    assertFalse(info.containsKey("packageNo"));
    assertFalse(info.containsKey("marks"));
  }

  @Test
  void packageOnlyListsKeepUnknownInnerQuantityInsteadOfInventingZero() {
    Map<String, Object> plan = plan(2, 2);
    plan.put("innerQuantityColumn", null);
    plan.put("innerUnitWeightColumn", null);
    plan.put("packageIdColumn", null);
    plan.put("packageQuantityColumn", "J");
    plan.put("quantityBasis", "quantity-column");
    Map<String, Object> result = execute(simpleRows("", "GROUP-A", "", "100", "110*110*115", "6", "", "", ""), plan);
    assertFalse((Boolean) result.get("partial"));
    assertEquals(6, rows(result).get(0).get("quantity"));
    Map<String, Object> contents = map(map(rows(result).get(0).get("packageInfo")).get("innerCargo"));
    assertEquals(null, contents.get("totalQuantity"));
    assertFalse(contents.containsKey("quantityUnit"));
    assertEquals(null, map(map(result.get("reconciliation")).get("actual")).get("innerQuantity"));
    assertEquals(null, map(map(result.get("reconciliation")).get("expected")).get("innerQuantity"));
  }

  @Test
  void sourceInnerControlTotalCannotMatchUnknownUnmappedInnerQuantities() {
    Map<String, Object> plan = plan(2, 2);
    plan.put("innerQuantityColumn", null);
    plan.put("innerUnitWeightColumn", null);
    plan.put("totals", Map.of("innerQuantityCell", "E3"));
    List<List<Object>> source = simpleRows("1", "PACK#1", "", "100", "110*110*115", "", "", "", "");
    source.add(List.of("TOTAL", "", "", "", "10"));
    Map<String, Object> result = execute(source, plan);
    assertTrue(hasIssue(result, "PACKAGE_CONSERVATION_MISMATCH"));
    assertEquals(null, map(map(result.get("reconciliation")).get("actual")).get("innerQuantity"));
  }

  @Test
  void rangedIdentityAndUnqualifiedNumericMarksCannotProveOnePhysicalPackage() {
    for (String mark : List.of("CASE#1~12", "CASE#1~#12", "1-12", "12345")) {
      Map<String, Object> plan = plan(2, 2);
      plan.put("packageIdColumn", null);
      Map<String, Object> result = execute(simpleRows("", mark, "10", "100", "110*110*115", "", "", "", ""), plan);
      assertTrue((Boolean) result.get("partial"), mark);
      assertTrue(hasIssue(result, "PACKAGE_IDENTITY_AMBIGUOUS"), mark);
    }
  }

  @Test
  void nativeNumericIdentityDoesNotAcquireDecimalSuffix() {
    List<List<Object>> source = simpleRows(1.0, "PACK#1", "10", "100", "110*110*115", "", "", "", "");
    Map<String, Object> result = execute(source, plan(2, 2));
    assertFalse((Boolean) result.get("partial"));
    assertEquals("1", rows(result).get(0).get("packageNo"));
  }

  @Test
  void duplicatePhysicalIdentityIsBlockedWhileSameIdentityOnDifferentSheetsIsSeparate() {
    List<List<Object>> source = simpleRows("1", "PACK#1", "10", "100", "110*110*115", "", "", "", "");
    source.add(new ArrayList<>(source.get(1)));
    Map<String, Object> duplicate = execute(source, plan(2, 3));
    assertTrue(hasIssue(duplicate, "PACKAGE_IDENTITY_DUPLICATE"));
    Map<String, Object> firstSheet = map(((List<?>) document(source.subList(0, 2), List.of()).get("sheets")).get(0));
    Map<String, Object> secondSheet = new LinkedHashMap<>(firstSheet);
    secondSheet.put("name", "Other");
    Map<String, Object> secondPlan = plan(2, 2);
    secondPlan.put("sheet", "Other");
    Map<String, Object> separate = executor.execute(Map.of("sheets", List.of(firstSheet, secondSheet)), Map.of("plans", List.of(plan(2, 2), secondPlan)));
    assertFalse((Boolean) separate.get("partial"));
    assertEquals(2, rows(separate).size());
  }

  @Test
  void missingDimensionsOrWeightNeverBecomeInferredUsablePackageValues() {
    Map<String, Object> missingWeight = execute(simpleRows("1", "PACK#1", "10", "", "110*110*115", "", "", "", ""), plan(2, 2));
    assertTrue(hasIssue(missingWeight, "PACKAGE_GROSS_WEIGHT_MISSING"));
    Map<String, Object> missingDimensions = execute(simpleRows("1", "PACK#1", "10", "100", "96", "", "", "", ""), plan(2, 2));
    assertTrue(hasIssue(missingDimensions, "PACKAGE_DIMENSIONS_MISSING"));
    assertEquals(0.0, rows(missingDimensions).get(0).get("lengthCm"));
  }

  @Test
  void innerQuantityOverflowIsBlockedWithoutWrappingNegative() {
    List<List<Object>> source = simpleRows("1", "PACK#1", "2000000000", "100", "110*110*115", "", "", "", "");
    source.add(List.of("", "", "Second product", "D2", "2000000000", "1", "", "", ""));
    Map<String, Object> result = execute(source, plan(2, 3));
    assertTrue(hasIssue(result, "PACKAGE_CONTENT_QUANTITY_OVERFLOW"));
    assertEquals(4000000000L, map(map(result.get("reconciliation")).get("actual")).get("innerQuantity"));
  }

  @Test
  void explicitSourceMappingsPreserveBothHandlingConstraintsAndPalletType() {
    Map<String, Object> plan = constraintsPlan();
    plan.put("typeMapping", Map.of("WOOD PALLET", "pallet"));
    plan.put("nonStackMapping", Map.of("FRAGILE", true));
    plan.put("keepUprightMapping", Map.of("朝上", true));
    plan.put("remarkColumn", "N");
    List<List<Object>> source = simpleRows("1", "PACK#1", "10", "100", "110*110*115", "", "WOOD PALLET", "FRAGILE", "朝上");
    source.get(1).add("Preserve the source remark");
    Map<String, Object> result = execute(source, plan);
    assertFalse((Boolean) result.get("partial"));
    Map<String, Object> cargo = rows(result).get(0);
    assertEquals("pallet", cargo.get("type"));
    assertEquals(true, cargo.get("nonStack"));
    assertEquals(true, cargo.get("keepUpright"));
    assertTrue(String.valueOf(cargo.get("remark")).contains("Preserve the source remark"));
  }

  @Test
  void unknownNonEmptySourceTypeAndConstraintRequireReviewInsteadOfSilentFalse() {
    Map<String, Object> result = execute(simpleRows("1", "PACK#1", "10", "100", "110*110*115", "", "UNKNOWN", "MAYBE", "YES"), constraintsPlan());
    assertTrue(hasIssue(result, "PACKAGE_TYPE_UNMAPPED"));
    assertTrue(hasIssue(result, "PACKAGE_CONSTRAINT_UNMAPPED"));
    assertEquals(true, rows(result).get(0).get("keepUpright"));
  }

  @Test
  void explicitInnerCartonDimensionsCannotServeAsLoadedPalletDimensionsButRemainValidForCartons() {
    List<List<Object>> source = simpleRows("1", "PACK#1", "10", "100", "110*110*115", "", "pallet", "false", "false");
    source.get(0).set(8, "Inner carton dimensions (cm)");
    Map<String, Object> pallet = execute(source, constraintsPlan());
    assertTrue(hasIssue(pallet, "PACKAGE_DIMENSIONS_INNER_ONLY"));
    assertEquals(0.0, rows(pallet).get(0).get("heightCm"));
    source.get(1).set(10, "normal");
    Map<String, Object> carton = execute(source, constraintsPlan());
    assertFalse((Boolean) carton.get("partial"));
    assertEquals(115.0, rows(carton).get(0).get("heightCm"));
  }

  private Map<String, Object> execute(List<List<Object>> source, Map<String, Object> plan) {
    return executor.execute(document(source, List.of()), Map.of("plans", List.of(plan)));
  }

  private Map<String, Object> constraintsPlan() {
    Map<String, Object> plan = plan(2, 2);
    plan.put("typeColumn", "K"); plan.put("nonStackColumn", "L"); plan.put("keepUprightColumn", "M");
    return plan;
  }

  private List<List<Object>> simpleRows(Object id, String marks, String innerQuantity, String gross,
      String dimensions, String packages, String type, String nonStack, String upright) {
    List<List<Object>> rows = new ArrayList<>();
    rows.add(new ArrayList<>(List.of("Package No", "Marks", "Product", "Model", "Inner Qty", "Unit Net", "Net", "Gross", "Dimensions", "Package Qty", "Type", "Nonstack", "Upright", "Remark")));
    rows.add(new ArrayList<>(List.of(id, marks, "Valve", "D1", innerQuantity, "1", "", gross, dimensions, packages, type, nonStack, upright)));
    return rows;
  }

  private Map<String, Object> plan(int first, int last) {
    Map<String, Object> plan = new LinkedHashMap<>();
    plan.put("sheet", "Packages"); plan.put("firstDataRow", first); plan.put("lastDataRow", last);
    plan.put("packageIdColumn", "A"); plan.put("marksColumn", "B"); plan.put("quantityBasis", "per-identity");
    plan.put("nameColumn", "C"); plan.put("modelColumn", "D"); plan.put("innerQuantityColumn", "E");
    plan.put("innerUnitWeightColumn", "F"); plan.put("grossWeightColumn", "H");
    plan.put("netWeightColumn", "G"); plan.put("combinedDimensionsColumn", "I");
    plan.put("dimensionUnit", "cm"); plan.put("weightUnit", "kg"); plan.put("weightBasis", "per-package");
    return plan;
  }

  private Map<String, Object> document(List<List<Object>> rows, List<String> mergedRanges) {
    List<Map<String, Object>> cells = new ArrayList<>(), merges = new ArrayList<>();
    int width = 0;
    for (int row = 0; row < rows.size(); row++) {
      width = Math.max(width, rows.get(row).size());
      for (int col = 0; col < rows.get(row).size(); col++) {
        Object value = rows.get(row).get(col);
        if (String.valueOf(value).isEmpty()) continue;
        cells.add(Map.of("row", row + 1, "column", col + 1, "address", WorkbookEvidenceService.address(row + 1, col + 1), "value", value, "display", String.valueOf(value)));
      }
    }
    for (String text : mergedRanges) {
      CellRangeAddress range = CellRangeAddress.valueOf(text);
      merges.add(Map.of("firstRow", range.getFirstRow() + 1, "lastRow", range.getLastRow() + 1,
          "firstColumn", range.getFirstColumn() + 1, "lastColumn", range.getLastColumn() + 1));
    }
    return Map.of("sheets", List.of(Map.of("name", "Packages", "rowCount", rows.size(), "columnCount", width, "cells", cells, "merges", merges)));
  }

  private boolean hasIssue(Map<String, Object> result, String code) {
    return WorkbookEvidenceService.list(result.get("issues")).stream().anyMatch(issue -> code.equals(issue.get("code")));
  }

  private List<Map<String, Object>> rows(Map<String, Object> result) { return WorkbookEvidenceService.list(result.get("rows")); }
  @SuppressWarnings("unchecked")
  private Map<String, Object> map(Object value) { return (Map<String, Object>) value; }
}
