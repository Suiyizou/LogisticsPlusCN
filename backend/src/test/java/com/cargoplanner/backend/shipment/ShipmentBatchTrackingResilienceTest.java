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
        "BILLOFLADING",
        number.substring(4),
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
      if (List.of("COMPLETED", "STOPPED").contains(status.get("status"))) return status;
      Thread.sleep(2);
    } while (System.nanoTime() < deadline);
    return service.status(taskId, user);
  }
}
