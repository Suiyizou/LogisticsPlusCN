package com.cargoplanner.backend.shipment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class ShipmentBatchTrackingServiceTest {
  private ExecutorService executor;
  private ShipmentBatchTrackingService service;

  @AfterEach
  void tearDown() {
    if (service != null) service.shutdown();
    else if (executor != null) executor.shutdownNow();
  }

  @Test
  void tracksOnlyCosuRowsWithThePrefixRemovedAndStoresOtherRowsForManualEntry()
      throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    ObjectMapper objectMapper = new ObjectMapper();
    ObjectNode tracked = objectMapper.createObjectNode();
    tracked.put("shipmentId", "tracked-shipment");
    tracked.put("cacheSource", "LIVE");
    when(trackingService.track(any(), any())).thenReturn(tracked);
    ObjectNode manual = objectMapper.createObjectNode();
    manual.put("shipmentId", "manual-shipment");
    manual.put("cacheSource", "IMPORTED_PLACEHOLDER");
    when(trackingService.recordImportedPlaceholder(any(), any())).thenReturn(manual);

    executor = Executors.newSingleThreadExecutor();
    service = new ShipmentBatchTrackingService(
        trackingService,
        executor,
        0,
        0,
        Clock.systemUTC()
    );
    AuthenticatedUser user = new AuthenticatedUser(
        7L, "operator", "Operator", "BUSINESS", "ACTIVE", "OVERSEA_AGENT"
    );
    ShipmentImportDetails cosuDetails = new ShipmentImportDetails(
        "COSU", "COSU6502406170", "JSH2606003", null, null, null,
        null, null, null, null, "Hayden US"
    );
    ShipmentImportDetails manualDetails = new ShipmentImportDetails(
        "SMLM", "SMLMSHZY5B667700", "JSH2606018", null, null, null,
        null, null, null, null, "Hayden US"
    );
    Map<String, Object> started = service.start(
        new ShipmentBatchTaskRequest(
            "HAYDEN-TRACKING INFORMATION.xlsx",
            List.of(
                new ShipmentBatchItemRequest(
                    "cosu-row", "COSCO", "BILLOFLADING", "123456",
                    "COSU6502406170", false, cosuDetails
                ),
                new ShipmentBatchItemRequest(
                    "manual-row", null, "BILLOFLADING", "SHZY5B667700",
                    "SMLMSHZY5B667700", true, manualDetails
                )
            )
        ),
        user
    );

    Map<String, Object> completed = awaitTerminal((String) started.get("taskId"), user);
    assertEquals("COMPLETED", completed.get("status"));
    assertEquals(1, completed.get("succeeded"));
    assertEquals(1, completed.get("manual"));
    assertEquals(0, completed.get("failed"));

    ArgumentCaptor<ShipmentTrackRequest> requestCaptor =
        ArgumentCaptor.forClass(ShipmentTrackRequest.class);
    verify(trackingService).track(requestCaptor.capture(), any());
    assertEquals("6502406170", requestCaptor.getValue().number());
    assertTrue(requestCaptor.getValue().batchTaskId().startsWith("batch_"));
    verify(trackingService).recordImportedPlaceholder(any(), any());
  }

  @Test
  void rejectsConflictingExplicitCosuNumbersBeforeStartingCarrierWork() {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    executor = Executors.newSingleThreadExecutor();
    service = new ShipmentBatchTrackingService(
        trackingService, executor, 0, 0, Clock.systemUTC()
    );
    AuthenticatedUser user = new AuthenticatedUser(
        9L, "operator-3", "Operator 3", "BUSINESS", "ACTIVE", "OVERSEA_AGENT"
    );
    ShipmentImportDetails details = new ShipmentImportDetails(
        "COSU", "COSU6502406170", null, null, null, null,
        null, null, null, null, "Hayden US"
    );

    assertThrows(
        com.cargoplanner.backend.common.ApiException.class,
        () -> service.start(
            new ShipmentBatchTaskRequest(
                "conflicting.xlsx",
                List.of(new ShipmentBatchItemRequest(
                    "row-1", "COSCO", "BILLOFLADING", "COSU6502406172",
                    "COSU6502406171", false, details
                ))
            ),
            user
        )
    );
    verify(trackingService, times(0)).track(any(), any());
  }

  @Test
  @SuppressWarnings("unchecked")
  void neverStartsPerContainerSubtasksAfterTheMainShipmentSucceeds()
      throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    ObjectMapper objectMapper = new ObjectMapper();
    ObjectNode tracked = (ObjectNode) objectMapper.readTree("""
        {
          "shipmentId": "tracked-shipment",
          "cacheSource": "LIVE",
          "snapshot": {
            "summary": {"containers": [{"containerType": "40HQ", "quantity": 2}]},
            "containers": []
          }
        }
        """);
    when(trackingService.track(any(), any())).thenReturn(tracked);
    when(trackingService.discoverBatchContainers(any(), any(), any(), any()))
        .thenReturn((ObjectNode) objectMapper.readTree("""
            {
              "containers": [
                {"number": "CSNU1234567", "needsEnrichment": false},
                {"number": "OOLU7654321", "needsEnrichment": true}
              ]
            }
            """));
    when(trackingService.enrichBatchContainer(any(), any(), any(), any()))
        .thenReturn((ObjectNode) objectMapper.readTree("""
            {"cacheSource": "LIVE", "snapshot": {"containers": [{"number": "OOLU7654321"}]}}
            """));

    executor = Executors.newSingleThreadExecutor();
    service = new ShipmentBatchTrackingService(
        trackingService, executor, 0, 0, Clock.systemUTC()
    );
    AuthenticatedUser user = new AuthenticatedUser(
        11L, "operator-children", "Operator Children", "BUSINESS", "ACTIVE", "OVERSEA_AGENT"
    );
    ShipmentImportDetails details = new ShipmentImportDetails(
        "COSU", "COSU6502406170", null, null, null, null,
        null, null, null, null, "Hayden US"
    );

    Map<String, Object> started = service.start(
        new ShipmentBatchTaskRequest(
            "containers.xlsx",
            List.of(new ShipmentBatchItemRequest(
                "row-containers", "COSCO", "BILLOFLADING", "6502406170",
                "COSU6502406170", false, details
            ))
        ),
        user
    );

    Map<String, Object> completed = awaitTerminal((String) started.get("taskId"), user);
    List<Map<String, Object>> items = (List<Map<String, Object>>) completed.get("items");
    List<Map<String, Object>> subtasks =
        (List<Map<String, Object>>) items.get(0).get("subtasks");
    assertEquals("COMPLETED", completed.get("status"));
    assertEquals("SUCCEEDED", items.get(0).get("status"));
    assertEquals(List.of(), subtasks);
    verify(trackingService, times(0)).discoverBatchContainers(any(), any(), any(), any());
    verify(trackingService, times(0)).enrichBatchContainer(any(), any(), any(), any());
  }

  @Test
  void processesEveryMainShipmentWithoutStartingAContainerPass()
      throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    ObjectMapper objectMapper = new ObjectMapper();
    List<String> sequence = new java.util.concurrent.CopyOnWriteArrayList<>();
    when(trackingService.track(any(), any())).thenAnswer(invocation -> {
      ShipmentTrackRequest request = invocation.getArgument(0);
      sequence.add("core:" + request.number());
      ObjectNode response = objectMapper.createObjectNode();
      response.put("shipmentId", "shipment-" + request.number());
      response.put("cacheSource", "LIVE");
      response.putObject("snapshot").putObject("summary").putArray("containers");
      return response;
    });
    when(trackingService.discoverBatchContainers(any(), any(), any(), any()))
        .thenAnswer(invocation -> {
          sequence.add("containers:" + invocation.getArgument(1, String.class));
          ObjectNode response = objectMapper.createObjectNode();
          response.putArray("containers");
          return response;
        });

    executor = Executors.newSingleThreadExecutor();
    service = new ShipmentBatchTrackingService(
        trackingService, executor, 0, 0, Clock.systemUTC()
    );
    AuthenticatedUser user = new AuthenticatedUser(
        12L, "operator-order", "Operator Order", "BUSINESS", "ACTIVE", "OVERSEA_AGENT"
    );
    ShipmentImportDetails first = new ShipmentImportDetails(
        "COSU", "COSU6502406170", null, null, null, null,
        null, null, null, null, null
    );
    ShipmentImportDetails second = new ShipmentImportDetails(
        "COSU", "COSU6502406171", null, null, null, null,
        null, null, null, null, null
    );

    Map<String, Object> started = service.start(
        new ShipmentBatchTaskRequest(
            "order.xlsx",
            List.of(
                new ShipmentBatchItemRequest(
                    "row-1", "COSCO", "BILLOFLADING", "6502406170",
                    "COSU6502406170", false, first
                ),
                new ShipmentBatchItemRequest(
                    "row-2", "COSCO", "BILLOFLADING", "6502406171",
                    "COSU6502406171", false, second
                )
            )
        ),
        user
    );

    awaitTerminal((String) started.get("taskId"), user);
    assertEquals(List.of(
        "core:6502406170",
        "core:6502406171"
    ), sequence);
  }

  @Test
  @SuppressWarnings("unchecked")
  void oneClickRefreshUsesBookingTypeAndForcesLiveRefresh() throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    ObjectNode tracked = new ObjectMapper().createObjectNode();
    tracked.put("shipmentId", "existing-shipment");
    tracked.put("cacheSource", "LIVE");
    when(trackingService.track(any(), any())).thenReturn(tracked);
    ObjectNode supplemental = new ObjectMapper().createObjectNode();
    supplemental.putArray("containers");
    supplemental.putObject("references");
    supplemental.putArray("warnings");
    when(trackingService.loadSupplementalDetails(any(), any(), any()))
        .thenReturn(supplemental);

    executor = Executors.newSingleThreadExecutor();
    service = new ShipmentBatchTrackingService(
        trackingService, executor, 0, 0, Clock.systemUTC()
    );
    AuthenticatedUser user = new AuthenticatedUser(
        14L, "operator-refresh", "Operator Refresh", "BUSINESS", "ACTIVE", "OVERSEA_AGENT"
    );

    Map<String, Object> started = service.startRefreshAll(
        List.of(new ShipmentBatchItemRequest(
            "refresh-existing", "COSCO", "BOOKING", "6507943350",
            "6507943350", false, null
        )),
        user,
        "PROXY"
    );

    Map<String, Object> completed = awaitTerminal((String) started.get("taskId"), user);
    assertEquals("COMPLETED", completed.get("status"));
    assertEquals("REFRESH_ALL", completed.get("mode"));
    assertEquals("PROXY", completed.get("channel"));
    List<Map<String, Object>> completedItems =
        (List<Map<String, Object>>) completed.get("items");
    assertEquals(2, completedItems.get(0).get("subtaskTotal"));
    assertEquals(2L, completedItems.get(0).get("subtaskProcessed"));
    ArgumentCaptor<ShipmentTrackRequest> requestCaptor =
        ArgumentCaptor.forClass(ShipmentTrackRequest.class);
    verify(trackingService).track(requestCaptor.capture(), any());
    ShipmentTrackRequest request = requestCaptor.getValue();
    assertEquals("BOOKING", request.type());
    assertEquals("6507943350", request.number());
    assertEquals("PROXY", request.channel());
    assertEquals(Boolean.TRUE, request.forceRefresh());
    ArgumentCaptor<ShipmentTrackRequest> supplementalRequestCaptor =
        ArgumentCaptor.forClass(ShipmentTrackRequest.class);
    verify(trackingService).loadSupplementalDetails(
        any(), supplementalRequestCaptor.capture(), any()
    );
    assertEquals("PROXY", supplementalRequestCaptor.getValue().channel());
  }

  @Test
  @SuppressWarnings("unchecked")
  void keepsTwentyContainerOverviewWithoutStartingIndividualQueries()
      throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    ObjectNode tracked = (ObjectNode) new ObjectMapper().readTree("""
        {
          "shipmentId": "tracked-shipment",
          "cacheSource": "MYSQL",
          "snapshot": {
            "summary": {"containers": [{"containerType": "40HQ", "quantity": 20}]}
          }
        }
        """);
    when(trackingService.track(any(), any())).thenReturn(tracked);

    executor = Executors.newSingleThreadExecutor();
    service = new ShipmentBatchTrackingService(
        trackingService, executor, 0, 0, Clock.systemUTC()
    );
    AuthenticatedUser user = new AuthenticatedUser(
        13L, "operator-summary", "Operator Summary", "BUSINESS", "ACTIVE", "OVERSEA_AGENT"
    );
    ShipmentImportDetails details = new ShipmentImportDetails(
        "COSU", "COSU6502406170", null, null, null, null,
        null, null, null, null, null
    );

    Map<String, Object> started = service.start(
        new ShipmentBatchTaskRequest(
            "summary-only.xlsx",
            List.of(new ShipmentBatchItemRequest(
                "row-summary", "COSCO", "BILLOFLADING", "6502406170",
                "COSU6502406170", false, details
            ))
        ),
        user
    );

    Map<String, Object> completed = awaitTerminal((String) started.get("taskId"), user);
    List<Map<String, Object>> items = (List<Map<String, Object>>) completed.get("items");
    assertEquals("COMPLETED", completed.get("status"));
    assertEquals("SUCCEEDED", items.get(0).get("status"));
    assertEquals(List.of(), items.get(0).get("subtasks"));
    verify(trackingService, times(0)).discoverBatchContainers(any(), any(), any(), any());
    verify(trackingService, times(0)).enrichBatchContainer(any(), any(), any(), any());
  }

  @Test
  @SuppressWarnings("unchecked")
  void cancellingDuringTheNextQueryWindowLeavesTheUnqueriedRowPending()
      throws Exception {
    ShipmentTrackingService trackingService = mock(ShipmentTrackingService.class);
    ObjectNode tracked = new ObjectMapper().createObjectNode();
    tracked.put("shipmentId", "tracked-shipment");
    tracked.put("cacheSource", "LIVE");
    CountDownLatch firstStarted = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);
    AtomicInteger calls = new AtomicInteger();
    when(trackingService.track(any(), any())).thenAnswer(invocation -> {
      if (calls.incrementAndGet() == 1) {
        firstStarted.countDown();
        assertTrue(releaseFirst.await(2, TimeUnit.SECONDS));
      }
      return tracked.deepCopy();
    });

    executor = Executors.newSingleThreadExecutor();
    service = new ShipmentBatchTrackingService(
        trackingService,
        executor,
        60_000,
        60_000,
        Clock.systemUTC()
    );
    AuthenticatedUser user = new AuthenticatedUser(
        8L, "operator-2", "Operator 2", "BUSINESS", "ACTIVE", "OVERSEA_AGENT"
    );
    ShipmentImportDetails firstDetails = new ShipmentImportDetails(
        "COSU", "COSU6502406170", null, null, null, null,
        null, null, null, null, "Hayden US"
    );
    ShipmentImportDetails secondDetails = new ShipmentImportDetails(
        "COSU", "COSU6502406171", null, null, null, null,
        null, null, null, null, "Hayden US"
    );
    Map<String, Object> started = service.start(
        new ShipmentBatchTaskRequest(
            "HAYDEN-TRACKING INFORMATION.xlsx",
            List.of(
                new ShipmentBatchItemRequest(
                    "row-1", "COSCO", "BILLOFLADING", "6502406170",
                    "COSU6502406170", false, firstDetails
                ),
                new ShipmentBatchItemRequest(
                    "row-2", "COSCO", "BILLOFLADING", "6502406171",
                    "COSU6502406171", false, secondDetails
                )
            )
        ),
        user
    );
    String taskId = (String) started.get("taskId");
    assertTrue(firstStarted.await(2, TimeUnit.SECONDS));
    releaseFirst.countDown();

    long deadline = System.currentTimeMillis() + 2_000;
    Map<String, Object> running;
    do {
      running = service.status(taskId, user);
      List<Map<String, Object>> items = (List<Map<String, Object>>) running.get("items");
      if ("RUNNING".equals(items.get(1).get("status"))) break;
      Thread.sleep(10);
    } while (System.currentTimeMillis() < deadline);
    List<Map<String, Object>> runningItems =
        (List<Map<String, Object>>) running.get("items");
    assertEquals("RUNNING", runningItems.get(1).get("status"));

    service.cancel(taskId, user);
    Map<String, Object> stopped = awaitTerminal(taskId, user);
    List<Map<String, Object>> stoppedItems =
        (List<Map<String, Object>>) stopped.get("items");
    assertEquals("STOPPED", stopped.get("status"));
    assertEquals(1, stopped.get("processed"));
    assertEquals(1, stopped.get("pending"));
    assertEquals("SUCCEEDED", stoppedItems.get(0).get("status"));
    assertEquals("PENDING", stoppedItems.get(1).get("status"));
    verify(trackingService, times(1)).track(any(), any());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> awaitTerminal(String taskId, AuthenticatedUser user)
      throws InterruptedException {
    long deadline = System.currentTimeMillis() + 2_000;
    Map<String, Object> status;
    do {
      status = service.status(taskId, user);
      if (List.of("COMPLETED", "STOPPED").contains(status.get("status"))) return status;
      Thread.sleep(10);
    } while (System.currentTimeMillis() < deadline);
    return service.status(taskId, user);
  }
}
