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
import org.junit.jupiter.api.Test;

class WorkbookPlanCoverageTest {
  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void completeSeventyFivePackagePlanKeepsMappedControlTotalsAndHasNoUnmappedRows() throws Exception {
    assertTrue(WorkbookPlanCoverage.issues(fixture(), Map.of("plans", List.of(plan(9, 112)))).isEmpty());
  }

  @Test
  void shortenedPlanCannotHideRemainingPackagesByOmittingEveryControlTotal() throws Exception {
    Map<String, Object> shortPlan = plan(9, 32);
    shortPlan.put("totals", Map.of());
    List<Map<String, Object>> issues = WorkbookPlanCoverage.issues(fixture(), Map.of("plans", List.of(shortPlan)));

    Map<String, Object> uncovered = issues.stream().filter(issue -> "UNMAPPED_SOURCE_ROWS".equals(issue.get("code"))).findFirst().orElseThrow();
    assertEquals("Packages", uncovered.get("sourceSheet"));
    assertEquals(33, uncovered.get("sourceRowNumber"));
    assertTrue(((Number) uncovered.get("unmappedRowCount")).intValue() > 60);
    assertTrue(((List<?>) uncovered.get("sourceRowNumbers")).contains(112));
  }

  @Test
  void aContinuationProductRowWithoutAnIdentityStillRequiresCoverage() throws Exception {
    Map<String, Object> partial = plan(9, 9);
    List<Map<String, Object>> issues = WorkbookPlanCoverage.issues(fixture(), Map.of("plans", List.of(partial)));
    assertEquals(10, issues.get(0).get("sourceRowNumber"));
  }

  @Test
  void declaringAnActualPackageWeightAsAControlTotalCannotHideItsOtherEvidence() throws Exception {
    Map<String, Object> partial = plan(9, 32);
    partial.put("totals", Map.of("grossWeightCell", "H33"));
    List<Map<String, Object>> issues = WorkbookPlanCoverage.issues(fixture(), Map.of("plans", List.of(partial)));
    assertTrue(((List<?>) issues.get(0).get("sourceRowNumbers")).contains(33));
  }

  @Test
  void nonEmptyUnselectedWorksheetMustBeDeclaredAndReasoned() throws Exception {
    Map<String, Object> document = withNotesSheet(fixture());
    List<Map<String, Object>> missing = WorkbookPlanCoverage.issues(document, Map.of("plans", List.of(plan(9, 112))));
    assertTrue(missing.stream().anyMatch(issue -> "UNMAPPED_SOURCE_SHEET".equals(issue.get("code"))));

    Map<String, Object> proposed = Map.of("plans", List.of(plan(9, 112)),
        "ignoredSheets", List.of(Map.of("sheet", "Notes", "reason", "Non-cargo explanatory note")));
    assertTrue(WorkbookPlanCoverage.issues(document, proposed).isEmpty());
  }

  @Test
  void ignoredSheetDeclarationRejectsUnknownBlankDuplicateAndAlreadyMappedSheets() throws Exception {
    Map<String, Object> document = withNotesSheet(fixture());
    for (var ignored : List.of(
        List.of(Map.of("sheet", "Unknown", "reason", "Not cargo")),
        List.of(Map.of("sheet", "Notes", "reason", " ")),
        List.of(Map.of("sheet", "Notes", "reason", "One"), Map.of("sheet", "Notes", "reason", "Two")),
        List.of(Map.of("sheet", "Packages", "reason", "Not cargo")),
        List.of(Map.of("sheet", "Notes", "reason", 5)))) {
      List<Map<String, Object>> issues = WorkbookPlanCoverage.issues(document,
          Map.of("plans", List.of(plan(9, 112)), "ignoredSheets", ignored));
      assertTrue(issues.stream().anyMatch(issue -> "WORKBOOK_SHEET_SCOPE_INVALID".equals(issue.get("code"))));
    }
    assertFalse(WorkbookPlanCoverage.issues(document,
        Map.of("plans", List.of(plan(9, 112)), "ignoredSheets", Map.of("sheet", "Notes"))).isEmpty());
  }

  @Test
  void blankWorksheetDoesNotNeedAnIgnoreDeclaration() throws Exception {
    Map<String, Object> document = fixture();
    List<Map<String, Object>> sheets = new ArrayList<>(WorkbookEvidenceService.list(document.get("sheets")));
    sheets.add(Map.of("name", "Blank", "rowCount", 0, "columnCount", 0, "cells", List.of(), "merges", List.of()));
    document.put("sheets", sheets);
    assertTrue(WorkbookPlanCoverage.issues(document, Map.of("plans", List.of(plan(9, 112)))).isEmpty());
  }

