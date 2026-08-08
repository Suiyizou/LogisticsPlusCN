package com.cargoplanner.backend.shipment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ShipmentBatchTrackingResilienceTest {
  private ExecutorService executor;
  private ShipmentBatchTrackingService service;

  @AfterEach
  void tearDown() {
    if (service != null) service.shutdown();
    else if (executor != null) executor.shutdownNow();
  }

  @Test
  @SuppressWarnings("unchecked")
  void retryWaitDoesNotCountAsProcessedOrFailedBeforeRecoverable503Succeeds()
      throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    AtomicInteger attempts = new AtomicInteger();
    ObjectNode success = successfulResponse("shipment-after-retry");
    when(trackingService.track(any(), any())).thenAnswer(invocation -> {
      if (attempts.incrementAndGet() == 1) {
        throw new ApiException(
            HttpStatus.SERVICE_UNAVAILABLE,
            "COSCO_UPSTREAM_UNAVAILABLE",
            "Temporary COSCO outage"
        );
      }
      return success.deepCopy();
    });

    createService(trackingService, 0, 0, 120, 120);
    AuthenticatedUser user = businessUser(71L);
    String taskId = taskId(service.start(batch("COSU6502406170"), user));

    Map<String, Object> retrying = awaitItemStatus(taskId, user, "RETRY_WAIT", 2_000);
    List<Map<String, Object>> retryingItems =
        (List<Map<String, Object>>) retrying.get("items");
    assertEquals(0, retrying.get("processed"));
    assertEquals(0, retrying.get("failed"));
    assertEquals(1, retrying.get("pending"));
    assertEquals(1, retryingItems.get(0).get("attempts"));

    Map<String, Object> completed = awaitTerminal(taskId, user, 2_000);
    List<Map<String, Object>> completedItems =
        (List<Map<String, Object>>) completed.get("items");
    assertEquals("COMPLETED", completed.get("status"));
    assertEquals(1, completed.get("processed"));
    assertEquals(1, completed.get("succeeded"));
    assertEquals(0, completed.get("failed"));
    assertEquals("SUCCEEDED", completedItems.get(0).get("status"));
    assertEquals(2, completedItems.get(0).get("attempts"));
    verify(trackingService, times(2)).track(any(), any());
  }

  @Test
  @SuppressWarnings("unchecked")
  void exhaustedProxyPoolIsNotRetriedAgainByTheOuterBatchLayer() throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    when(trackingService.track(any(), any())).thenThrow(new ApiException(
        HttpStatus.GATEWAY_TIMEOUT,
        "COSCO_PROXY_POOL_EXHAUSTED",
        "COSCO query timed out after trying 3 proxy exits"
    ));

    createService(trackingService, 0, 0, 5, 5);
    AuthenticatedUser user = businessUser(76L);
    ShipmentBatchTaskRequest request = new ShipmentBatchTaskRequest(
        "proxy-pool.xlsx",
        "PROXY",
        List.of(cosuItem("row-proxy", "COSU6502406177"))
    );
    String taskId = taskId(service.start(request, user));

    Map<String, Object> completed = awaitTerminal(taskId, user, 2_000);
    List<Map<String, Object>> items = (List<Map<String, Object>>) completed.get("items");
    assertEquals("COMPLETED", completed.get("status"));
    assertEquals(1, completed.get("failed"));
    assertEquals("FAILED", items.get(0).get("status"));
    assertEquals("COSCO_PROXY_POOL_EXHAUSTED", items.get(0).get("errorCode"));
    assertEquals(1, items.get(0).get("attempts"));
    verify(trackingService, times(1)).track(any(), any());
  }

  @Test
  @SuppressWarnings("unchecked")
  void explicitCancellationInterruptsLongRateLimitCooldownAndStopsQuickly()
      throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    when(trackingService.track(any(), any())).thenThrow(new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "COSCO_UPSTREAM_RATE_LIMITED",
        "COSCO rate limited this server",
        TimeUnit.MINUTES.toMillis(2)
    ));

    createService(trackingService, 0, 0, 250, 500);
    AuthenticatedUser user = businessUser(72L);
    String taskId = taskId(service.start(batch("COSU6502406171"), user));
    Map<String, Object> retrying = awaitItemStatus(taskId, user, "RETRY_WAIT", 2_000);
    assertEquals(0, retrying.get("processed"));
    assertEquals(0, retrying.get("failed"));
    assertTrue(retrying.get("cooldownUntil") != null || retrying.get("nextAttemptAt") != null);

    long cancelStartedAt = System.nanoTime();
    service.cancel(taskId, user);
    Map<String, Object> stopped = awaitTerminal(taskId, user, 1_000);
    long cancelElapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - cancelStartedAt);
    List<Map<String, Object>> stoppedItems =
        (List<Map<String, Object>>) stopped.get("items");

    assertEquals("STOPPED", stopped.get("status"));
    assertEquals(0, stopped.get("processed"));
    assertEquals(0, stopped.get("failed"));
    assertEquals(1, stopped.get("pending"));
    assertTrue(
        List.of("PENDING", "RETRY_WAIT").contains(stoppedItems.get(0).get("status")),
        "A cancelled cooldown item must remain unprocessed rather than fail"
    );
    assertTrue(cancelElapsedMs < 1_000, "Cancellation should wake the cooldown wait immediately");
    verify(trackingService, times(1)).track(any(), any());
  }

  @Test
  @SuppressWarnings("unchecked")
  void rateLimitCooldownAutomaticallyResumesTheSameShipment() throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    AtomicInteger attempts = new AtomicInteger();
    when(trackingService.track(any(), any())).thenAnswer(invocation -> {
      if (attempts.incrementAndGet() == 1) {
        throw new ApiException(
            HttpStatus.TOO_MANY_REQUESTS,
            "COSCO_UPSTREAM_RATE_LIMITED",
            "COSCO rate limited this server"
        );
      }
      return successfulResponse("shipment-after-rate-limit");
    });

    createService(trackingService, 0, 0, 20, 20);
    AuthenticatedUser user = businessUser(75L);
    String taskId = taskId(service.start(batch("COSU6502406176"), user));

    Map<String, Object> retrying = awaitItemStatus(taskId, user, "RETRY_WAIT", 2_000);
    assertEquals(0, retrying.get("processed"));
    assertTrue(retrying.get("cooldownUntil") != null || retrying.get("nextAttemptAt") != null);

    Map<String, Object> completed = awaitTerminal(taskId, user, 2_000);
    List<Map<String, Object>> items = (List<Map<String, Object>>) completed.get("items");
    assertEquals("COMPLETED", completed.get("status"));
    assertEquals("SUCCEEDED", items.get(0).get("status"));
    assertEquals(2, items.get(0).get("attempts"));
    verify(trackingService, times(2)).track(any(), any());
  }

  @Test
  void productionRateLimitCooldownIsFifteenMinutes() {
    assertEquals(
        TimeUnit.MINUTES.toMillis(15),
        ShipmentBatchTrackingService.RATE_LIMIT_COOLDOWN_MS
    );
  }

  @Test
  @SuppressWarnings("unchecked")
  void threeConsecutiveSupplementalUpstreamFailuresOpenTheBatchCircuit()
      throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    AtomicInteger shipmentSequence = new AtomicInteger();
    when(trackingService.track(any(), any())).thenAnswer(invocation ->
        successfulResponse("shipment-" + shipmentSequence.incrementAndGet())
    );
    ObjectNode blockedSupplemental = new ObjectMapper().createObjectNode();
    blockedSupplemental.putArray("warnings")
        .addObject()
        .put("source", "bookingInfo")
        .put("message", "COSCO proxy channel is not configured")
        .put("code", "COSCO_PROXY_NOT_CONFIGURED");
    blockedSupplemental.withArray("warnings")
        .addObject()
        .put("source", "containerInfo")
        .put("message", "COSCO proxy channel is not configured")
        .put("code", "COSCO_PROXY_NOT_CONFIGURED");
    when(trackingService.loadSupplementalDetails(any(), any(), any()))
        .thenReturn(blockedSupplemental);

    createService(trackingService, 0, 0, 5, 5);
    AuthenticatedUser user = businessUser(77L);
    List<ShipmentBatchItemRequest> items = List.of(
        cosuItem("refresh-1", "COSU6502406181"),
        cosuItem("refresh-2", "COSU6502406182"),
        cosuItem("refresh-3", "COSU6502406183"),
        cosuItem("refresh-4", "COSU6502406184"),
        cosuItem("refresh-5", "COSU6502406185")
    );
    String taskId = taskId(service.startRefreshAll(items, user, "AUTO"));

    Map<String, Object> paused = awaitTerminal(taskId, user, 2_000);
    List<Map<String, Object>> results =
        (List<Map<String, Object>>) paused.get("items");
    assertEquals("PAUSED", paused.get("status"));
    assertEquals("CIRCUIT_BREAKER", paused.get("stopReason"));
    assertEquals("COSCO_PROXY_NOT_CONFIGURED", paused.get("circuitErrorCode"));
    assertEquals(3, paused.get("circuitFailureCount"));
    assertEquals(ShipmentBatchTrackingService.BATCH_CIRCUIT_FAILURE_THRESHOLD,
        paused.get("circuitFailureThreshold"));
    assertEquals(3, paused.get("partial"));
    assertEquals(2, paused.get("pending"));
    assertEquals(
        List.of("PARTIAL", "PARTIAL", "PARTIAL", "PENDING", "PENDING"),
        results.stream().map(result -> String.valueOf(result.get("status"))).toList()
    );
    verify(trackingService, times(3)).track(any(), any());
    verify(trackingService, times(3)).loadSupplementalDetails(any(), any(), any());
  }

  @Test
  void successfulShipmentResetsTheBatchCircuitFailureStreak() throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    AtomicInteger shipmentSequence = new AtomicInteger();
    when(trackingService.track(any(), any())).thenAnswer(invocation ->
        successfulResponse("shipment-reset-" + shipmentSequence.incrementAndGet())
    );
    AtomicInteger supplementalSequence = new AtomicInteger();
    when(trackingService.loadSupplementalDetails(any(), any(), any())).thenAnswer(invocation -> {
      ObjectNode response = new ObjectMapper().createObjectNode();
      int position = supplementalSequence.incrementAndGet();
      if (position != 3 && position != 6) {
        response.putArray("warnings")
            .addObject()
            .put("source", "containerInfo")
            .put("message", "Temporary upstream block")
            .put("code", "COSCO_UPSTREAM_BLOCKED");
      } else {
        response.putArray("warnings");
      }
      return response;
    });

    createService(trackingService, 0, 0, 5, 5);
    AuthenticatedUser user = businessUser(78L);
    List<ShipmentBatchItemRequest> items = List.of(
        cosuItem("refresh-reset-1", "COSU6502406191"),
        cosuItem("refresh-reset-2", "COSU6502406192"),
        cosuItem("refresh-reset-3", "COSU6502406193"),
        cosuItem("refresh-reset-4", "COSU6502406194"),
        cosuItem("refresh-reset-5", "COSU6502406195"),
        cosuItem("refresh-reset-6", "COSU6502406196")
    );
    String taskId = taskId(service.startRefreshAll(items, user, "AUTO"));

    Map<String, Object> completed = awaitTerminal(taskId, user, 2_000);
    assertEquals("COMPLETED", completed.get("status"));
    assertEquals(4, completed.get("partial"));
    assertEquals(2, completed.get("succeeded"));
    assertEquals(0, completed.get("pending"));
    assertEquals(0, completed.get("circuitFailureCount"));
    verify(trackingService, times(6)).track(any(), any());
    verify(trackingService, times(6)).loadSupplementalDetails(any(), any(), any());
  }

  @Test
  @SuppressWarnings("unchecked")
  void invalid400IsNotRetriedAndDoesNotDelayTheNextShipment() throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    AtomicInteger calls = new AtomicInteger();
    when(trackingService.track(any(), any())).thenAnswer(invocation -> {
      if (calls.incrementAndGet() == 1) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TRACKING_NUMBER", "Invalid bill");
      }
      return successfulResponse("second-shipment");
    });

    createService(trackingService, 0, 0, 60_000, 60_000);
    AuthenticatedUser user = businessUser(73L);
    ShipmentBatchTaskRequest request = new ShipmentBatchTaskRequest(
        "invalid-then-valid.xlsx",
        List.of(cosuItem("row-1", "COSU6502406172"), cosuItem("row-2", "COSU6502406173"))
    );

    long startedAt = System.nanoTime();
    String taskId = taskId(service.start(request, user));
    Map<String, Object> completed = awaitTerminal(taskId, user, 2_000);
    long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
    List<Map<String, Object>> items = (List<Map<String, Object>>) completed.get("items");

    assertEquals("COMPLETED", completed.get("status"));
    assertEquals(1, completed.get("failed"));
    assertEquals(1, completed.get("succeeded"));
    assertEquals("FAILED", items.get(0).get("status"));
    assertEquals(1, items.get(0).get("attempts"));
    assertEquals("SUCCEEDED", items.get(1).get("status"));
    assertEquals(1, items.get(1).get("attempts"));
    assertTrue(elapsedMs < 1_000, "A non-retryable 400 must not enter the retry backoff");
    verify(trackingService, times(2)).track(any(), any());
  }

  @Test
  @SuppressWarnings("unchecked")
  void persistentProtectionPausesWithCurrentItemFailedAndReleasesTheUserTaskSlot()
      throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    when(trackingService.track(any(), any())).thenThrow(new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "COSCO_CHANNELS_UNAVAILABLE",
        "Both COSCO channels are protected"
    ));

    createService(trackingService, 0, 0, 5, 5);
    AuthenticatedUser user = businessUser(74L);
    String firstTaskId = taskId(service.start(batch("COSU6502406174"), user));
    Map<String, Object> paused = awaitTerminal(firstTaskId, user, 2_000);
    List<Map<String, Object>> items = (List<Map<String, Object>>) paused.get("items");

    assertEquals("PAUSED", paused.get("status"));
    assertEquals(1, paused.get("processed"));
    assertEquals(1, paused.get("failed"));
    assertEquals(0, paused.get("pending"));
    assertEquals("FAILED", items.get(0).get("status"));
    assertEquals("FAILED", items.get(0).get("mainStatus"));
    assertEquals(3, items.get(0).get("attempts"));
    verify(trackingService, times(3)).track(any(), any());

    String secondTaskId = taskId(service.start(batch("COSU6502406175"), user));
    assertTrue(!firstTaskId.equals(secondTaskId), "A paused task must release the active slot");
    service.cancel(secondTaskId, user);
  }

  @Test
  void explicitRetryAfterCanExceedTheExponentialBackoffCap() {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    createService(trackingService, 0, 0, 10, 10);
    ApiException limited = new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "COSCO_UPSTREAM_RATE_LIMITED",
        "Retry later",
        45_000L
    );

    assertEquals(45_000L, service.retryDelayMs(limited, 1));
  }

  private void createService(
      ShipmentTrackingService trackingService,
      long minIntervalMs,
      long maxIntervalMs,
      long retryBaseMs,
      long retryMaxMs
  ) {
    executor = Executors.newSingleThreadExecutor();
    service = new ShipmentBatchTrackingService(
        trackingService,
        executor,
        minIntervalMs,
        maxIntervalMs,
        retryBaseMs,
        retryMaxMs,
        Clock.systemUTC()
    );
  }

  private ShipmentBatchTaskRequest batch(String number) {
    return new ShipmentBatchTaskRequest("resilience.xlsx", List.of(cosuItem("row-1", number)));
  }

  private ShipmentBatchItemRequest cosuItem(String id, String number) {
    ShipmentImportDetails details = new ShipmentImportDetails(
        "COSU", number, null, null, null, null, null, null, null, null, null
    );
    return new ShipmentBatchItemRequest(
        id,
        "COSCO",
        "BOOKING",
        number,
        number,
        false,
        details
    );
  }

  private ObjectNode successfulResponse(String shipmentId) {
    ObjectNode response = new ObjectMapper().createObjectNode();
    response.put("shipmentId", shipmentId);
    response.put("cacheSource", "LIVE");
    return response;
  }

  private AuthenticatedUser businessUser(long id) {
    return new AuthenticatedUser(
        id,
        "operator-" + id,
        "Operator " + id,
        "BUSINESS",
        "ACTIVE",
        "OVERSEA_AGENT"
    );
  }

  private String taskId(Map<String, Object> task) {
    return (String) task.get("taskId");
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> awaitItemStatus(
      String taskId,
      AuthenticatedUser user,
      String expectedStatus,
      long timeoutMs
  ) throws InterruptedException {
    long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
    Map<String, Object> status;
    do {
      status = service.status(taskId, user);
      List<Map<String, Object>> items = (List<Map<String, Object>>) status.get("items");
      if (expectedStatus.equals(items.get(0).get("status"))) return status;
      Thread.sleep(2);
    } while (System.nanoTime() < deadline);
    return service.status(taskId, user);
  }

  private Map<String, Object> awaitTerminal(
      String taskId,
      AuthenticatedUser user,
      long timeoutMs
  ) throws InterruptedException {
    long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
    Map<String, Object> status;
    do {
      status = service.status(taskId, user);
      if (List.of("COMPLETED", "STOPPED", "PAUSED").contains(status.get("status"))) return status;
      Thread.sleep(2);
    } while (System.nanoTime() < deadline);
    return service.status(taskId, user);
  }
}
