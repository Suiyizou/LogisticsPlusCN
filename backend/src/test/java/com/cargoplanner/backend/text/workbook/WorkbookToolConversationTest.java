package com.cargoplanner.backend.text.workbook;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

class WorkbookToolConversationTest {
  private final ObjectMapper mapper = new ObjectMapper();
  private final WorkbookToolConversation conversation = new WorkbookToolConversation(mapper);

  @Test
  void keepsAssistantToolMessagesReasoningAndReadEvidenceAcrossRounds() {
    List<Map<String, Object>> requests = new ArrayList<>();
    List<Map<String, Object>> replies = List.of(
        calls("inspect-reasoning", call("inspect", "inspect_workbook", "{}")),
        calls("range-reasoning", call("read", "read_sheet_range", "{\"sheet\":\"Packages\",\"range\":\"A1:J4\"}")),
        complete(plan(), "stop")
    );
    Map<String, Object> result = conversation.recognize(document(), request -> {
      requests.add(request);
      return replies.get(requests.size() - 1);
    });

    assertEquals(Map.of("plans", List.of(plan())), result);
    assertEquals(3, requests.size());
    String second = json(requests.get(1));
    assertTrue(second.contains("inspect-reasoning"));
    assertTrue(second.contains("reasoning_content"));
    assertTrue(second.contains("tool_call_id"));
    assertTrue(second.contains("inspect_workbook"));
    assertFalse(json(requests.get(0)).contains("PRIVATE_WORKBOOK_CELL"));
    assertEquals(List.of("inspect_workbook", "read_sheet_range"), tools(requests.get(0)));
    assertTrue(json(requests.get(2)).contains("range-reasoning"));
    assertTrue(json(requests.get(2)).contains("mergedValuesRemainAtAnchor"));
  }

  @Test
  void unknownToolIsReturnedAsAnErrorAndTheModelCanCorrectIt() {
    List<Map<String, Object>> requests = new ArrayList<>();
    Map<String, Object> result = exchangeSequence(document(), requests, List.of(
        calls("", call("bad", "execute_python", "{\"code\":\"delete files\"}")),
        read("A1:J4"), complete(plan(), "stop")
    ));

    assertEquals(1, ((List<?>) result.get("plans")).size());
    assertTrue(json(requests.get(1)).contains("UNKNOWN_TOOL"));
  }

  @Test
  void malformedOrExtraToolArgumentsReturnErrorsWithoutExecutingCode() {
    for (String arguments : List.of("not-json", "{\"sheet\":\"Packages\"}",
        "{\"sheet\":\"Packages\",\"range\":\"A1:J4\",\"code\":\"anything\"}",
        "{\"sheet\":\"Packages\",\"range\":\"A1:J4\"} trailing")) {
      List<Map<String, Object>> requests = new ArrayList<>();
      exchangeSequence(document(), requests, List.of(
          calls("", call("bad", "read_sheet_range", arguments)), read("A1:J4"), complete(plan(), "stop")
      ));
      assertTrue(json(requests.get(1)).contains("INVALID_TOOL_ARGUMENTS"));
    }
  }

  @Test
  void oversizedRangeCanBeCorrectedButNeverReadOutsideTheToolLimits() {
    for (String range : List.of("A1:A201", "A1:AE1", "A4:A1", "Packages!A1:J4")) {
      List<Map<String, Object>> requests = new ArrayList<>();
      exchangeSequence(document(), requests, List.of(read(range), read("A1:J4"), complete(plan(), "stop")));
      assertTrue(json(requests.get(1)).contains("INVALID_TOOL_ARGUMENTS"));
    }
  }

  @Test
  void toolsCannotReadUnknownSheetsAndCanRecoverFromTheError() {
    List<Map<String, Object>> requests = new ArrayList<>();
    exchangeSequence(document(), requests, List.of(
        calls("", call("bad", "read_sheet_range", "{\"sheet\":\"Other\",\"range\":\"A1\"}")),
        read("A1:J4"), complete(plan(), "stop")
    ));
    assertTrue(json(requests.get(1)).contains("INVALID_TOOL_ARGUMENTS"));
  }

