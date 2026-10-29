package com.cargoplanner.backend.shipment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ShipmentBatchQueryOnlyTest {
  private final ShipmentTrackingService tracking = mock(ShipmentTrackingService.class);
  private final TrackingAdapterClient adapter = mock(TrackingAdapterClient.class);
  private final AuthenticatedUser user = new AuthenticatedUser(7, "query", "Query", "BUSINESS", "ACTIVE");
  private final ShipmentBatchTrackingService service = new ShipmentBatchTrackingService(
      tracking, adapter, Executors.newSingleThreadExecutor(), Clock.systemUTC());

  @AfterEach
  void close() { service.shutdown(); }

  private ShipmentBatchItemRequest row(String id, String carrier, String number) {
    return new ShipmentBatchItemRequest(id, carrier, "BOOKING", number, number, false, null);
  }

  private ShipmentBatchTaskRequest request(List<ShipmentBatchItemRequest> rows) {
    return new ShipmentBatchTaskRequest("synthetic.xlsx", "AUTO", rows, null, null, "QUERY_ONLY");
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> items(Map<String, Object> task) {
    return (List<Map<String, Object>>) task.get("items");
  }

  private Map<String, Object> finished(String id) throws Exception {
    for (int i = 0; i < 200; i++) {
      Map<String, Object> task = service.status(id, user);
      if (List.of("COMPLETED", "STOPPED", "PAUSED").contains(task.get("status"))) return task;
      Thread.sleep(10);
    }
    throw new AssertionError("Task did not finish");
  }

  @Test
  void mixedRowsReturnCompletePayloadWithoutShipmentWritesAndReadsCreateNoJobs() throws Exception {
    when(tracking.usesLocalTrackingQueue()).thenReturn(true);
    JsonNode payload = new ObjectMapper().readTree("{\"snapshot\":{\"provider\":{\"code\":\"COSCO\"},\"containers\":[]}}");
    when(adapter.track(any())).thenAnswer(invocation -> {
      TrackingAdapterClient.NormalizedTrackRequest r = invocation.getArgument(0);
      if (r.number().equals("FAIL1234")) throw new ApiException(HttpStatus.BAD_GATEWAY, "SOURCE_FAILURE", "Carrier unavailable");
      return payload;
    });
    ShipmentBatchItemRequest conflict = new ShipmentBatchItemRequest("conflict", "COSCO", "BOOKING",
        "VALID123", "VALID123", false, null, "REFERENCE_CONFLICT", "Conflicting carrier", 8, "SOURCE123");
    Map<String, Object> created = new ShipmentBatchTrackingController(service).start(request(Arrays.asList(
        row("good", "COSCO", "GOOD1234"), null, row("unknown", null, "UNKNOWN1"),
        row("failed", "COSCO", "FAIL1234"), conflict, row("also-good", "HMM", "GOOD2345"))), user).getBody();
    assertNotNull(created);
    String id = (String) created.get("taskId");
    Map<String, Object> task = finished(id);
    assertEquals("QUERY_ONLY", task.get("mode"));
    assertEquals(2, task.get("succeeded"));
    assertEquals(4, task.get("failed"));
    assertEquals(null, task.get("customerId"));
    assertEquals(false, task.get("publishToCustomer"));
    assertEquals(payload, items(task).get(0).get("payload"));
    assertEquals(null, items(task).get(0).get("shipmentId"));
    assertEquals("REFERENCE_CONFLICT", items(task).get(4).get("errorCode"));
    assertEquals(8, items(task).get(4).get("sourceRow"));
    service.status(id, user);
    service.status(id, user);
    service.cancel(id, user);
    verify(adapter, times(3)).track(any());
    verify(tracking, never()).track(any(), any());
    verify(tracking, never()).recordImportedPlaceholder(any(), any());
    verify(tracking, never()).recordRefreshOutcome(any(), any(), any(), any(), anyInt(), anyInt());
  }

  @Test
  void limitsAndOwnershipRetainExistingTaskSecurity() throws Exception {
    assertThrows(ApiException.class, () -> service.start(request(Collections.nCopies(61,
        row("a", "COSCO", "GOOD1234"))), user));
    AuthenticatedUser customer = new AuthenticatedUser(9, "customer", "Customer", "CUSTOMER", "ACTIVE");
    assertThrows(ApiException.class, () -> service.start(request(List.of(row("a", "COSCO", "GOOD1234"))), customer));
    Map<String, Object> task = service.start(request(List.of(row("bad", null, "BAD1234"))), user);
    String id = (String) task.get("taskId");
    finished(id);
    AuthenticatedUser other = new AuthenticatedUser(8, "other", "Other", "BUSINESS", "ACTIVE");
    assertThrows(ApiException.class, () -> service.status(id, other));
    assertThrows(ApiException.class, () -> service.cancel(id, other));
    verify(adapter, never()).track(any());
  }

  @Test
  void cancelDoesNotStartRemainingRowsOrCreateExtraJobs() throws Exception {
    CountDownLatch started = new CountDownLatch(1), release = new CountDownLatch(1);
    when(tracking.usesLocalTrackingQueue()).thenReturn(true);
    when(adapter.track(any())).thenAnswer(invocation -> {
      started.countDown();
      if (!release.await(2, TimeUnit.SECONDS)) throw new AssertionError("Release timeout");
      return new ObjectMapper().readTree("{\"snapshot\":{}}");
    });
    Map<String, Object> task = service.start(request(List.of(row("a", "COSCO", "GOOD1234"),
        row("b", "COSCO", "GOOD2345"))), user);
    String id = (String) task.get("taskId");
    org.junit.jupiter.api.Assertions.assertTrue(started.await(2, TimeUnit.SECONDS));
    service.cancel(id, user);
    service.status(id, user);
    release.countDown();
    assertEquals("STOPPED", finished(id).get("status"));
    verify(adapter, times(1)).track(any());
    verify(tracking, never()).track(any(), any());
  }
}
