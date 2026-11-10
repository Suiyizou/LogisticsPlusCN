package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;

import com.cargoplanner.backend.shipment.TrackingAdapterClient.NormalizedTrackRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

class TrackingDetailCompatibilityTest {
  private final ObjectMapper json = new ObjectMapper();
  private final TrackingV1SnapshotMapper mapper = new TrackingV1SnapshotMapper(json);

  private ObjectNode record() throws Exception {
    ObjectNode record = (ObjectNode) json.readTree("""
        {"schema":"tracking.v1","carrier":{"code":"CMA_CGM"},
         "query":{"status":"QUERY_COMPLETED","reference_input":"QA12345"},
         "meta":{"detail_capture":{"status":"captured","reason":"PRIVATE_REASON",
           "coverage":{"scope":"visible_container_histories_and_pdf","scope_complete":true,
             "declared_containers":2,"overview_containers":["BOX0000001","BOX0000002"],
             "detailed_containers":["BOX0000001","BOX0000002"],"pending_containers":[]},
           "sources":[{"kind":"PAGE_DETAILS","url":"https://www.cma-cgm.com/source"},
                      {"kind":"PDF_DOWNLOAD","url":"file:///private/source.pdf"}],
           "errors":[{"message":"PRIVATE_ERROR"}],"pdf":[{"parsed":false}]}},
         "shipment":{"route":{"origin":"SOURCE ORIGIN","destination":"SOURCE DESTINATION"},
           "fields_extra":{"official_url":"https://www.cma-cgm.com/source"},
           "containers":[],"events":[]}}
        """);
    var shipment = (ObjectNode) record.path("shipment");
    var containers = shipment.withArray("containers");
    var all = shipment.withArray("events");
    for (int box = 1; box <= 2; box++) {
      var container = containers.addObject();
      container.put("number", "BOX000000" + box);
      container.put("type", "40HC");
      container.put("tare_kg", 3800);
      container.put("payload_kg", 26680);
      container.put("eta", "2026-11-12T15:00");
      container.put("eta_raw", "12 Nov 2026 15:00");
      container.put("eta_label", "ETA");
      container.putNull("weight");
      var events = container.putArray("events");
      for (int move = 0; move < 8; move++) {
        var event = events.addObject();
        event.put("description", move % 2 == 0 ? "Loaded" : "Vessel Departure");
        event.put("location", "SOURCE PORT");
        event.put("terminal", "SOURCE TERMINAL");
        event.put("vessel", box == 1 ? "SOURCE VESSEL A" : "SOURCE VESSEL B");
        event.put("voyage", "00" + box + "E");
        event.put("container_number", container.path("number").asText());
        event.put("time", "2020-01-0" + (move + 1) + "T0" + box + ":00");
        event.put("time_raw", "Jan " + (move + 1) + " 2020 0" + box + ":00");
        event.put("time_type", "REPORTED");
        event.putNull("timezone");
        event.putObject("source").put("kind", "PAGE_DETAILS");
        all.add(event.deepCopy());
      }
    }
    return record;
  }

  private JsonNode mapped(JsonNode record) {
    return mapper.map(record, new NormalizedTrackRequest("CMA", "AUTO", "BOOKING", "QA12345"),
        "2026-11-08T10:00:00Z", "qa-details").path("snapshot");
  }

  @Test
  void canonicalDetailSurvivesSerializationAndCustomerProjectionWithoutInventingActualEvents() throws Exception {
    JsonNode snapshot = mapped(record());
    JsonNode delivered = ShipmentTrackingService.projectSnapshotDelivery(
        json.readTree(json.writeValueAsString(snapshot)), new ShipmentTrackingProperties());
    assertThat(delivered.path("events")).hasSize(16);
    assertThat(delivered.path("containers")).hasSize(2);
    for (JsonNode container : delivered.path("containers")) {
      assertThat(container.path("milestones")).hasSize(8);
      assertThat(container.path("type").asText()).isEqualTo("40HC");
      assertThat(container.path("weight").isNull()).isTrue();
      assertThat(container.path("tareKg").asInt()).isEqualTo(3800);
      assertThat(container.path("payloadKg").asInt()).isEqualTo(26680);
      assertThat(container.path("estimatedArrivalRaw").asText()).isEqualTo("12 Nov 2026 15:00");
    }
    for (JsonNode event : delivered.path("events")) {
      assertThat(event.path("timeType").asText()).isEqualTo("REPORTED");
      assertThat(event.path("occurredAt").isNull()).isTrue();
      assertThat(event.path("estimatedAt").isNull()).isTrue();
      assertThat(event.path("reportedTime").asText()).startsWith("Jan ");
      assertThat(event.path("sourceKind").asText()).isEqualTo("PAGE_DETAILS");
      assertThat(event.path("containerNumber").asText()).startsWith("BOX");
      assertThat(event.path("terminal").asText()).isEqualTo("SOURCE TERMINAL");
    }
    assertThat(delivered.path("route")).isEmpty();
    assertThat(delivered.toString()).contains("SOURCE VESSEL A", "SOURCE VESSEL B", "https://www.cma-cgm.com/source");
  }

