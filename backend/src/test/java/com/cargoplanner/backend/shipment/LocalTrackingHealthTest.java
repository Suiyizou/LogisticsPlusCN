package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class LocalTrackingHealthTest {
  private final ObjectMapper mapper = new ObjectMapper();
  private final MutableClock clock = new MutableClock();
  private final LocalTrackingHealth health = new LocalTrackingHealth(mapper, clock);

  @Test
  void lazyConnectionAndHttpSuccessDoNotProveBrowserHealth() throws Exception {
    JsonNode initial = health.snapshot(upstream(false), false);
    assertThat(initial.path("status").asText()).isEqualTo("UNVERIFIED");
    assertThat(initial.path("serviceReachable").asBoolean()).isTrue();
    assertThat(initial.path("requiresCanary").asBoolean()).isTrue();
    assertThat(initial.path("chromeConnected").asBoolean()).isFalse();
    assertThat(health.snapshot(upstream(true), false).path("status").asText())
        .isEqualTo("UNVERIFIED");
  }

  @Test
  void aLostPreviouslyObservedConnectionRequiresVerificationEvenAfterRecentSuccess() throws Exception {
    health.snapshot(upstream(true), false);
    health.recordQuerySuccess();
    JsonNode value = health.snapshot(upstream(false), false);
    assertThat(value.path("status").asText()).isEqualTo("DISCONNECTED");
    assertThat(value.path("requiresCanary").asBoolean()).isTrue();
  }

  @Test
  void recentRealQueryVerifiesReadinessButTheEvidenceExpires() throws Exception {
    health.recordQuerySuccess();
    JsonNode ready = health.snapshot(upstream(true), false);
    assertThat(ready.path("status").asText()).isEqualTo("READY");
    assertThat(ready.path("requiresCanary").asBoolean()).isFalse();
    assertThat(ready.path("lastCanaryAt").isNull()).isTrue();
    clock.advance(Duration.ofMinutes(10));
    JsonNode expired = health.snapshot(upstream(true), false);
    assertThat(expired.path("status").asText()).isEqualTo("UNVERIFIED");
    assertThat(expired.path("requiresCanary").asBoolean()).isTrue();
  }

  @Test
  void reconnectingAfterARecordedDisconnectStillRequiresNewSuccessfulWork() {
    health.recordQuerySuccess();
    assertThat(health.snapshot(upstream(false), false).path("status").asText()).isEqualTo("DISCONNECTED");
    assertThat(health.snapshot(upstream(true), false).path("status").asText()).isEqualTo("UNVERIFIED");
    health.recordCanarySuccess();
    assertThat(health.snapshot(upstream(true), false).path("status").asText()).isEqualTo("READY");
  }

  @Test
  void failedCanaryOverridesOlderSuccessAndSuccessfulWorkClearsTheFailure() throws Exception {
    health.recordCanarySuccess();
    clock.advance(Duration.ofSeconds(1));
    health.recordCanaryFailure("TRACKING_LOCAL_TIMEOUT");
    JsonNode failed = health.snapshot(upstream(true), true);
    assertThat(failed.path("status").asText()).isEqualTo("DEGRADED");
    assertThat(failed.path("lastCanaryErrorCode").asText()).isEqualTo("TRACKING_LOCAL_TIMEOUT");
    assertThat(failed.path("lastCanaryAt").asText()).isEqualTo(clock.instant().toString());
    clock.advance(Duration.ofSeconds(1));
    health.recordCanarySuccess();
    JsonNode recovered = health.snapshot(upstream(true), true);
    assertThat(recovered.path("status").asText()).isEqualTo("READY");
    assertThat(recovered.path("lastCanaryErrorCode").isNull()).isTrue();
    clock.advance(Duration.ofSeconds(1));
    health.recordCanaryFailure("TRACKING_QUERY_FAILED");
    health.recordQuerySuccess();
    assertThat(health.snapshot(upstream(true), true).path("status").asText()).isEqualTo("READY");
  }

  @Test
  void cloudTokenConfigurationDoesNotClaimUpstreamAuthenticationOrLeakSourceData() throws Exception {
    var source = mapper.createObjectNode().put("ok", true).put("token", "private-token")
        .put("error", "C:\\Users\\private\\file.txt");
    source.putObject("chrome").put("connected", false);
    health.recordCanaryFailure("secret-token / private browser error");
    JsonNode value = health.snapshot(source, true);
    assertThat(value.path("localTokenConfigured").asBoolean()).isTrue();
    assertThat(value.path("authenticationEnforced").asText()).isEqualTo("UNKNOWN");
    assertThat(value.path("lastCanaryErrorCode").asText()).isEqualTo("TRACKING_CANARY_FAILED");
    assertThat(value.toString()).doesNotContain("private-token", "Users", "file.txt", "secret-token");
    assertThat(health.snapshot(source, false).path("localTokenConfigured").asBoolean()).isFalse();
  }

  @Test
  void missingConnectionEvidenceAndAnUnhealthyServiceCannotBeReady() throws Exception {
    health.recordQuerySuccess();
    JsonNode unknown = health.snapshot(mapper.readTree("{\"ok\":true}"), false);
    assertThat(unknown.path("chromeConnected").isNull()).isTrue();
    assertThat(unknown.path("status").asText()).isEqualTo("UNVERIFIED");
    JsonNode unhealthy = health.snapshot(mapper.readTree("{\"ok\":false,\"chrome\":{\"connected\":true}}"), false);
    assertThat(unhealthy.path("status").asText()).isEqualTo("DEGRADED");
  }

  private JsonNode upstream(boolean connected) {
    return mapper.createObjectNode().put("ok", true)
        .set("chrome", mapper.createObjectNode().put("connected", connected));
  }

  private static final class MutableClock extends Clock {
    private Instant current = Instant.parse("2026-10-30T00:00:00Z");

    void advance(Duration value) { current = current.plus(value); }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
    @Override public Instant instant() { return current; }
  }
}