  @Test
  void auxiliaryNumericAndFormulaColumnsDoNotCreatePhantomPackages() throws Exception {
    Map<String, Object> document = fixture();
    Map<String, Object> sheet = WorkbookEvidenceService.list(document.get("sheets")).get(0);
    List<Map<String, Object>> cells = new ArrayList<>(WorkbookEvidenceService.list(sheet.get("cells")));
    cells.add(cell("J120", 120, 10, 9000));
    Map<String, Object> formula = new LinkedHashMap<>(cell("K120", 120, 11, 9500));
    formula.put("formula", "SUM(J9:J119)");
    cells.add(formula);
    sheet.put("cells", cells);
    assertTrue(WorkbookPlanCoverage.issues(document, Map.of("plans", List.of(plan(9, 112)))).isEmpty());
  }

  @Test
  void detectionUsesMappedCoordinatesAndNotFixedCustomerHeaderNames() {
    Map<String, Object> alternate = Map.of("fileName", "alternate.xlsx", "sheets", List.of(Map.of(
        "name", "Unusual", "rowCount", 6, "columnCount", 26, "merges", List.of(), "cells", List.of(
            cell("X1", 1, 24, "arbitrary label"),
            cell("X2", 2, 24, "BOX1"), cell("Y2", 2, 25, "Thing"), cell("Z2", 2, 26, 10),
            cell("T2", 2, 20, "100*100*100"), cell("W2", 2, 23, 100),
            cell("X5", 5, 24, "BOX2"), cell("Y5", 5, 25, "Other thing"), cell("Z5", 5, 26, 5),
            cell("T5", 5, 20, "100*100*100"), cell("W5", 5, 23, 50)
        ))));
    Map<String, Object> plan = new LinkedHashMap<>();
    plan.put("sheet", "Unusual"); plan.put("firstDataRow", 2); plan.put("lastDataRow", 2);
    plan.put("packageIdColumn", "X"); plan.put("nameColumn", "Y"); plan.put("innerQuantityColumn", "Z");
    plan.put("combinedDimensionsColumn", "T"); plan.put("grossWeightColumn", "W");
    List<Map<String, Object>> issues = WorkbookPlanCoverage.issues(alternate, Map.of("plans", List.of(plan)));
    assertEquals(5, issues.get(0).get("sourceRowNumber"));
  }

  private Map<String, Object> withNotesSheet(Map<String, Object> document) {
    List<Map<String, Object>> sheets = new ArrayList<>(WorkbookEvidenceService.list(document.get("sheets")));
    sheets.add(Map.of("name", "Notes", "rowCount", 1, "columnCount", 1, "hidden", true,
        "cells", List.of(cell("A1", 1, 1, "Explanatory note")), "merges", List.of()));
    document.put("sheets", sheets);
    return document;
  }

  private Map<String, Object> fixture() throws Exception {
    Map<String, Object> fixture;
    try (var input = getClass().getResourceAsStream("/packing-lists/mixed-package-source.json")) {
      fixture = mapper.readValue(input, new TypeReference<Map<String, Object>>() {});
    }
    Map<String, Object> fixtureSheet = object(fixture.get("sheet"));
    List<?> rawRows = (List<?>) fixtureSheet.get("rawRows");
    List<Map<String, Object>> cells = new ArrayList<>();
    int columns = 0;
    for (int row = 0; row < rawRows.size(); row++) {
      List<?> values = (List<?>) rawRows.get(row);
      columns = Math.max(columns, values.size());
      for (int column = 0; column < values.size(); column++) {
        Object value = values.get(column);
        if (value == null || String.valueOf(value).isEmpty()) continue;
        cells.add(cell(WorkbookEvidenceService.address(row + 1, column + 1), row + 1, column + 1, value));
      }
    }
    Map<String, Object> sheet = new LinkedHashMap<>();
    sheet.put("name", "Packages"); sheet.put("rowCount", rawRows.size()); sheet.put("columnCount", columns);
    sheet.put("cells", cells); sheet.put("merges", List.of());
    Map<String, Object> document = new LinkedHashMap<>();
    document.put("fileName", "mixed-package-source.xls"); document.put("sheets", List.of(sheet));
    return document;
  }

  private Map<String, Object> plan(int first, int last) {
    Map<String, Object> plan = new LinkedHashMap<>();
    plan.put("sheet", "Packages"); plan.put("firstDataRow", first); plan.put("lastDataRow", last);
    plan.put("packageIdColumn", "A"); plan.put("marksColumn", "B"); plan.put("nameColumn", "C");
    plan.put("modelColumn", "D"); plan.put("innerQuantityColumn", "E"); plan.put("innerUnitWeightColumn", "F");
    plan.put("netWeightColumn", "G"); plan.put("grossWeightColumn", "H"); plan.put("combinedDimensionsColumn", "I");
    plan.put("totals", Map.of("innerQuantityCell", "E113", "netWeightCell", "G113", "grossWeightCell", "H113", "volumeCell", "I113"));
    return plan;
  }

  private Map<String, Object> cell(String address, int row, int column, Object value) {
    return Map.of("address", address, "row", row, "column", column, "value", value, "displayValue", String.valueOf(value));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> object(Object value) { return (Map<String, Object>) value; }
}
