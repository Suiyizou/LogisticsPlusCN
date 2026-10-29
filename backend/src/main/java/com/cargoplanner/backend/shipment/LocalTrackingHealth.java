package com.cargoplanner.backend.shipment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/** Separates HTTP reachability, a browser connection, and recent successful work. */
final class LocalTrackingHealth {
  private static final Duration VERIFICATION_FRESHNESS = Duration.ofMinutes(10);
  private final ObjectMapper mapper;
  private final Clock clock;
  private boolean observedConnected;
  private boolean verificationInvalidated;
  private Instant lastVerifiedAt;
  private Instant lastCanaryAt;
  private String lastCanaryErrorCode;

  LocalTrackingHealth(ObjectMapper mapper) {
    this(mapper, Clock.systemUTC());
  }

  LocalTrackingHealth(ObjectMapper mapper, Clock clock) {
    this.mapper = mapper;
    this.clock = clock;
  }

  synchronized void recordQuerySuccess() {
    lastVerifiedAt = clock.instant();
    observedConnected = true;
    verificationInvalidated = false;
    lastCanaryErrorCode = null;
  }

  synchronized void recordCanarySuccess() {
    recordQuerySuccess();
    lastCanaryAt = lastVerifiedAt;
  }

  synchronized void recordCanaryFailure(String code) {
    lastCanaryAt = clock.instant();
    lastCanaryErrorCode = code != null && code.matches("[A-Z0-9_]{1,80}")
        ? code : "TRACKING_CANARY_FAILED";
  }

  synchronized ObjectNode snapshot(JsonNode upstreamHealth, boolean tokenConfigured) {
    Instant now = clock.instant();
    JsonNode connectedNode = upstreamHealth.path("chrome").path("connected");
    Boolean connected = connectedNode.isBoolean() ? connectedNode.booleanValue() : null;
    boolean disconnected = Boolean.FALSE.equals(connected) && observedConnected;
    if (disconnected) verificationInvalidated = true;
    if (Boolean.TRUE.equals(connected)) observedConnected = true;
    boolean recentlyVerified = lastVerifiedAt != null
        && lastVerifiedAt.plus(VERIFICATION_FRESHNESS).isAfter(now);
    String status;
    if (disconnected) {
      status = "DISCONNECTED";
    } else if (!upstreamHealth.path("ok").asBoolean(false) || lastCanaryErrorCode != null) {
      status = "DEGRADED";
    } else if (Boolean.TRUE.equals(connected) && recentlyVerified && !verificationInvalidated) {
      status = "READY";
    } else {
      status = "UNVERIFIED";
    }

    ObjectNode value = mapper.createObjectNode();
    value.put("status", status);
    value.put("serviceReachable", true);
    if (connected == null) value.putNull("chromeConnected");
    else value.put("chromeConnected", connected);
    value.put("requiresCanary", !"READY".equals(status));
    value.put("checkedAt", now.toString());
    value.put("verificationFreshnessSeconds", VERIFICATION_FRESHNESS.toSeconds());
    value.put("lastVerifiedAt", lastVerifiedAt == null ? null : lastVerifiedAt.toString());
    value.put("lastCanaryAt", lastCanaryAt == null ? null : lastCanaryAt.toString());
    value.put("lastCanaryErrorCode", lastCanaryErrorCode);
    // This only describes the Java configuration. A successful request cannot
    // prove whether the desktop service actually enforces authentication.
    value.put("localTokenConfigured", tokenConfigured);
    value.put("authenticationEnforced", "UNKNOWN");
    return value;
  }
}
