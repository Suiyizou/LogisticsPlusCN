package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.shipment.TrackingAdapterClient.NormalizedTrackRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class LocalTrackingQueueClientTest {
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final String JOB = "2026-10-30T00-00-00-000Z-abc123";
  private static final String TOKEN = "test-desktop-token";
  private static final String NUMBER = "COSU9876543210";

  @Test
  void submitsWithBearerPollsAndRetriesNotReadyWithoutResubmitting() throws Exception {
    AtomicInteger polls = new AtomicInteger();
    AtomicInteger results = new AtomicInteger();
    try (QueueServer server = new QueueServer(request -> {
      if (request.path().equals("/jobs")) return accepted();
      if (request.path().equals("/jobs/" + JOB)) {
        return progress(polls.incrementAndGet() == 1 ? "running" : "completed");
      }
      if (request.path().equals("/jobs/" + JOB + "/result")) {
        return results.incrementAndGet() == 1
            ? reply(409, Map.of("error", "RESULT_NOT_READY", "status", "completed"))
            : reply(200, result("COSCO", NUMBER, "QUERY_COMPLETED"));
      }
      return reply(404, Map.of("error", "UNEXPECTED_PATH"));
    })) {
      TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
      JsonNode response = client.track(request());

      assertThat(response.path("snapshot").isObject()).isTrue();
      assertThat(response.path("snapshot").path("tracking").path("number").asText())
          .isEqualTo(NUMBER);
      assertThat(server.count("POST", "/jobs")).isEqualTo(1);
      assertThat(polls.get()).isEqualTo(3);
      assertThat(results.get()).isEqualTo(2);
      Request submitted = server.requests.get(0);
      assertThat(submitted.body().path("items").size()).isEqualTo(1);
      assertThat(submitted.body().path("items").get(0).path("carrier").asText())
          .isEqualTo("COSCO");
      assertThat(submitted.body().path("items").get(0).path("reference").asText())
          .isEqualTo(NUMBER);
      assertThat(submitted.body().path("source").asText()).isEqualTo("LogisticsPlusCN");
      assertThat(server.requests).allSatisfy(received -> {
        assertThat(received.authorization()).isEqualTo("Bearer " + TOKEN);
        assertThat(received.adapterKey()).isNull();
        assertThat(received.cmaCookie()).isNull();
        assertThat(received.path()).doesNotStartWith("/api/");
      });
      assertThat(response.toString()).doesNotContain(TOKEN);
    }
  }

  @Test
  void mapsCmaCodeOnlyAtQueueBoundaryAndKeepsOriginalReference() throws Exception {
    String reference = "CMDU1234567890";
    try (QueueServer server = completedServer("CMA_CGM", reference, "QUERY_COMPLETED")) {
      TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
      JsonNode response = client.track(new NormalizedTrackRequest("CMA", "AUTO", "BOOKING", reference));

      assertThat(server.requests.get(0).body().path("items").get(0).path("carrier").asText())
          .isEqualTo("CMA_CGM");
      assertThat(response.path("snapshot").path("provider").path("code").asText()).isEqualTo("CMA");
      assertThat(response.path("snapshot").path("tracking").path("number").asText())
          .isEqualTo(reference);
    }
  }

  @Test
  void canonicalizesCarrierAliasesBeforeSubmittingAndCheckingTheResult() throws Exception {
    Map<String, String> outbound = Map.of(
        "CMA_CGM", "CMA_CGM",
        "HPL", "HAPAG_LLOYD",
        "YANGMING", "YML",
        "YANG MING", "YML",
        "WHL", "WAN_HAI",
        "YML", "YML"
    );
    for (Map.Entry<String, String> alias : outbound.entrySet()) {
      String canonical = "CMA_CGM".equals(alias.getValue()) ? "CMA" : alias.getValue();
      String type = "CMA".equals(canonical) ? "BOOKING" : "BILLOFLADING";
      try (QueueServer server = completedServer(alias.getValue(), NUMBER, "QUERY_COMPLETED")) {
        TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
        JsonNode response = client.track(new NormalizedTrackRequest(alias.getKey(), "AUTO", type, NUMBER));

        assertThat(server.requests.get(0).body().path("items").get(0).path("carrier").asText())
            .as(alias.getKey()).isEqualTo(alias.getValue());
        assertThat(response.path("snapshot").path("provider").path("code").asText())
            .as(alias.getKey()).isEqualTo(canonical);
        assertThat(response.path("snapshot").path("tracking").path("number").asText()).isEqualTo(NUMBER);
      }
    }
  }

  @Test
  void emptyDesktopTokenOmitsAuthorizationOnEveryQueueRequest() throws Exception {
    try (QueueServer server = completedServer("COSCO", NUMBER, "QUERY_COMPLETED")) {
      ShipmentTrackingProperties properties = properties(server);
      properties.setLocalToken("");
      TrackingAdapterClient client = new TrackingAdapterClient(properties);

      assertThat(client.track(request()).path("snapshot").isObject()).isTrue();
      assertThat(server.requests).allSatisfy(received -> assertThat(received.authorization()).isNull());
    }
  }

  @Test
  void acceptsEquivalentCarrierAliasInProgressWithoutRelaxingReferenceIdentity() throws Exception {
    try (QueueServer server = new QueueServer(received -> {
      if (received.path().equals("/jobs")) return accepted();
      if (received.path().equals("/jobs/" + JOB)) return progress("completed", "HPL", NUMBER, "done");
      return reply(200, result("HAPAG_LLOYD", NUMBER, "QUERY_COMPLETED"));
    })) {
      TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
      JsonNode response = client.track(new NormalizedTrackRequest("HAPAG_LLOYD", "AUTO", "BILLOFLADING", NUMBER));
      assertThat(response.path("snapshot").path("provider").path("code").asText()).isEqualTo("HAPAG_LLOYD");
      assertThat(server.count("POST", "/jobs")).isEqualTo(1);
    }
  }

  @Test
  void legacyModeNeverSendsDesktopBearerToken() throws Exception {
    try (QueueServer server = new QueueServer(request ->
        reply(200, Map.of("snapshot", Map.of("provider", Map.of("code", "COSCO")))))) {
      ShipmentTrackingProperties properties = properties(server);
      properties.setAdapterMode(ShipmentTrackingProperties.AdapterMode.LEGACY);
      TrackingAdapterClient client = new TrackingAdapterClient(properties);
      client.track(request());

      assertThat(server.requests).singleElement().satisfies(received -> {
        assertThat(received.path()).isEqualTo("/api/track");
        assertThat(received.authorization()).isNull();
        assertThat(received.adapterKey()).isEqualTo("legacy-adapter-test-key");
      });
    }
  }

  @Test
  void completedWithGapsPreservesHumanAndNoBusinessFailureSemantics() throws Exception {
    Map<String, String> expected = Map.of(
        "HUMAN_REQUIRED", "TRACKING_HUMAN_REQUIRED",
        "NO_BUSINESS_DATA", "TRACKING_NO_BUSINESS_DATA",
        "MATCHED_NO_STRUCTURE", "UPSTREAM_EMPTY",
        "CARRIER_NOT_IMPLEMENTED", "UNSUPPORTED_CARRIER",
        "FAILED", "TRACKING_QUERY_FAILED"
    );
    for (Map.Entry<String, String> entry : expected.entrySet()) {
      try (QueueServer server = completedServer("COSCO", NUMBER, entry.getKey())) {
        TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
        assertCode(() -> client.track(request()), entry.getValue());
        assertThat(server.count("POST", "/jobs")).isEqualTo(1);
      }
    }
  }

  @Test
  void readsItemFailuresBeforeResultEvenWhenTheJobOrQueryStatusLooksSuccessful() throws Exception {
    Map<String, String> codes = Map.of(
        "human_required", "TRACKING_HUMAN_REQUIRED",
        "no_business_data", "TRACKING_NO_BUSINESS_DATA",
        "carrier_not_implemented", "UNSUPPORTED_CARRIER",
        "failed", "TRACKING_QUERY_FAILED"
    );
    Map<String, HttpStatus> statuses = Map.of(
        "human_required", HttpStatus.CONFLICT,
        "no_business_data", HttpStatus.NOT_FOUND,
        "carrier_not_implemented", HttpStatus.NOT_FOUND,
        "failed", HttpStatus.BAD_GATEWAY
    );
    for (String jobStatus : List.of("running", "completed", "completed_with_gaps")) {
      for (Map.Entry<String, String> item : codes.entrySet()) {
        try (QueueServer server = new QueueServer(received -> {
          if (received.path().equals("/jobs")) return accepted();
          if (received.path().equals("/jobs/" + JOB)) {
            Reply progress = progress(jobStatus, "COSCO", NUMBER, item.getKey());
            ((ObjectNode) progress.body().path("items").get(0)).put("result_status", "QUERY_COMPLETED");
            return progress;
          }
          if (received.path().endsWith("/cancel")) return reply(200, Map.of("status", "cancelled"));
          // A result might be absent or stale; item failure must take precedence either way.
          return reply(200, result("COSCO", NUMBER, "QUERY_COMPLETED"));
        })) {
          TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
          assertThatThrownBy(() -> client.track(request()))
              .isInstanceOfSatisfying(ApiException.class, error -> {
                assertThat(error.code()).as(jobStatus + "/" + item.getKey()).isEqualTo(item.getValue());
                assertThat(error.status()).isEqualTo(statuses.get(item.getKey()));
              });
          assertThat(server.count("POST", "/jobs")).isEqualTo(1);
          assertThat(server.count("GET", "/jobs/" + JOB + "/result")).isZero();
        }
      }
    }
  }

  @Test
  void rejectsMalformedOrMismatchedProgressItemsBeforeFetchingResults() throws Exception {
    List<Consumer<ObjectNode>> mutations = List.of(
        progress -> progress.put("items", "invalid"),
        progress -> progress.putArray("items"),
        progress -> ((com.fasterxml.jackson.databind.node.ArrayNode) progress.path("items"))
            .add(progress.path("items").get(0).deepCopy()),
        progress -> progress.putArray("items").add("invalid"),
        progress -> ((ObjectNode) progress.path("items").get(0)).put("carrier", "OOCL"),
        progress -> ((ObjectNode) progress.path("items").get(0)).put("reference", "COSU0000000000"),
        progress -> ((ObjectNode) progress.path("items").get(0)).put("status", "unexpected_status")
    );
    for (Consumer<ObjectNode> mutation : mutations) {
      ObjectNode progress = (ObjectNode) progress("completed").body();
      mutation.accept(progress);
      try (QueueServer server = new QueueServer(received -> {
        if (received.path().equals("/jobs")) return accepted();
        if (received.path().equals("/jobs/" + JOB)) return reply(200, progress);
        if (received.path().endsWith("/cancel")) return reply(200, Map.of("status", "cancelled"));
        return reply(200, result("COSCO", NUMBER, "QUERY_COMPLETED"));
      })) {
        TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
        assertCode(() -> client.track(request()), "TRACKING_LOCAL_INVALID_RESPONSE");
        assertThat(server.count("GET", "/jobs/" + JOB + "/result")).isZero();
      }
    }
  }

  @Test
  void queryStatusCaseDoesNotHideSuccessfulOrFailedResults() throws Exception {
    try (QueueServer server = completedServer("COSCO", NUMBER, "query_completed")) {
      TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
      assertThat(client.track(request()).path("snapshot").isObject()).isTrue();
    }
    try (QueueServer server = completedServer("COSCO", NUMBER, "human_required")) {
      TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
      assertCode(() -> client.track(request()), "TRACKING_HUMAN_REQUIRED");
    }
  }

  @Test
  void noItemsSubmissionErrorRemainsBadRequestAndIsNeverRetried() throws Exception {
    try (QueueServer server = new QueueServer(received ->
        reply(400, Map.of("error", "NO_ITEMS", "details", TOKEN + " private upstream detail")))) {
      TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
      assertThatThrownBy(() -> client.track(request()))
          .isInstanceOfSatisfying(ApiException.class, error -> {
            assertThat(error.status()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(error.code()).isEqualTo("INVALID_REFERENCE");
            assertThat(error.getMessage()).doesNotContain(TOKEN, "private upstream detail");
            assertThat(error.details().toString()).doesNotContain(TOKEN, "private upstream detail");
          });
      assertThat(server.requests).hasSize(1);
    }
  }

  @Test
  void rejectsMismatchedBatchSchemaCarrierReferenceAndRecordCount() throws Exception {
    List<Consumer<ObjectNode>> mutations = List.of(
        batch -> batch.put("schema", "tracking.v2"),
        batch -> ((ObjectNode) batch.path("batch")).put("id", "another-job"),
        batch -> ((ObjectNode) batch.path("shipments").get(0)).put("schema", "tracking.v2"),
        batch -> ((ObjectNode) batch.path("shipments").get(0).path("carrier")).put("code", "OOCL"),
        batch -> ((ObjectNode) batch.path("shipments").get(0).path("query"))
            .put("reference_input", "COSU0000000000"),
        batch -> batch.putArray("shipments"),
        batch -> ((com.fasterxml.jackson.databind.node.ArrayNode) batch.path("shipments"))
            .add(batch.path("shipments").get(0).deepCopy()),
        batch -> ((ObjectNode) batch.path("shipments").get(0)).put("shipment", "invalid")
    );
    for (Consumer<ObjectNode> mutation : mutations) {
      ObjectNode payload = result("COSCO", NUMBER, "QUERY_COMPLETED");
      mutation.accept(payload);
      try (QueueServer server = new QueueServer(received -> {
        if (received.path().equals("/jobs")) return accepted();
        if (received.path().equals("/jobs/" + JOB)) return progress("completed");
        if (received.path().endsWith("/cancel")) return reply(200, Map.of("status", "cancelled"));
        return reply(200, payload);
      })) {
        TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
        assertCode(() -> client.track(request()), "TRACKING_LOCAL_INVALID_RESPONSE");
        assertThat(server.count("POST", "/jobs")).isEqualTo(1);
      }
    }
  }

  @Test
  void timeoutCancelsKnownJobAndDoesNotCreateReplacement() throws Exception {
    CountDownLatch firstPoll = new CountDownLatch(1);
    ExecutorService executor = Executors.newSingleThreadExecutor();
    try (QueueServer server = new QueueServer(received -> {
      if (received.path().equals("/jobs")) return accepted();
      if (received.path().endsWith("/cancel")) return reply(200, Map.of("status", "cancelled"));
      firstPoll.countDown();
      return progress("running");
    })) {
      ShipmentTrackingProperties properties = properties(server);
      properties.setLocalJobTimeout(Duration.ofSeconds(2));
      properties.setLocalRequestTimeout(Duration.ofSeconds(2));
      properties.setLocalPollInterval(Duration.ofMillis(25));
      TrackingAdapterClient client = new TrackingAdapterClient(properties);
      Future<JsonNode> tracking = executor.submit(() -> client.track(request()));

      // This specifically tests cancellation of a known job, after POST /jobs was read.
      assertThat(firstPoll.await(3, TimeUnit.SECONDS)).isTrue();
      assertThatThrownBy(() -> tracking.get(6, TimeUnit.SECONDS))
          .isInstanceOfSatisfying(ExecutionException.class, error ->
              assertThat(error.getCause()).isInstanceOfSatisfying(ApiException.class,
                  cause -> assertThat(cause.code()).isEqualTo("TRACKING_LOCAL_TIMEOUT")));
      assertThat(server.count("POST", "/jobs")).isEqualTo(1);
      assertThat(server.count("POST", "/jobs/" + JOB + "/cancel")).isEqualTo(1);
    } finally {
      executor.shutdownNow();
    }
  }

  @Test
  void cancellationBeforeSubmissionResponseStillCancelsAcceptedJob() throws Exception {
    CountDownLatch submitting = new CountDownLatch(1);
    CountDownLatch releaseSubmission = new CountDownLatch(1);
    ExecutorService executor = Executors.newSingleThreadExecutor();
    try (QueueServer server = new QueueServer(received -> {
      if (received.path().equals("/jobs")) {
        submitting.countDown();
        if (!releaseSubmission.await(3, TimeUnit.SECONDS)) throw new IOException("Submission was not released");
        return accepted();
      }
      if (received.path().endsWith("/cancel")) return reply(200, Map.of("id", JOB, "status", "cancelled"));
      return progress("running");
    })) {
      TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
      Future<JsonNode> tracking = executor.submit(() -> client.track(
          new NormalizedTrackRequest("COSCO", "AUTO", "BOOKING", NUMBER, "batch-cancel-race")));
      assertThat(submitting.await(2, TimeUnit.SECONDS)).isTrue();
      client.cancelBatchTask("batch-cancel-race");
      releaseSubmission.countDown();

      assertThatThrownBy(() -> tracking.get(3, TimeUnit.SECONDS))
          .isInstanceOfSatisfying(ExecutionException.class, error ->
              assertThat(error.getCause()).isInstanceOfSatisfying(ApiException.class,
                  cause -> assertThat(cause.code()).isEqualTo("TRACKING_CANCELLED")));
      assertThat(server.count("POST", "/jobs")).isEqualTo(1);
      assertThat(server.count("POST", "/jobs/" + JOB + "/cancel")).isEqualTo(1);
      assertThat(server.count("GET", "/jobs/" + JOB)).isZero();
    } finally {
      releaseSubmission.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void unreachableDesktopApiDoesNotFallBackToLegacyBrowserService() throws Exception {
    int unusedPort;
    try (ServerSocket unused = new ServerSocket(0, 1, java.net.InetAddress.getLoopbackAddress())) {
      unusedPort = unused.getLocalPort();
    }
    try (QueueServer legacy = new QueueServer(received -> reply(200, Map.of("snapshot", Map.of())))) {
      ShipmentTrackingProperties properties = properties(legacy);
      properties.setLocalBaseUrl("http://127.0.0.1:" + unusedPort);
      TrackingAdapterClient client = new TrackingAdapterClient(properties);
      assertCode(() -> client.track(request()), "TRACKING_LOCAL_UNAVAILABLE");
      assertThat(legacy.requests).isEmpty();
    }
  }

  @Test
  void serializesConcurrentCallsUntilTheFirstRemoteJobCompletes() throws Exception {
    AtomicInteger submissions = new AtomicInteger();
    CountDownLatch firstPolling = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);
    CountDownLatch secondStarted = new CountDownLatch(1);
    CountDownLatch secondSubmitted = new CountDownLatch(1);
    ExecutorService executor = Executors.newFixedThreadPool(2);
    try (QueueServer server = new QueueServer(received -> {
      if (received.path().equals("/jobs")) {
        int index = submissions.incrementAndGet();
        if (index == 2) secondSubmitted.countDown();
        return reply(202, Map.of("job_id", JOB + "-" + index, "status", "queued", "total", 1));
      }
      String remoteId = received.path().substring("/jobs/".length()).split("/")[0];
      if (received.path().endsWith("/result")) {
        ObjectNode payload = result("COSCO", NUMBER, "QUERY_COMPLETED");
        ((ObjectNode) payload.path("batch")).put("id", remoteId);
        return reply(200, payload);
      }
      if (remoteId.equals(JOB + "-1")) {
        firstPolling.countDown();
        if (!releaseFirst.await(3, TimeUnit.SECONDS)) throw new IOException("First job was not released");
      }
      return reply(200, Map.of("id", remoteId, "status", "completed"));
    })) {
      TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
      Future<JsonNode> first = executor.submit(() -> client.track(request()));
      assertThat(firstPolling.await(2, TimeUnit.SECONDS)).isTrue();
      Future<JsonNode> second = executor.submit(() -> {
        secondStarted.countDown();
        return client.track(request());
      });
      assertThat(secondStarted.await(1, TimeUnit.SECONDS)).isTrue();
      assertThat(secondSubmitted.await(100, TimeUnit.MILLISECONDS)).isFalse();
      releaseFirst.countDown();

      assertThat(first.get(2, TimeUnit.SECONDS).path("snapshot").isObject()).isTrue();
      assertThat(second.get(2, TimeUnit.SECONDS).path("snapshot").isObject()).isTrue();
      assertThat(submissions.get()).isEqualTo(2);
    } finally {
      releaseFirst.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void authenticationFailureDoesNotLeakResponseBodyOrTokenAndIsNotRetried() throws Exception {
    try (QueueServer server = new QueueServer(received ->
        reply(401, Map.of("error", TOKEN + " upstream-secret-details")))) {
      TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
      assertThatThrownBy(() -> client.track(request()))
          .isInstanceOfSatisfying(ApiException.class, error -> {
            assertThat(error.code()).isEqualTo("TRACKING_LOCAL_UNAUTHORIZED");
            assertThat(error.getMessage()).doesNotContain(TOKEN, "upstream-secret-details");
            assertThat(error.details().toString()).doesNotContain(TOKEN, "upstream-secret-details");
          });
      assertThat(server.requests).hasSize(1);
    }
  }

  @Test
  void healthReadsDoNotStartQueriesAndOnlySuccessfulCanaryVerifiesConnectedChrome() throws Exception {
    AtomicReference<Boolean> connected = new AtomicReference<>(false);
    try (QueueServer server = new QueueServer(received -> {
      if (received.path().equals("/health")) {
        return reply(200, Map.of("ok", true, "chrome", Map.of("connected", connected.get())));
      }
      if (received.path().equals("/jobs")) return accepted();
      if (received.path().equals("/jobs/" + JOB)) return progress("completed");
      if (received.path().equals("/jobs/" + JOB + "/result")) {
        return reply(200, result("COSCO", NUMBER, "QUERY_COMPLETED"));
      }
      return reply(404, Map.of("error", "UNEXPECTED_PATH"));
    })) {
      TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
      JsonNode initial = client.localHealth();
      assertThat(initial.path("status").asText()).isEqualTo("UNVERIFIED");
      assertThat(initial.path("serviceReachable").asBoolean()).isTrue();
      assertThat(initial.path("chromeConnected").asBoolean()).isFalse();
      assertThat(initial.path("requiresCanary").asBoolean()).isTrue();
      assertThat(initial.path("localTokenConfigured").asBoolean()).isTrue();
      assertThat(initial.path("authenticationEnforced").asText()).isEqualTo("UNKNOWN");

      connected.set(true);
      assertThat(client.localHealth().path("status").asText()).isEqualTo("UNVERIFIED");
      assertThat(server.count("POST", "/jobs")).isZero();
      assertThat(server.requests).allSatisfy(received -> assertThat(received.path()).isEqualTo("/health"));

      JsonNode canary = client.localCanary(new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", NUMBER, true));
      assertThat(canary.path("status").asText()).isEqualTo("SUCCEEDED");
      assertThat(canary.path("verified").asBoolean()).isTrue();
      assertThat(canary.path("persisted").asBoolean()).isFalse();
      assertThat(canary.path("checkedAt").asText()).isNotBlank();
      assertThat(canary.path("localJobId").asText()).isEqualTo(JOB);
      assertThat(canary.has("shipmentId")).isFalse();
      JsonNode verified = client.localHealth();
      assertThat(verified.path("status").asText()).isEqualTo("READY");
      assertThat(verified.path("requiresCanary").asBoolean()).isFalse();
      assertThat(verified.path("lastVerifiedAt").asText()).isNotBlank();
      assertThat(verified.path("lastCanaryAt").asText()).isNotBlank();
      assertThat(verified.path("authenticationEnforced").asText()).isEqualTo("UNKNOWN");
      assertThat(server.count("POST", "/jobs")).isEqualTo(1);
      assertThat(server.requests).allSatisfy(received -> {
        assertThat(received.authorization()).isEqualTo("Bearer " + TOKEN);
        assertThat(received.path()).doesNotStartWith("/api/");
        assertThat(received.cmaCookie()).isNull();
      });
      assertThat(verified.toString()).doesNotContain(TOKEN);
    }
  }

  @Test
  void healthAuthenticationFailureUsesBearerAndNeverSubmitsAProbeJob() throws Exception {
    try (QueueServer server = new QueueServer(received ->
        reply(401, Map.of("error", TOKEN + " private-health-response")))) {
      TrackingAdapterClient client = new TrackingAdapterClient(properties(server));
      assertThatThrownBy(client::localHealth)
          .isInstanceOfSatisfying(ApiException.class, error -> {
            assertThat(error.code()).isEqualTo("TRACKING_LOCAL_UNAUTHORIZED");
            assertThat(error.status()).isEqualTo(HttpStatus.BAD_GATEWAY);
            assertThat(error.getMessage()).doesNotContain(TOKEN, "private-health-response");
          });
      assertThat(server.requests).singleElement().satisfies(received -> {
        assertThat(received.method()).isEqualTo("GET");
        assertThat(received.path()).isEqualTo("/health");
        assertThat(received.authorization()).isEqualTo("Bearer " + TOKEN);
      });
      assertThat(server.count("POST", "/jobs")).isZero();
    }
  }

  @Test
  void failedCanaryMarksConnectedServiceDegradedWithoutPublishingAuthenticationClaims() throws Exception {
    try (QueueServer server = new QueueServer(received -> {
      if (received.path().equals("/health")) {
        return reply(200, Map.of("ok", true, "chrome", Map.of("connected", true)));
      }
      if (received.path().equals("/jobs")) return accepted();
      if (received.path().equals("/jobs/" + JOB)) {
        return progress("completed_with_gaps", "COSCO", NUMBER, "human_required");
      }
      return reply(404, Map.of("error", "UNEXPECTED_PATH"));
    })) {
      ShipmentTrackingProperties properties = properties(server);
      properties.setLocalToken("");
      TrackingAdapterClient client = new TrackingAdapterClient(properties);
      assertCode(() -> client.localCanary(
          new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", NUMBER, true)), "TRACKING_HUMAN_REQUIRED");

      JsonNode health = client.localHealth();
      assertThat(health.path("status").asText()).isEqualTo("DEGRADED");
      assertThat(health.path("chromeConnected").asBoolean()).isTrue();
      assertThat(health.path("requiresCanary").asBoolean()).isTrue();
      assertThat(health.path("lastCanaryErrorCode").asText()).isEqualTo("TRACKING_HUMAN_REQUIRED");
      assertThat(health.path("lastVerifiedAt").isNull()).isTrue();
      assertThat(health.path("localTokenConfigured").asBoolean()).isFalse();
      assertThat(health.path("authenticationEnforced").asText()).isEqualTo("UNKNOWN");
      assertThat(server.count("GET", "/jobs/" + JOB + "/result")).isZero();
      assertThat(server.requests).allSatisfy(received -> assertThat(received.authorization()).isNull());
    }
  }

  private static QueueServer completedServer(String carrier, String reference, String status) throws IOException {
    return new QueueServer(received -> {
      if (received.path().equals("/jobs")) return accepted();
      if (received.path().equals("/jobs/" + JOB)) {
        // Keep item success independent of query.status so the result-level guard is also exercised.
        return progress("QUERY_COMPLETED".equalsIgnoreCase(status) ? "completed" : "completed_with_gaps",
            carrier, reference, "done");
      }
      if (received.path().endsWith("/cancel")) return reply(200, Map.of("status", "cancelled"));
      return reply(200, result(carrier, reference, status));
    });
  }

  private static ShipmentTrackingProperties properties(QueueServer server) {
    ShipmentTrackingProperties properties = new ShipmentTrackingProperties();
    properties.setAdapterMode(ShipmentTrackingProperties.AdapterMode.LOCAL_QUEUE);
    properties.setLocalBaseUrl(server.url());
    properties.setLocalToken(TOKEN);
    properties.setLocalJobTimeout(Duration.ofSeconds(5));
    properties.setLocalPollInterval(Duration.ofMillis(5));
    properties.setLocalRequestTimeout(Duration.ofSeconds(2));
    properties.setConnectTimeout(Duration.ofSeconds(1));
    properties.setAdapterBaseUrl(server.url());
    properties.setAdapterKey("legacy-adapter-test-key");
    return properties;
  }

  private static NormalizedTrackRequest request() {
    return new NormalizedTrackRequest("COSCO", "AUTO", "BOOKING", NUMBER);
  }

  private static Reply accepted() {
    // A server-returned URL must never be used as an unrestricted upstream URL.
    return reply(202, Map.of("job_id", JOB, "status", "queued", "total", 1,
        "result_url", "http://127.0.0.1:1/do-not-follow"));
  }

  private static Reply progress(String status) {
    String itemStatus = switch (status) {
      case "queued" -> "pending";
      case "running" -> "running";
      default -> "done";
    };
    return progress(status, "COSCO", NUMBER, itemStatus);
  }

  private static Reply progress(String status, String carrier, String reference, String itemStatus) {
    return reply(200, Map.of("id", JOB, "status", status,
        "progress", Map.of("done", 0, "failed", 0, "total", 1),
        "items", List.of(Map.of("carrier", carrier, "reference", reference, "status", itemStatus))));
  }

  private static ObjectNode result(String carrier, String reference, String status) {
    ObjectNode batch = JSON.createObjectNode();
    batch.put("schema", "tracking.v1");
    batch.put("generated_at", "2026-10-30T00:00:00Z");
    batch.putObject("batch").put("id", JOB);
    ObjectNode record = batch.putArray("shipments").addObject();
    record.put("schema", "tracking.v1");
    record.putObject("carrier").put("code", carrier).put("name", carrier);
    record.putObject("query").put("reference_input", reference)
        .put("reference_submitted", "9876543210").put("reference_type", "BILL_OF_LADING")
        .put("strategy", "BROWSER").put("status", status);
    ObjectNode shipment = record.putObject("shipment");
    shipment.put("bill_of_lading", reference);
    shipment.putObject("status").put("state", "IN_TRANSIT");
    shipment.putArray("containers").addObject().put("number", "CSNU1234567");
    shipment.putArray("events");
    return batch;
  }

  private static void assertCode(org.assertj.core.api.ThrowableAssert.ThrowingCallable operation, String code) {
    assertThatThrownBy(operation).isInstanceOfSatisfying(ApiException.class,
        error -> assertThat(error.code()).isEqualTo(code));
  }

  private static Reply reply(int status, Object body) {
    return new Reply(status, JSON.valueToTree(body));
  }

  private record Reply(int status, JsonNode body) {}

  private record Request(String method, String path, JsonNode body, String authorization,
                         String adapterKey, String cmaCookie) {}

  @FunctionalInterface
  private interface Handler {
    Reply handle(Request request) throws Exception;
  }

  private static final class QueueServer implements AutoCloseable {
    private final HttpServer server;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final List<Request> requests = new CopyOnWriteArrayList<>();
    private final AtomicReference<Throwable> handlerFailure = new AtomicReference<>();

    private QueueServer(Handler handler) throws IOException {
      server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      server.setExecutor(executor);
      server.createContext("/", exchange -> {
        try {
          byte[] input = exchange.getRequestBody().readAllBytes();
          Request received = new Request(exchange.getRequestMethod(), exchange.getRequestURI().getPath(),
              input.length == 0 ? JSON.createObjectNode() : JSON.readTree(input),
              exchange.getRequestHeaders().getFirst("Authorization"),
              exchange.getRequestHeaders().getFirst("X-Tracking-Adapter-Key"),
              exchange.getRequestHeaders().getFirst("X-CMA-Session-Cookie"));
          requests.add(received);
          send(exchange, handler.handle(received));
        } catch (Throwable error) {
          handlerFailure.compareAndSet(null, error);
          send(exchange, reply(500, Map.of("error", "TEST_HANDLER_FAILED")));
        } finally {
          exchange.close();
        }
      });
      server.start();
    }

    private String url() { return "http://127.0.0.1:" + server.getAddress().getPort(); }

    private long count(String method, String path) {
      return requests.stream().filter(received -> received.method().equals(method)
          && received.path().equals(path)).count();
    }

    private static void send(HttpExchange exchange, Reply reply) throws IOException {
      byte[] bytes = reply.body().toString().getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
      exchange.sendResponseHeaders(reply.status(), bytes.length);
      exchange.getResponseBody().write(bytes);
    }

    @Override
    public void close() {
      server.stop(0);
      executor.shutdownNow();
      assertThat(handlerFailure.get()).as("Unexpected simulated API handler failure").isNull();
    }
  }
}
