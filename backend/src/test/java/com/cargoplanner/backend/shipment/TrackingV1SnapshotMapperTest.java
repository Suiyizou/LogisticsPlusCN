package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;

import com.cargoplanner.backend.shipment.TrackingAdapterClient.NormalizedTrackRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

class TrackingV1SnapshotMapperTest {
  private final ObjectMapper objectMapper = new ObjectMapper();
  private final TrackingV1SnapshotMapper mapper = new TrackingV1SnapshotMapper(objectMapper);

  @Test
  void preservesSourceFactsAndWarningsForExistingSnapshotConsumers() throws Exception {
    JsonNode record = objectMapper.readTree("""
        {
          "schema":"tracking.v1", "generated_at":"2026-10-30T10:30:00Z",
          "carrier":{"code":"COSCO","name":"COSCO SHIPPING","scac":"COSU"},
          "query":{"reference_input":"COSU00123456","reference_submitted":"00123456",
            "reference_type":"BILL_OF_LADING","status":"QUERY_COMPLETED",
            "strategy":"BROWSER","duration_seconds":37.5},
          "shipment":{
            "bill_of_lading":"COSU00123456","booking":"00001234",
            "container_count":{"declared":7,"extracted":1},
            "route":{"origin":"Shanghai, CN","destination":"Long Beach, US",
              "vessel":{"name":"SOURCE VESSEL","voyage":"001E"}},
            "status":{"state":"IN_TRANSIT","latest_event":"Source status",
              "latest_event_at":"2026-10-29 13:00"},
            "fields":{"etd":"Oct 28, 2026 13:00 (local)","eta":"2026-11-09",
              "atd":"2026-10-28T12:00+08:00","ata":null,
              "container_numbers":["TEST0000001"],"transit_days":12},
            "legs":[{"mode":"VESSEL","vessel":"SOURCE VESSEL","voyage":"001E",
              "load_port":"Shanghai, CN","discharge_port":"Long Beach, US",
              "etd":"2026-10-28","eta":"2026-11-09","service":"SOURCE SERVICE"}],
            "containers":[{"number":"TEST0000001","type":"40HC","movement":"VESSEL",
              "terms":"CY/CY","position":"SOURCE PORT","latest_status":"Source box status",
              "status_time":"29-Oct-2026 13:00","seal_number":"SEAL001","weight":"1000 KG"}],
            "events":[{"sequence":1,"description":"Source status","time":"2026-10-29T13:00",
              "time_raw":"29-Oct-2026 13:00","location":"SOURCE PORT","raw":"Unchanged source entry"}],
            "fields_extra":{"hmm_history":[{"date":"2026-10-29","time":"14:00",
              "status":"Source history","mode":"VESSEL"}],"free_time":"See carrier terms"}
          },
          "evidence":{"text_path":"D:/private/result.txt","screenshot_path":"D:/private/page.png"},
          "meta":{"warnings":["Declared seven containers but only one extracted"],
            "confidence":"PAGE_TEXT","business_verified":false}
        }
        """);
    JsonNode original = record.deepCopy();
    ObjectNode result = mapper.map(record,
        new NormalizedTrackRequest("COSCO", "AUTO", "BILLOFLADING", "COSU00123456"),
        "2026-10-30T11:00:00Z", "job-local-1");
    JsonNode snapshot = result.path("snapshot");

    assertThat(result.path("sourceSchema").asText()).isEqualTo("tracking.v1");
    assertThat(result.path("raw").isNull()).isTrue();
    assertThat(result.path("cached").asBoolean()).isFalse();
    assertThat(snapshot.path("channel").asText()).isEqualTo("LOCAL_CHROME");
    assertThat(snapshot.path("fetchedAt").asText()).isEqualTo("2026-10-30T10:30:00Z");
    assertThat(snapshot.path("tracking").path("number").asText()).isEqualTo("COSU00123456");
    assertThat(snapshot.path("provider").path("scac").asText()).isEqualTo("COSU");
    assertThat(snapshot.path("summary").path("bookingNumbers").get(0).asText()).isEqualTo("00001234");
    assertThat(snapshot.path("summary").path("containerCount").path("declared").asInt()).isEqualTo(7);
    assertThat(snapshot.path("containers")).hasSize(1);
    assertThat(snapshot.path("containers").get(0).path("latestEventTime").asText())
        .isEqualTo("29-Oct-2026 13:00");
    assertThat(snapshot.path("containers").get(0).path("seal").asText()).isEqualTo("SEAL001");
    assertThat(snapshot.path("routingLegs").get(0).path("estimatedArrival").asText()).isEqualTo("2026-11-09");
    assertThat(snapshot.path("keyTimes").path("estimatedDeparture").path("time").asText())
        .isEqualTo("Oct 28, 2026 13:00 (local)");
    assertThat(snapshot.path("keyTimes").path("actualDeparture").path("time").asText())
        .isEqualTo("2026-10-28T12:00+08:00");
    assertThat(snapshot.path("sourceDetails").path("fields").get(3).path("value"))
        .isEqualTo(record.path("shipment").path("fields").path("container_numbers"));
    assertThat(snapshot.path("sourceDetails").path("extraFields").path("free_time").asText())
        .isEqualTo("See carrier terms");
    assertThat(snapshot.path("sourceDetails").path("warnings").get(0).asText())
        .isEqualTo("Declared seven containers but only one extracted");
    assertThat(snapshot.path("sourceDetails").path("jobId").asText()).isEqualTo("job-local-1");
    assertThat(snapshot.path("sourceDetails").path("durationSeconds").asDouble()).isEqualTo(37.5);
    assertThat(snapshot.path("sourceDetails").path("evidenceAvailable").asBoolean()).isTrue();
    assertThat(result.toString()).doesNotContain("D:/private/", "text_path", "screenshot_path");
    assertThat(record).isEqualTo(original);
  }

