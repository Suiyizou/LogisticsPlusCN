package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.shipment.TrackingAdapterClient.NormalizedTrackRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Set;

/** Maps source-reported facts without assigning guessed event or timezone semantics. */
final class TrackingV1SnapshotMapper {
  private static final int SOURCE_FIELD_LIMIT = 200;
  private static final int SOURCE_VALUE_LIMIT = 8_192;
  private static final Set<String> DETAIL_SOURCE_KINDS = Set.of(
      "PAGE_TEXT", "PAGE_OVERVIEW", "PAGE_DETAIL", "PAGE_DETAILS", "PDF_DOWNLOAD", "PDF_TEXT");
  private final ObjectMapper mapper;

  TrackingV1SnapshotMapper(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  ObjectNode map(JsonNode record, NormalizedTrackRequest request, String fetchedAt, String jobId) {
    JsonNode shipment = businessValue(record.path("shipment"));
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
    snapshot.put("deliveryMode", "SINGLE_RESPONSE");
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
      summary.set("containerCount", businessValue(shipment.path("container_count")));
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
      target.put("reportedStatusTime", first(container.path("status_time_raw"), container.path("status_time")));
      target.put("timezone", text(container.path("timezone")));
      String seal = first(container.path("seal"), container.path("seal_number"), container.path("extra").path("seal"), container.path("extra").path("seal_number"));
      target.put("seal", seal != null && !seal.contains("*") && !seal.contains("•") ? seal : null);
      target.put("weight", text(container.path("weight")));
      if (container.path("extra").isObject()) target.set("extra", businessValue(container.path("extra")));
      equipmentKg(target, "tareKg", container.path("tare_kg"));
      equipmentKg(target, "payloadKg", container.path("payload_kg"));
      target.put("estimatedArrival", text(container.path("eta")));
      target.put("estimatedArrivalRaw", first(container.path("eta_raw"), container.path("eta")));
      target.put("estimatedArrivalLabel", text(container.path("eta_label")));
      ArrayNode milestones = target.putArray("milestones");
      for (JsonNode event : array(container.path("events"))) {
        ObjectNode mapped = event(event, milestones.size() + 1, "container.events", false);
        if (mapped == null) continue;
        ObjectNode milestone = milestones.addObject();
        milestone.setAll(mapped);
        milestone.putNull("time");
        milestone.put("containerNumber", first(mapped.path("containerNumber"), container.path("number")));
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
    JsonNode capture = detailCapture(meta.path("detail_capture"));
    if (capture != null) source.set("detailCapture", capture);
    source.put("businessVerified", false);
    source.put("noBusinessData", "NO_BUSINESS_DATA".equals(text(query.path("status"))));
    JsonNode evidence = record.path("evidence");
    source.put("evidenceAvailable", first(evidence.path("text_path"),
        evidence.path("screenshot_path")) != null);
    ArrayNode warnings = source.putArray("warnings");
    for (JsonNode warning : array(businessValue(meta.path("warnings")))) {
      String value = text(warning);
      if (value != null) warnings.add(value);
    }
    ArrayNode sourceFields = source.putArray("fields");
    appendSourceFields(sourceFields, fields, "shipment.fields", "");
    appendSourceFields(sourceFields, shipment, "shipment",
        "bill_of_lading booking container_count route status containers events legs fields fields_extra");
    appendSourceFields(sourceFields, route, "shipment.route", "origin destination vessel");
    appendSourceFields(sourceFields, vessel, "shipment.route.vessel", "name voyage");
    appendSourceFields(sourceFields, status, "shipment.status", "state latest_event latest_event_at");
    appendSourceRows(sourceFields, shipment.path("legs"), "shipment.legs",
        "mode vessel_name voyage service load_port discharge_port origin destination etd eta atd ata");
    appendSourceRows(sourceFields, shipment.path("events"), "shipment.events",
        "sequence description status name raw time date time_raw location mode container_number containerNumber");
    int containerIndex = 0;
    for (JsonNode container : array(shipment.path("containers"))) {
      String path = "shipment.containers." + ++containerIndex;
      if (text(container.path("number")) == null) {
        appendSourceFields(sourceFields, container, path, "");
        continue;
      }
      appendSourceFields(sourceFields, container, path,
          "number type movement terms position latest_status status_time status_time_raw timezone seal seal_number weight tare_kg payload_kg eta eta_raw eta_label events");
      appendSourceRows(sourceFields, container.path("events"), path + ".events",
          "description status name time date time_raw location mode");
      if (sourceFields.size() >= SOURCE_FIELD_LIMIT) break;
    }
    JsonNode extra = businessValue(shipment.path("fields_extra"));
    source.set("extraFields", extra.isObject() ? extra : mapper.createObjectNode());
    JsonNode businessExtras = extra.path("extra");
    source.set("businessExtras", businessExtras.isObject() ? businessExtras.deepCopy() : mapper.createObjectNode());
    ArrayNode additional = source.putArray("additionalEvents");
    appendEvents(additional, extra.path("hmm_history"), "hmm_history", true);
    appendEvents(additional, extra.path("msc_events"), "msc_events", true);
    return envelope;
  }

  private void appendSourceRows(ArrayNode target, JsonNode rows, String path, String mapped) {
    int index = 0;
    for (JsonNode row : array(rows)) {
      if (target.size() >= SOURCE_FIELD_LIMIT) return;
      appendSourceFields(target, row, path + "." + ++index, mapped);
    }
  }

  private void appendSourceFields(ArrayNode target, JsonNode values, String path, String mapped) {
    if (!values.isObject()) return;
    Set<String> mappedKeys = Set.of(mapped.split(" "));
    var fields = values.fields();
    while (fields.hasNext() && target.size() < SOURCE_FIELD_LIMIT) {
      var field = fields.next();
      if (!isBusinessKey(field.getKey())) continue;
      JsonNode value = field.getValue();
      if (value.isNull() || (value.isContainerNode() && value.isEmpty())
          || (value.isTextual() && value.asText().isBlank())
          || (mappedKeys.contains(field.getKey()) && !value.isContainerNode())) continue;
      // These branches have their own typed fields or are traversed separately.
      if ("shipment".equals(path) && mappedKeys.contains(field.getKey())) continue;
      if ("shipment.route".equals(path) && "vessel".equals(field.getKey())) continue;
      if (path.startsWith("shipment.containers.") && mappedKeys.contains("events")
          && "events".equals(field.getKey())) continue;
      value = businessValue(value);
      if (value.isMissingNode() || value.isNull()) continue;
      if (value.isContainerNode() && value.isEmpty()) continue;
      String rawText = value.isTextual() ? value.asText() : value.toString();
      ObjectNode entry = target.addObject();
      entry.put("key", field.getKey());
      entry.put("source", path);
      if (rawText.length() <= SOURCE_VALUE_LIMIT) {
        entry.set("value", value);
      } else {
        String preview = rawText.substring(0, SOURCE_VALUE_LIMIT);
        entry.put("value", preview);
        entry.put("rawText", preview);
        entry.put("structured", value.isContainerNode());
        entry.put("truncated", true);
      }
    }
  }

  private boolean isBusinessKey(String key) {
    return TrackingSnapshotPrivacy.isPublicKey(key) && !"provenance".equalsIgnoreCase(key);
  }

  private JsonNode businessValue(JsonNode value) {
    return TrackingSnapshotPrivacy.sanitize(value);
  }

  private void equipmentKg(ObjectNode target, String key, JsonNode value) {
    if (value.isNumber() && value.doubleValue() >= 0) target.set(key, value.deepCopy());
  }

  private JsonNode detailCapture(JsonNode value) {
    String status = text(value.path("status"));
    if (!List.of("captured", "partial", "overview_only", "unverified").contains(status == null ? "" : status)) return null;
    ObjectNode capture = mapper.createObjectNode();
    JsonNode coverage = value.path("coverage");
    capture.put("status", status);
    capture.put("scopeComplete", coverage.path("scope_complete").asBoolean(false));
    JsonNode declared = coverage.path("declared_containers");
    if (declared.isIntegralNumber() && declared.asInt() >= 0) capture.set("declaredContainers", declared.deepCopy());
    else capture.putNull("declaredContainers");
    capture.put("overviewCount", uniqueTextCount(coverage.path("overview_containers")));
    capture.put("detailedCount", uniqueTextCount(coverage.path("detailed_containers")));
    capture.put("pendingCount", uniqueTextCount(coverage.path("pending_containers")));
    ArrayNode kinds = capture.putArray("sourceKinds");
    Set<String> seen = new java.util.LinkedHashSet<>();
    for (JsonNode source : array(value.path("sources"))) {
      String kind = text(source.path("kind"));
      if (kind != null && DETAIL_SOURCE_KINDS.contains(kind) && seen.add(kind)) kinds.add(kind);
    }
    return capture;
  }

  private int uniqueTextCount(JsonNode values) {
    Set<String> seen = new java.util.HashSet<>();
    for (JsonNode value : array(values)) {
      String item = text(value);
      if (item != null) seen.add(item);
    }
    return seen.size();
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
    String typedTime = first(value.path("time"), value.path("date"));
    String time = first(value.path("time_raw"), value.path("reportedTime"), value.path("time"), value.path("date"));
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
    result.putNull("estimatedAt");
    String timeType = text(value.path("time_type"));
    if (!List.of("ACTUAL", "ESTIMATED", "REPORTED").contains(timeType == null ? "" : timeType)) timeType = "REPORTED";
    if ("ACTUAL".equals(timeType)) result.put("occurredAt", typedTime);
    if ("ESTIMATED".equals(timeType)) result.put("estimatedAt", typedTime);
    result.put("timeType", timeType);
    result.put("sourceTime", typedTime);
    result.put("reportedTime", time);
    result.put("location", location);
    result.put("transportMode", text(value.path("mode")));
    result.put("containerNumber", first(value.path("container_number"), value.path("containerNumber")));
    result.put("terminal", text(value.path("terminal")));
    result.put("vesselName", first(value.path("vessel"), value.path("vessel_name")));
    result.put("voyage", text(value.path("voyage")));
    result.put("timezone", text(value.path("timezone")));
    result.put("timePrecision", text(value.path("time_precision")));
    result.put("loadStatus", text(value.path("load_status")));
    if (value.path("vessel_details").isObject()) result.set("vesselDetails", businessValue(value.path("vessel_details")));
    if (value.path("terminal_details").isObject()) result.set("terminalDetails", businessValue(value.path("terminal_details")));
    String sourceKind = first(value.path("source").path("kind"), value.path("source"));
    result.put("sourceKind", sourceKind != null && DETAIL_SOURCE_KINDS.contains(sourceKind) ? sourceKind : null);
    result.put("source", source);
    result.put("semanticKind", "REPORTED".equals(timeType) ? "SOURCE_ENTRY" : "CARRIER_EVENT");
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
