package com.cargoplanner.backend.shipment;

import com.fasterxml.jackson.databind.JsonNode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class TrackingTerminalState {
  private TrackingTerminalState() {}

  public static boolean isEmptyReturned(JsonNode snapshot) {
    if (snapshot == null || !snapshot.isObject()) return false;
    JsonNode containers = snapshot.path("containers");
    if (containers.isArray() && !containers.isEmpty()) {
      List<String> states = new ArrayList<>();
      for (JsonNode container : containers) {
        String state = latestContainerState(container);
        if (state != null) states.add(state);
      }
      if (!states.isEmpty()) {
        return states.size() == containers.size()
            && states.stream().allMatch(TrackingTerminalState::isEquivalentStatus);
      }
    }
    return isEquivalentStatus(eventText(snapshot.path("summary").path("latestEvent")))
        || isEquivalentStatus(eventText(snapshot.path("tracking").path("status")));
  }

  public static boolean isEquivalentStatus(String value) {
    String normalized = normalize(value);
    if (normalized.isEmpty()) return false;
    if (normalized.contains("还空箱") || normalized.contains("空箱返还")
        || normalized.contains("空箱已退回") || normalized.contains("空箱已归还")) return true;
    if (!normalized.contains("EMPTY") && !normalized.contains("MTY")) return false;
    return normalized.equals("EMPTY RETURN")
        || normalized.equals("MTY RETURN")
        || normalized.contains("RETURN OF EMPTY")
        || normalized.contains("EMPTY DROP OFF")
        || normalized.contains("RETURNED")
        || normalized.contains("RETURN COMPLETE")
        || normalized.contains("RETURN CONFIRMED")
        || normalized.contains("RECEIVED AT DEPOT")
        || normalized.contains("RECEIVED IN DEPOT")
        || normalized.contains("IN DEPOT")
        || normalized.contains("AT DEPOT");
  }

  private static String latestContainerState(JsonNode container) {
    String state = eventText(container.path("latestEvent"));
    if (state != null) return state;
    state = eventText(container.path("currentMilestone"));
    if (state != null) return state;
    JsonNode milestones = container.path("milestones");
    return milestones.isArray() && !milestones.isEmpty() ? eventText(milestones.get(0)) : null;
  }

  private static String eventText(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) return null;
    if (node.isTextual()) return blankToNull(node.asText());
    for (String field : List.of("name", "eventName", "status", "description", "event")) {
      String value = blankToNull(node.path(field).asText(null));
      if (value != null) return value;
    }
    return null;
  }

  private static String normalize(String value) {
    if (value == null || value.isBlank()) return "";
    return Normalizer.normalize(value, Normalizer.Form.NFKC)
        .toUpperCase(Locale.ROOT)
        .replaceAll("[^A-Z0-9\\p{IsHan}]+", " ")
        .replaceAll("\\s+", " ")
        .trim();
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