  @Test
  void untypedSourceDatesNeverBecomeActualMilestonesOrFabricatedRoutes() throws Exception {
    JsonNode record = objectMapper.readTree("""
        {"schema":"tracking.v1","shipment":{
          "route":{"origin":"SOURCE ORIGIN","destination":"SOURCE DESTINATION"},
          "status":{"latest_event":"Departure","latest_event_at":"2026-10-29T13:00Z"},
          "events":[{"description":"Departure","time":"2026-10-29T13:00Z"}],
          "containers":[{"number":"TEST0000001","events":[
            {"description":"Source estimated call","time":"2026-11-09","time_raw":"9 Nov"}]}],
          "fields_extra":{"hmm_history":[{"date":"2026-10-29","time":"14:00","status":"Source event"}],
            "msc_events":[{"date":"2026-11-09","status":"Source event 2"}]}
        }}
        """);
    JsonNode snapshot = mapper.map(record,
        new NormalizedTrackRequest("HMM", "AUTO", "BILLOFLADING", "00001234"),
        "2026-10-30T10:00:00Z", "job-2").path("snapshot");

    assertThat(snapshot.path("route")).isEmpty();
    assertThat(snapshot.path("routingLegs")).isEmpty();
    assertThat(snapshot.path("keyTimes")).isEmpty();
    assertThat(snapshot.path("summary").path("latestEvent").path("occurredAt").isNull()).isTrue();
    assertThat(snapshot.path("summary").path("latestEvent").path("reportedTime").asText())
        .isEqualTo("2026-10-29T13:00Z");
    assertThat(snapshot.path("events").get(0).path("occurredAt").isNull()).isTrue();
    assertThat(snapshot.path("events").get(0).path("semanticKind").asText()).isEqualTo("SOURCE_ENTRY");
    JsonNode milestone = snapshot.path("containers").get(0).path("milestones").get(0);
    assertThat(milestone.path("time").isNull()).isTrue();
    assertThat(milestone.path("reportedTime").asText()).isEqualTo("9 Nov");
    JsonNode additional = snapshot.path("sourceDetails").path("additionalEvents");
    assertThat(additional).hasSize(2);
    assertThat(additional.get(0).path("occurredAt").isNull()).isTrue();
    assertThat(additional.get(0).path("reportedTime").asText()).isEqualTo("2026-10-29 14:00");
    assertThat(additional.get(1).path("occurredAt").isNull()).isTrue();
    assertThat(additional.get(1).path("reportedTime").asText()).isEqualTo("2026-11-09");
  }

  @Test
  void absentFactsStayMissingAndProviderAliasDoesNotChangeShipmentIdentity() throws Exception {
    JsonNode record = objectMapper.readTree("""
        {"schema":"tracking.v1","carrier":{"code":"CMA_CGM","name":"CMA CGM"},
          "query":{"reference_input":"00001234","reference_submitted":"001234",
            "reference_type":"BOOKING","status":"QUERY_COMPLETED"},
          "shipment":{},"meta":{"business_verified":true}}
        """);
    JsonNode snapshot = mapper.map(record,
        new NormalizedTrackRequest("CMA", "AUTO", "BOOKING", "00001234"),
        "2026-10-30T10:00:00Z", "job-3").path("snapshot");

    assertThat(snapshot.path("provider").path("code").asText()).isEqualTo("CMA");
    assertThat(snapshot.path("provider").path("name").asText()).isEqualTo("CMA CGM");
    assertThat(snapshot.path("tracking").path("type").asText()).isEqualTo("BOOKING");
    assertThat(snapshot.path("tracking").path("number").asText()).isEqualTo("00001234");
    assertThat(snapshot.path("fetchedAt").asText()).isEqualTo("2026-10-30T10:00:00Z");
    assertThat(snapshot.path("summary").path("origin").isNull()).isTrue();
    assertThat(snapshot.path("summary").path("destination").isNull()).isTrue();
    assertThat(snapshot.path("summary").path("latestEvent").isNull()).isTrue();
    assertThat(snapshot.path("summary").path("billOfLading").isNull()).isTrue();
    assertThat(snapshot.path("summary").path("bookingNumbers")).isEmpty();
    assertThat(snapshot.path("containers")).isEmpty();
    assertThat(snapshot.path("events")).isEmpty();
    assertThat(snapshot.path("sourceDetails").path("businessVerified").asBoolean()).isFalse();
    assertThat(snapshot.path("sourceDetails").path("evidenceAvailable").asBoolean()).isFalse();
    assertThat(snapshot.path("sourceDetails").path("fields")).isEmpty();
    assertThat(snapshot.path("sourceDetails").path("extraFields")).isEmpty();
  }
}