  @Test
  void coverageIsAnExplicitSafePublicProjectionNotRawCollectorMetadata() throws Exception {
    JsonNode capture = mapped(record()).path("sourceDetails").path("detailCapture");
    assertThat(capture.path("status").asText()).isEqualTo("captured");
    assertThat(capture.path("declaredContainers").asInt()).isEqualTo(2);
    assertThat(capture.path("detailedCount").asInt()).isEqualTo(2);
    assertThat(capture.path("pendingCount").asInt()).isZero();
    assertThat(capture.path("sourceKinds")).hasSize(2);
    assertThat(capture.toString()).doesNotContain("PRIVATE_", "file:", "https:", "errors", "parsed", "scope\"");
    var legacy = record();
    ((ObjectNode) legacy.path("meta")).remove("detail_capture");
    assertThat(mapped(legacy).path("sourceDetails").has("detailCapture")).isFalse();
  }

  @Test
  void onlyAnExplicitTimeTypeCreatesActualOrEstimatedEvidence() throws Exception {
    var record = record();
    var events = (com.fasterxml.jackson.databind.node.ArrayNode) record.path("shipment").path("events");
    ((ObjectNode) events.get(0)).put("time_type", "ACTUAL");
    ((ObjectNode) events.get(1)).put("time_type", "ESTIMATED");
    JsonNode mapped = mapped(record).path("events");
    assertThat(mapped.get(0).path("occurredAt").asText()).isEqualTo("2020-01-01T01:00");
    assertThat(mapped.get(0).path("estimatedAt").isNull()).isTrue();
    assertThat(mapped.get(1).path("estimatedAt").asText()).isEqualTo("2020-01-02T01:00");
    assertThat(mapped.get(1).path("occurredAt").isNull()).isTrue();
    assertThat(mapped.get(2).path("occurredAt").isNull()).isTrue();
  }

  @Test
  void nestedArtifactsAndEmbeddedFilePathsNeverEnterFreshOrSavedCustomerSnapshots() throws Exception {
    var record = record();
    var extra = (ObjectNode) record.path("shipment").path("fields_extra");
    extra.putObject("nested").putObject("detail_artifacts").put("pdf", "C:/private/cma.pdf");
    extra.withObject("nested").put("note", "saved to /tmp/private/cma.pdf");
    extra.withObject("nested").put("freeDays", 0);
    extra.put("raw_json", "{\"nested\":{\"detail_artifacts\":[{\"path\":\"/opt/private/cma.pdf\"}]},\"source_url\":\"https://www.cma-cgm.com/source\"}");
    record.putArray("detail_artifacts").addObject().put("path", "C:/private/raw.pdf");
    JsonNode snapshot = mapped(record);
    assertThat(snapshot.toString()).doesNotContain("private/", "detail_artifacts", "raw.pdf");
    assertThat(snapshot.toString()).contains("https://www.cma-cgm.com/source", "freeDays");
    var stored = (ObjectNode) snapshot.deepCopy();
    var fields = ((ObjectNode) stored.path("sourceDetails")).withArray("fields");
    fields.addObject().put("key", "detail_artifacts").put("value", "HIDDEN ARTIFACT");
    fields.addObject().put("key", "old_note").put("value", "file:///tmp/private/old.pdf");
    JsonNode delivered = ShipmentTrackingService.projectSnapshotDelivery(stored, new ShipmentTrackingProperties());
    assertThat(delivered.toString()).doesNotContain("private/", "HIDDEN ARTIFACT", "detail_artifacts");
    assertThat(delivered.toString()).contains("https://www.cma-cgm.com/source");
  }

  @Test
  void businessExtrasSurviveAFullSourceFieldBudgetAndCustomerJsonRoundTrip() throws Exception {
    var record = record();
    var shipment = (ObjectNode) record.path("shipment");
    var events = shipment.withArray("events");
    for (int index = 0; index < 500; index++) {
      var event = events.addObject();
      event.put("description", "Source movement");
      event.put("time_raw", "2026-11-08 12:00");
      event.putObject("extra").put("reported_mode", "SOURCE EVENT EXTRA " + index);
    }
    var business = ((ObjectNode) shipment.path("fields_extra")).putObject("extra");
    business.putArray("cargo_delivery").addArray().add("Firms Code").add("W185");
    business.putObject("empty_return_locations").putArray("rows").addArray()
        .add("APM TERMINALS").add("2500 NAVY WAY");
    var customs = business.putArray("customs_history");
    for (int index = 0; index < 7; index++) customs.addObject().put("Code Activity", "SOURCE CUSTOMS " + index);
    business.putObject("nested").putArray("detail_artifacts").addObject().put("path", "C:/private/details.pdf");
    JsonNode snapshot = mapped(record);
    assertThat(snapshot.path("sourceDetails").path("fields")).hasSize(200);
    JsonNode delivered = ShipmentTrackingService.projectSnapshotDelivery(
        json.readTree(json.writeValueAsString(snapshot)), new ShipmentTrackingProperties());
    JsonNode retained = delivered.path("sourceDetails").path("businessExtras");
    assertThat(retained.path("cargo_delivery").get(0).get(1).asText()).isEqualTo("W185");
    assertThat(retained.path("empty_return_locations").path("rows").get(0).get(1).asText())
        .isEqualTo("2500 NAVY WAY");
    assertThat(retained.path("customs_history")).hasSize(7);
    assertThat(retained.toString()).doesNotContain("detail_artifacts", "private/", "details.pdf");
  }
}