  @Test
  void acceptsCoverageSplitAcrossColumnsAndMultipleToolsInOneRound() {
    Map<String, Object> result = exchangeSequence(document(), new ArrayList<>(), List.of(
        calls("", call("left", "read_sheet_range", "{\"sheet\":\"Packages\",\"range\":\"A1:E4\"}"),
            call("right", "read_sheet_range", "{\"sheet\":\"Packages\",\"range\":\"F1:J4\"}")),
        complete(plan(), "stop")
    ));
    assertEquals(1, ((List<?>) result.get("plans")).size());
  }

  @Test
  void acceptsCoverageSplitAcrossAdjacentRowRanges() {
    exchangeSequence(document(), new ArrayList<>(), List.of(read("A1:J2"), read("A3:J4"), complete(plan(), "stop")));
  }

  @Test
  void rejectsPlansWithUnreadRowsColumnsOrTotals() {
    for (List<Map<String, Object>> replies : List.of(
        List.of(complete(plan(), "stop")),
        List.of(read("A1:J2"), read("A4:J4"), complete(plan(), "stop")),
        List.of(read("A1:G4"), complete(plan(), "stop")),
        List.of(read("A1:J3"), complete(plan(), "stop")))) {
      IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
          () -> exchangeSequence(document(), new ArrayList<>(), replies));
      assertTrue(error.getMessage().contains("unread"));
    }
  }

  @Test
  void rejectsInvalidPlanStructureUnitsColumnsAndUnknownSheets() {
    List<Map<String, Object>> invalid = new ArrayList<>();
    for (var change : List.of(
        Map.entry("dimensionUnit", "inch"), Map.entry("weightBasis", "guess"),
        Map.entry("sheet", "Unknown"), Map.entry("lastDataRow", 5),
        Map.entry("grossWeightColumn", "XFD"), Map.entry("marksColumn", "b"),
        Map.entry("firstDataRow", 2.5), Map.entry("execute", "anything"))) {
      Map<String, Object> changed = plan();
      changed.put(change.getKey(), change.getValue());
      invalid.add(changed);
    }
    Map<String, Object> missing = plan();
    missing.remove("grossWeightColumn");
    invalid.add(missing);
    Map<String, Object> ambiguous = plan();
    ambiguous.put("quantityBasis", "quantity-column");
    invalid.add(ambiguous);
    for (Map<String, Object> bad : invalid) {
      assertThrows(IllegalArgumentException.class,
          () -> exchangeSequence(document(), new ArrayList<>(), List.of(read("A1:J4"), complete(bad, "stop"))));
    }
  }

  @Test
  void rejectsWholeOutputIfAnyPlanIsInvalidRatherThanReturningPartialTables() {
    Map<String, Object> bad = plan();
    bad.put("sheet", "Unknown");
    assertThrows(IllegalArgumentException.class, () -> exchangeSequence(document(), new ArrayList<>(),
        List.of(read("A1:J4"), completion(json(Map.of("plans", List.of(plan(), bad))), "stop"))));
  }

  @Test
  void doesNotAcceptMarkdownTrailingJsonOrDuplicateJsonKeysAsAMappingPlan() {
    String valid = json(Map.of("plans", List.of(plan())));
    for (String content : List.of("```json\n" + valid + "\n```", valid + " {}", "{\"plans\":[],\"plans\":[]}")) {
      assertThrows(IllegalArgumentException.class, () -> exchangeSequence(document(), new ArrayList<>(),
          List.of(read("A1:J4"), completion(content, "stop"))));
    }
  }

  @Test
  void refusesLengthTruncatedAndFilteredModelResponsesEvenWhenTheirJsonLooksValid() {
    for (String reason : List.of("length", "content_filter")) {
      IllegalStateException error = assertThrows(IllegalStateException.class,
          () -> conversation.recognize(document(), request -> complete(plan(), reason)));
      assertTrue(error.getMessage().contains("incomplete"));
    }
  }

  @Test
  void boundsRoundsAndReturnsNoPartialPlanOnExhaustion() {
    AtomicInteger exchanges = new AtomicInteger();
    IllegalStateException error = assertThrows(IllegalStateException.class,
        () -> conversation.recognize(document(), request -> {
          exchanges.incrementAndGet();
          return calls("", call("inspect", "inspect_workbook", "{}"));
        }));
    assertEquals(8, exchanges.get());
    assertTrue(error.getMessage().contains("round budget"));
  }

  @Test
  void boundsToolCallsBeforeExecutingAnOversizedBatch() {
    List<Map<String, Object>> calls = new ArrayList<>();
    for (int index = 0; index < 25; index++) calls.add(call("call-" + index, "inspect_workbook", "{}"));
    Map<String, Object> assistant = new LinkedHashMap<>();
    assistant.put("role", "assistant");
    assistant.put("tool_calls", calls);
    IllegalStateException error = assertThrows(IllegalStateException.class,
        () -> conversation.recognize(document(), request -> Map.of("choices", List.of(Map.of(
            "finish_reason", "tool_calls", "message", assistant)))));
    assertTrue(error.getMessage().contains("tool-call budget"));
  }

  @Test
  void rejectsOversizedCompletionAndCumulativeResponseBudget() {
    IllegalStateException single = assertThrows(IllegalStateException.class,
        () -> conversation.recognize(document(), request -> completion("x".repeat(270_000), "stop")));
    assertTrue(single.getMessage().contains("response budget"));
    AtomicInteger exchanges = new AtomicInteger();
    IllegalStateException cumulative = assertThrows(IllegalStateException.class,
        () -> conversation.recognize(document(), request -> {
          exchanges.incrementAndGet();
          return calls("x".repeat(100_000), call("inspect", "inspect_workbook", "{}"));
        }));
    assertTrue(exchanges.get() < 8);
    assertTrue(cumulative.getMessage().contains("response budget"));
  }

  @Test
  void oversizedToolResultIsAnErrorAndCannotBeUsedAsReadCoverage() {
    Map<String, Object> largeDocument = largeDocument();
    Map<String, Object> oneRow = plan();
    oneRow.put("firstDataRow", 1);
    oneRow.put("lastDataRow", 1);
    for (String field : List.of("marksColumn", "nameColumn", "modelColumn", "innerQuantityColumn",
        "innerUnitWeightColumn", "combinedDimensionsColumn", "grossWeightColumn", "netWeightColumn")) {
      oneRow.put(field, null);
    }
    oneRow.put("totals", emptyTotals());
    List<Map<String, Object>> requests = new ArrayList<>();
    exchangeSequence(largeDocument, requests, List.of(read("A1:A100"), read("A1"), complete(oneRow, "stop")));
    assertTrue(json(requests.get(1)).contains("TOOL_RESULT_TOO_LARGE"));
    Map<String, Object> allRows = new LinkedHashMap<>(oneRow);
    allRows.put("lastDataRow", 100);
    IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
        () -> exchangeSequence(largeDocument, new ArrayList<>(), List.of(read("A1:A100"), complete(allRows, "stop"))));
    assertTrue(error.getMessage().contains("unread"));
  }

  @Test
  void acceptsExplicitConstraintColumnsAndTypedSourceValueDictionaries() {
    Map<String, Object> plan = constrainedPlan();
    Map<String, Object> result = exchangeSequence(constraintDocument(), new ArrayList<>(),
        List.of(read("A1:N4"), complete(plan, "stop")));
    assertEquals(plan, ((List<?>) result.get("plans")).get(0));
  }

  @Test
  void sourceConstraintColumnsAlsoRequireSuccessfulReading() {
    IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
        () -> exchangeSequence(constraintDocument(), new ArrayList<>(),
            List.of(read("A1:J4"), complete(constrainedPlan(), "stop"))));
    assertTrue(error.getMessage().contains("unread"));
  }

  @Test
  void missingOrEmptyOptionalConstraintFieldsKeepOldPlansCompatible() {
    Map<String, Object> plan = plan();
    plan.put("typeColumn", " "); plan.put("typeMapping", null);
    plan.put("nonStackColumn", null); plan.put("nonStackMapping", Map.of());
    plan.put("keepUprightColumn", ""); plan.put("keepUprightMapping", Map.of());
    plan.put("remarkColumn", null);
    exchangeSequence(document(), new ArrayList<>(), List.of(read("A1:J4"), complete(plan, "stop")));
  }

  @Test
  void rejectsUnsafeConstraintDictionariesAndMissingSourceColumns() {
    for (var change : List.of(
        Map.entry("typeMapping", Map.of("wood crate", "unknown-kind")),
        Map.entry("typeMapping", List.of("pallet")),
        Map.entry("nonStackMapping", Map.of("NO STACK", "true")),
        Map.entry("keepUprightMapping", Map.of("↑", 1)),
        Map.entry("nonStackColumn", "ZZ"))) {
      Map<String, Object> plan = constrainedPlan();
      plan.put(change.getKey(), change.getValue());
      assertThrows(IllegalArgumentException.class,
          () -> exchangeSequence(constraintDocument(), new ArrayList<>(), List.of(read("A1:N4"), complete(plan, "stop"))));
    }
    Map<String, Object> noSource = constrainedPlan();
    noSource.put("typeColumn", null);
    assertThrows(IllegalArgumentException.class,
        () -> exchangeSequence(constraintDocument(), new ArrayList<>(), List.of(read("A1:N4"), complete(noSource, "stop"))));
  }

  @Test
  void omittedNonEmptySheetAndUnreadIgnoredSheetAreBothRejected() {
    Map<String, Object> withNotes = notesDocument();
    Map<String, Object> ignored = Map.of("plans", List.of(plan()),
        "ignoredSheets", List.of(Map.of("sheet", "Notes", "reason", "Non-cargo explanatory notes")));
    IllegalArgumentException omitted = assertThrows(IllegalArgumentException.class,
        () -> exchangeSequence(withNotes, new ArrayList<>(), List.of(read("A1:J4"), complete(plan(), "stop"))));
    assertTrue(omitted.getMessage().contains("UNMAPPED_SOURCE_SHEET"));
    IllegalArgumentException unread = assertThrows(IllegalArgumentException.class,
        () -> exchangeSequence(withNotes, new ArrayList<>(), List.of(read("A1:J4"), completion(json(ignored), "stop"))));
    assertTrue(unread.getMessage().contains("unread"));
    exchangeSequence(withNotes, new ArrayList<>(), List.of(read("A1:J4"),
        calls("", call("notes", "read_sheet_range", "{\"sheet\":\"Notes\",\"range\":\"A1:B2\"}")),
        completion(json(ignored), "stop")));
  }

  @Test
  void invalidIgnoreDeclarationsCannotSilentlyRemoveAnEntireSheet() {
    for (var ignored : List.of(
        List.of(Map.of("sheet", "Unknown", "reason", "Not cargo")),
        List.of(Map.of("sheet", "Notes", "reason", " ")),
        List.of(Map.of("sheet", "Packages", "reason", "Skip cargo")),
        List.of(Map.of("sheet", "Notes", "reason", "One"), Map.of("sheet", "Notes", "reason", "Two")))) {
      Map<String, Object> finalPlan = Map.of("plans", List.of(plan()), "ignoredSheets", ignored);
      assertThrows(IllegalArgumentException.class, () -> exchangeSequence(notesDocument(), new ArrayList<>(),
          List.of(read("A1:J4"), completion(json(finalPlan), "stop"))));
    }
  }

  @Test
  void readingTheWholeSourceDoesNotPermitMappingOnlyItsFirstPackage() {
    Map<String, Object> document = document();
    Map<String, Object> sheet = new LinkedHashMap<>(WorkbookEvidenceService.list(document.get("sheets")).get(0));
    List<Map<String, Object>> cells = new ArrayList<>(WorkbookEvidenceService.list(sheet.get("cells")));
    cells.add(cell("C3", 3, 3, "Second product")); cells.add(cell("E3", 3, 5, 10));
    cells.add(cell("H3", 3, 8, 20)); cells.add(cell("G3", 3, 7, "100*100*100"));
    sheet.put("cells", cells);
    document = new LinkedHashMap<>(document);
    document.put("sheets", List.of(sheet));
    Map<String, Object> partial = plan(); partial.put("lastDataRow", 2); partial.put("totals", emptyTotals());
    Map<String, Object> finalDocument = document;
    IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
        () -> exchangeSequence(finalDocument, new ArrayList<>(), List.of(read("A1:J4"), complete(partial, "stop"))));
    assertTrue(error.getMessage().contains("UNMAPPED_SOURCE_ROWS"));
  }

  private Map<String, Object> exchangeSequence(Map<String, Object> document, List<Map<String, Object>> requests,
      List<Map<String, Object>> replies) {
    Function<Map<String, Object>, Map<String, Object>> exchange = request -> {
      requests.add(request);
      return replies.get(requests.size() - 1);
    };
    return conversation.recognize(document, exchange);
  }

  private Map<String, Object> read(String range) {
    return calls("", call("read-" + range, "read_sheet_range", json(Map.of("sheet", "Packages", "range", range))));
  }

  private Map<String, Object> complete(Map<String, Object> plan, String reason) {
    return completion(json(Map.of("plans", List.of(plan))), reason);
  }

  private Map<String, Object> completion(String content, String reason) {
    return Map.of("choices", List.of(Map.of("finish_reason", reason,
        "message", Map.of("role", "assistant", "content", content))));
  }

  @SafeVarargs
  private final Map<String, Object> calls(String reasoning, Map<String, Object>... calls) {
    Map<String, Object> assistant = new LinkedHashMap<>();
    assistant.put("role", "assistant");
    assistant.put("content", null);
    assistant.put("reasoning_content", reasoning);
    assistant.put("tool_calls", List.of(calls));
    return Map.of("choices", List.of(Map.of("finish_reason", "tool_calls", "message", assistant)));
  }

  private Map<String, Object> call(String id, String name, String arguments) {
    return Map.of("id", id, "type", "function", "function", Map.of("name", name, "arguments", arguments));
  }

  private Map<String, Object> plan() {
    Map<String, Object> plan = new LinkedHashMap<>();
    plan.put("sheet", "Packages");
    plan.put("firstDataRow", 2);
    plan.put("lastDataRow", 3);
    plan.put("packageIdColumn", "A");
    plan.put("marksColumn", "B");
    plan.put("packageQuantityColumn", null);
    plan.put("quantityBasis", "per-identity");
    plan.put("nameColumn", "C");
    plan.put("modelColumn", "D");
    plan.put("innerQuantityColumn", "E");
    plan.put("innerUnitWeightColumn", "F");
    plan.put("combinedDimensionsColumn", "G");
    plan.put("lengthColumn", null);
    plan.put("widthColumn", null);
    plan.put("heightColumn", null);
    plan.put("dimensionUnit", "cm");
    plan.put("grossWeightColumn", "H");
    plan.put("netWeightColumn", "I");
    plan.put("weightUnit", "kg");
    plan.put("weightBasis", "per-package");
    plan.put("totals", Map.of("packageCountCell", "A4", "innerQuantityCell", "E4", "grossWeightCell", "H4",
        "netWeightCell", "I4", "volumeCell", "J4"));
    return plan;
  }

  private Map<String, Object> emptyTotals() {
    Map<String, Object> totals = new LinkedHashMap<>();
    for (String field : List.of("packageCountCell", "innerQuantityCell", "grossWeightCell", "netWeightCell", "volumeCell")) {
      totals.put(field, null);
    }
    return totals;
  }

  private Map<String, Object> document() {
    return Map.of("fileName", "fixture.xls", "sheets", List.of(Map.of(
        "name", "Packages", "rowCount", 4, "columnCount", 10, "merges", List.of(), "cells", List.of(
            cell("A1", 1, 1, "Item"), cell("A2", 2, 1, 1), cell("A3", 3, 1, 2),
            cell("A4", 4, 1, 2), cell("B2", 2, 2, "PACK#1"), cell("C2", 2, 3, "PRIVATE_WORKBOOK_CELL"),
            cell("E4", 4, 5, 15), cell("H4", 4, 8, 30), cell("I4", 4, 9, 27), cell("J4", 4, 10, 2)
        )
    )));
  }

  private Map<String, Object> largeDocument() {
    List<Map<String, Object>> cells = new ArrayList<>();
    for (int row = 1; row <= 100; row++) cells.add(cell("A" + row, row, 1, "x".repeat(3000)));
    return Map.of("fileName", "large.xls", "sheets", List.of(Map.of(
        "name", "Packages", "rowCount", 100, "columnCount", 1, "merges", List.of(), "cells", cells)));
  }

  private Map<String, Object> constrainedPlan() {
    Map<String, Object> plan = plan();
    plan.put("typeColumn", "K"); plan.put("typeMapping", Map.of("wood crate", "pallet", "normal", "normal"));
    plan.put("nonStackColumn", "L"); plan.put("nonStackMapping", Map.of("NO STACK", true, "normal", false));
    plan.put("keepUprightColumn", "M"); plan.put("keepUprightMapping", Map.of("↑", true));
    plan.put("remarkColumn", "N");
    return plan;
  }

  private Map<String, Object> constraintDocument() {
    Map<String, Object> document = new LinkedHashMap<>(document());
    Map<String, Object> sheet = new LinkedHashMap<>(WorkbookEvidenceService.list(document.get("sheets")).get(0));
    sheet.put("columnCount", 14);
    List<Map<String, Object>> cells = new ArrayList<>(WorkbookEvidenceService.list(sheet.get("cells")));
    cells.add(cell("K2", 2, 11, "wood crate")); cells.add(cell("K3", 3, 11, "normal"));
    cells.add(cell("L2", 2, 12, "NO STACK")); cells.add(cell("L3", 3, 12, "normal"));
    cells.add(cell("M2", 2, 13, "↑")); cells.add(cell("N2", 2, 14, "Handle carefully"));
    sheet.put("cells", cells); document.put("sheets", List.of(sheet));
    return document;
  }

  private Map<String, Object> notesDocument() {
    Map<String, Object> document = new LinkedHashMap<>(document());
    List<Map<String, Object>> sheets = new ArrayList<>(WorkbookEvidenceService.list(document.get("sheets")));
    sheets.add(Map.of("name", "Notes", "rowCount", 2, "columnCount", 2, "merges", List.of(),
        "cells", List.of(cell("A1", 1, 1, "Explanatory notes"), cell("B2", 2, 2, "Read this note before ignoring"))));
    document.put("sheets", sheets);
    return document;
  }

  private Map<String, Object> cell(String address, int row, int column, Object value) {
    return Map.of("address", address, "row", row, "column", column, "value", value,
        "displayValue", String.valueOf(value), "type", value instanceof Number ? "number" : "string");
  }

  private List<String> tools(Map<String, Object> request) {
    List<String> names = new ArrayList<>();
    for (Object raw : (List<?>) request.get("tools")) {
      Map<?, ?> tool = (Map<?, ?>) raw;
      names.add(String.valueOf(((Map<?, ?>) tool.get("function")).get("name")));
    }
    return names;
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException error) {
      throw new AssertionError(error);
    }
  }
}
