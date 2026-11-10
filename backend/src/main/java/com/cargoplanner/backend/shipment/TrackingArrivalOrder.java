package com.cargoplanner.backend.shipment;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.ResolverStyle;
import java.util.Locale;
import java.util.regex.Pattern;

/** Uses the same displayed arrival for staff and customer pagination. No snapshot is changed. */
public final class TrackingArrivalOrder {
  private static final Pattern ENGLISH_DATE = Pattern.compile("(?i)(?<!\\d)(\\d{1,2})[- /]([A-Z]{3})[- /](\\d{4})(?!\\d)");
  private static final DateTimeFormatter ENGLISH = new DateTimeFormatterBuilder()
      .parseCaseInsensitive().appendPattern("d MMM uuuu").toFormatter(Locale.ENGLISH)
      .withResolverStyle(ResolverStyle.STRICT);
  private TrackingArrivalOrder() {}

  public static Long arrival(JsonNode snapshot) {
    if (snapshot == null) return null;
    JsonNode keys = snapshot.path("keyTimes"), last = null, ocean = null;
    for (JsonNode leg : snapshot.path("routingLegs")) {
      last = leg;
      if ("SEA".equalsIgnoreCase(leg.path("mode").asText())) ocean = leg;
    }
    JsonNode leg = ocean == null ? last : ocean;
    return parse(first(
        leg == null ? null : leg.path("actualArrival").asText(null),
        keys.path("actualArrival").path("time").asText(null),
        keys.path("actualArrival").path("reportedTime").asText(null),
        keys.path("estimatedDelivery").path("actualTime").asText(null),
        source(snapshot, "ata"),
        leg == null ? null : leg.path("estimatedArrival").asText(null),
        keys.path("estimatedFinalArrival").path("time").asText(null),
        keys.path("estimatedFinalArrival").path("reportedTime").asText(null),
        keys.path("estimatedArrival").path("time").asText(null),
        keys.path("estimatedArrival").path("reportedTime").asText(null),
        keys.path("estimatedDelivery").path("time").asText(null),
        source(snapshot, "eta")));
  }

  private static String source(JsonNode snapshot, String key) {
    for (JsonNode field : snapshot.path("sourceDetails").path("fields")) {
      String source = field.path("source").asText("");
      if (key.equals(field.path("key").asText()) &&
          (source.isBlank() || "shipment.fields".equals(source))) return field.path("value").asText(null);
    }
    return null;
  }

  private static String first(String... values) {
    for (String value : values) if (value != null && !value.isBlank() &&
        !value.trim().matches("(?i)N/?A|—|-|NULL")) return value.trim();
    return null;
  }

  public static Long parse(String raw) {
    if (raw == null || raw.isBlank()) return null;
    String value = raw.trim();
    try { return Instant.parse(value).toEpochMilli(); } catch (RuntimeException ignored) {}
    try { return OffsetDateTime.parse(value).toInstant().toEpochMilli(); } catch (RuntimeException ignored) {}
    try { return LocalDateTime.parse(value.replace(' ', 'T')).toInstant(ZoneOffset.UTC).toEpochMilli(); } catch (RuntimeException ignored) {}
    try { return LocalDate.parse(value).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(); } catch (RuntimeException ignored) {}
    var match = ENGLISH_DATE.matcher(value);
    if (match.find()) {
      try { return LocalDate.parse(match.group(1) + " " + match.group(2) + " " + match.group(3), ENGLISH)
          .atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(); } catch (RuntimeException ignored) {}
    }
    return null;
  }
}
