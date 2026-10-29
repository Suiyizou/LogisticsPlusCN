package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.shipment.TrackingAdapterClient.NormalizedTrackRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;

/** Maps source-reported facts without assigning guessed event or timezone semantics. */
final class TrackingV1SnapshotMapper {
  private final ObjectMapper mapper;

  TrackingV1SnapshotMapper(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  ObjectNode map(JsonNode record, NormalizedTrackRequest request, String fetchedAt, String jobId) {
    JsonNode shipment = record.path("shipment");
    JsonNode fields = shipment.path("fields");
    JsonNode route = shipment.path("route");
    JsonNode vessel = route.path("vessel");
    JsonNode status = shipment.path("status");
    JsonNode query = record.path("query");
    JsonNode meta = record.path("meta");
    String origin = first(route.path("origin"), fields.path("origin"));
    String destination = first(route.path("destination"), fields.path("destination"));
    String vesselName = first(vessel.path("name"), fields.path("vessel"));
    String voyage = first(vessel.path("voyage"), fields.path("voyage"));

    ObjectNode envelope = mapper.createObjectNode();
    envelope.putNull("raw");
    envelope.put("cached", false);
    envelope.put("sourceSchema", "tracking.v1");
    ObjectNode snapshot = envelope.putObject("snapshot");
    snapshot.put("schemaVersion", "tracking.v1");
    snapshot.put("channel", "LOCAL_CHROME");
    snapshot.put("fetchedAt", first(record.path("generated_at"), mapper.valueToTree(fetchedAt)));
    ObjectNode provider = snapshot.putObject("provider");
    provider.put("code", request.carrier());
    provider.put("name", first(record.path("carrier").path("name"),
        mapper.valueToTree(request.carrier())));
    provider.put("scac", text(record.path("carrier").path("scac")));
    ObjectNode tracking = snapshot.putObject("tracking");
    tracking.put("type", request.type());
    tracking.put("number", request.number());
    tracking.put("originalNumber", first(query.path("reference_input"),
        mapper.valueToTree(request.number())));

    ObjectNode summary = snapshot.putObject("summary");
    summary.put("billOfLading", first(shipment.path("bill_of_lading"), fields.path("bill_of_lading")));
    ArrayNode bookings = summary.putArray("bookingNumbers");
    String booking = first(shipment.path("booking"), fields.path("booking"));
    if (booking != null) bookings.add(booking);
    location(summary, "origin", origin);
    location(summary, "destination", destination);
    summary.put("vesselVoyage", joined(vesselName, voyage));
    summary.put("status", first(status.path("state"), fields.path("state")));
    String latest = first(status.path("latest_event"), fields.path("latest_event"));
    if (latest == null) {
      summary.putNull("latestEvent");
    } else {
      ObjectNode event = summary.putObject("latestEvent");
      event.put("name", latest);
      event.putNull("occurredAt");
      event.put("reportedTime", first(status.path("latest_event_at"), fields.path("latest_event_at")));
    }
    if (shipment.path("container_count").isObject()) {
      summary.set("containerCount", shipment.path("container_count").deepCopy());
    } else {
      ObjectNode count = summary.putObject("containerCount");
      count.set("declared", valueOrNull(fields.path("container_count_declared")));
      count.set("extracted", valueOrNull(fields.path("container_count_extracted")));
    }
    ObjectNode references = snapshot.putObject("references");
    references.set("masterBill", summary.path("billOfLading").deepCopy());
    references.set("bookingNumbers", bookings.deepCopy());

    ObjectNode keyTimes = snapshot.putObject("keyTimes");
    keyTime(keyTimes, "estimatedDeparture", fields.path("etd"), origin);
    keyTime(keyTimes, "estimatedArrival", fields.path("eta"), destination);
    keyTime(keyTimes, "actualDeparture", fields.path("atd"), origin);
    keyTime(keyTimes, "actualArrival", fields.path("ata"), destination);
    // Origin/destination labels alone do not establish itinerary milestones.
    snapshot.putArray("route");
    ArrayNode legs = snapshot.putArray("routingLegs");
    for (JsonNode leg : array(shipment.path("legs"))) {
      if (!leg.isObject()) continue;
      ObjectNode target = legs.addObject();
      target.put("sequence", legs.size());
      target.put("mode", text(leg.path("mode")));
      target.put("vesselName", first(leg.path("vessel"), leg.path("vessel_name"),
          leg.path("vessel").path("name")));
      target.put("voyage", text(leg.path("voyage")));
      target.put("service", text(leg.path("service")));
      target.put("loadPort", first(leg.path("load_port"), leg.path("origin")));
      target.put("dischargePort", first(leg.path("discharge_port"), leg.path("destination")));
      target.put("estimatedDeparture", text(leg.path("etd")));
      target.put("estimatedArrival", text(leg.path("eta")));
      target.put("actualDeparture", text(leg.path("atd")));
      target.put("actualArrival", text(leg.path("ata")));
    }

    ArrayNode containers = snapshot.putArray("containers");
    for (JsonNode container : array(shipment.path("containers"))) {
      String number = text(container.path("number"));
      if (number == null) continue;
      ObjectNode target = containers.addObject();
      target.put("number", number);
      target.put("type", text(container.path("type")));
      target.put("transportMode", text(container.path("movement")));
      target.put("trafficTerm", text(container.path("terms")));
      target.put("currentLocation", text(container.path("position")));
      target.put("latestEvent", text(container.path("latest_status")));
      target.put("latestEventTime", text(container.path("status_time")));
      target.put("reportedStatusTime", text(container.path("status_time")));
      target.put("seal", first(container.path("seal"), container.path("seal_number")));
      target.put("weight", text(container.path("weight")));
      ArrayNode milestones = target.putArray("milestones");
      for (JsonNode event : array(container.path("events"))) {
        ObjectNode mapped = event(event, milestones.size() + 1, "container.events", false);
        if (mapped == null) continue;
        ObjectNode milestone = milestones.addObject();
        milestone.set("name", mapped.path("name"));
        milestone.putNull("time");
        milestone.set("reportedTime", mapped.path("reportedTime"));
        milestone.set("location", mapped.path("location"));
        milestone.set("transportMode", mapped.path("transportMode"));
      }
    }
    ArrayNode events = snapshot.putArray("events");
    appendEvents(events, shipment.path("events"), "shipment.events", false);

    ObjectNode source = snapshot.putObject("sourceDetails");
    source.put("schema", "tracking.v1");
    source.put("queryStatus", text(query.path("status")));
    source.put("strategy", text(query.path("strategy")));
    source.put("referenceSubmitted", text(query.path("reference_submitted")));
    source.put("referenceType", text(query.path("reference_type")));
    source.set("durationSeconds", valueOrNull(query.path("duration_seconds")));
    source.put("jobId", jobId);
    source.put("vessel", vesselName);
    source.put("voyage", voyage);
    source.put("confidence", text(meta.path("confidence")));
    source.put("businessVerified", false);
    source.put("noBusinessData", "NO_BUSINESS_DATA".equals(text(query.path("status"))));
    JsonNode evidence = record.path("evidence");
    source.put("evidenceAvailable", first(evidence.path("text_path"),
        evidence.path("screenshot_path")) != null);
    ArrayNode warnings = source.putArray("warnings");
    for (JsonNode warning : array(meta.path("warnings"))) {
      String value = text(warning);
      if (value != null) warnings.add(value);
    }
    ArrayNode sourceFields = source.putArray("fields");
    if (fields.isObject()) {
      fields.fields().forEachRemaining(field -> {
        if (field.getValue().isNull() || field.getValue().isMissingNode()) return;
        ObjectNode entry = sourceFields.addObject();
        entry.put("key", field.getKey());
        entry.set("value", field.getValue().deepCopy());
      });
    }
    JsonNode extra = shipment.path("fields_extra");
    source.set("extraFields", extra.isObject() ? extra.deepCopy() : mapper.createObjectNode());
    ArrayNode additional = source.putArray("additionalEvents");
    appendEvents(additional, extra.path("hmm_history"), "hmm_history", true);
    appendEvents(additional, extra.path("msc_events"), "msc_events", true);
    return envelope;
  }

  private void appendEvents(ArrayNode target, JsonNode values, String source, boolean joinDate) {
    for (JsonNode value : array(values)) {
      ObjectNode event = event(value, target.size() + 1, source, joinDate);
      if (event != null) target.add(event);
    }
  }

  private ObjectNode event(JsonNode value, int sequence, String source, boolean joinDate) {
    if (!value.isObject()) return null;
    String name = first(value.path("description"), value.path("status"),
        value.path("name"), value.path("raw"));
    String time = first(value.path("time_raw"), value.path("time"), value.path("date"));
    if (joinDate && text(value.path("date")) != null && text(value.path("time")) != null
        && text(value.path("time_raw")) == null) {
      time = text(value.path("date")) + " " + text(value.path("time"));
    }
    String location = text(value.path("location"));
    if (name == null && time == null && location == null) return null;
    ObjectNode result = mapper.createObjectNode();
    if (value.path("sequence").isIntegralNumber()) result.set("sequence", value.path("sequence"));
    else result.put("sequence", sequence);
    result.put("name", name);
    result.putNull("occurredAt");
    result.put("reportedTime", time);
    result.put("location", location);
    result.put("transportMode", text(value.path("mode")));
    result.put("containerNumber", first(value.path("container_number"), value.path("containerNumber")));
    result.put("source", source);
    result.put("semanticKind", "SOURCE_ENTRY");
    result.put("raw", text(value.path("raw")));
    return result;
  }

  private void keyTime(ObjectNode target, String key, JsonNode value, String location) {
    String time = text(value);
    if (time == null) return;
    ObjectNode entry = target.putObject(key);
    entry.put("time", time);
    entry.put("location", location);
  }

  private void location(ObjectNode target, String key, String value) {
    if (value == null) target.putNull(key);
    else target.putObject(key).put("name", value);
  }

  private Iterable<JsonNode> array(JsonNode value) {
    return value.isArray() ? value : List.of();
  }

  private JsonNode valueOrNull(JsonNode value) {
    return value.isMissingNode() ? mapper.nullNode() : value.deepCopy();
  }

  private static String first(JsonNode... values) {
    for (JsonNode value : values) {
      String text = text(value);
      if (text != null) return text;
    }
    return null;
  }

  private static String text(JsonNode value) {
    if (value == null || (!value.isTextual() && !value.isNumber())) return null;
    String text = value.asText().trim();
    return text.isEmpty() ? null : text;
  }

  private static String joined(String first, String second) {
    if (first == null) return second;
    return second == null ? first : first + " / " + second;
  }
}
