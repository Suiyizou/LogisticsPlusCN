package com.cargoplanner.backend.shipment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.MissingNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Customer snapshots contain business facts, never worker files or credentials. */
final class TrackingSnapshotPrivacy {
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final Set<String> PRIVATE_KEYS = Set.of(
      "meta", "metadata", "evidence", "provenance", "cookie", "cookies", "setcookie", "authorization",
      "headers", "password", "token", "accesstoken", "refreshtoken", "sessiontoken",
      "idtoken", "apikey", "secret", "clientsecret");
  private static final Pattern LOCAL_PATH = Pattern.compile(
      "(?:^|[\\s\\\"'=])(?:[A-Za-z]:[\\\\/]|\\\\\\\\|file:|/(?!/)[A-Za-z0-9_.-]+/)");

  private TrackingSnapshotPrivacy() {}

  static boolean isPublicKey(String key) {
    String normalized = key.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    return !PRIVATE_KEYS.contains(normalized) && !normalized.contains("artifact")
        && !normalized.endsWith("path") && !normalized.endsWith("paths");
  }

  static JsonNode sanitize(JsonNode value) {
    if (value == null || value.isMissingNode()) return MissingNode.getInstance();
    if (value.isObject()) {
      // Source-field records may put an otherwise private key inside their data.
      if (value.path("key").isTextual() && !isPublicKey(value.path("key").asText())) {
        return MissingNode.getInstance();
      }
      ObjectNode result = JSON.createObjectNode();
      value.fields().forEachRemaining(field -> {
        if (!isPublicKey(field.getKey())) return;
        JsonNode clean = sanitize(field.getValue());
        if (!clean.isMissingNode()) result.set(field.getKey(), clean);
      });
      return result;
    }
    if (value.isArray()) {
      var result = JSON.createArrayNode();
      value.forEach(item -> {
        JsonNode clean = sanitize(item);
        if (!clean.isMissingNode()) result.add(clean);
      });
      return result;
    }
    if (value.isTextual()) {
      String text = value.asText();
      String trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          JsonNode parsed = JSON.readTree(text);
          if (parsed != null && parsed.isContainerNode()) {
            JsonNode clean = sanitize(parsed);
            return clean.equals(parsed) ? value : JSON.getNodeFactory().textNode(clean.toString());
          }
        } catch (Exception ignored) {
          // Ordinary carrier text is not required to be JSON.
        }
      }
      if (LOCAL_PATH.matcher(text).find()) return MissingNode.getInstance();
    }
    return value.deepCopy();
  }
}
