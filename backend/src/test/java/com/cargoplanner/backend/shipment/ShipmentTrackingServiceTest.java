package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import com.cargoplanner.backend.shipment.CmaTrackingSessionService.CmaSessionCredentials;
import com.cargoplanner.backend.shipment.TrackingAdapterClient.NormalizedTrackRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.support.TransactionTemplate;

class ShipmentTrackingServiceTest {
  private JdbcTemplate jdbcTemplate;
  private TrackingAdapterClient adapterClient;
  private CmaTrackingSessionService cmaTrackingSessionService;
  private ObjectMapper objectMapper;
  private ShipmentTrackingService service;
  private AuthenticatedUser employee;
  private AuthenticatedUser business;

  @BeforeEach
  void setUp() throws Exception {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1",
        "sa",
        ""
    );
    jdbcTemplate = new JdbcTemplate(dataSource);
    createSchema();
    jdbcTemplate.update(
        "INSERT INTO cp_users (id, display_name, role) VALUES (1, 'Customer One', 'EMPLOYEE')"
    );
    jdbcTemplate.update(
        "INSERT INTO cp_users (id, display_name, role) VALUES (2, 'Business One', 'BUSINESS')"
    );

    objectMapper = new ObjectMapper();
    adapterClient = mock(TrackingAdapterClient.class);
    cmaTrackingSessionService = mock(CmaTrackingSessionService.class);
    JsonNode adapterResponse = objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:00:00Z",
            "tracking": {"type": "BOOKING", "number": "BK-10001"},
            "summary": {
              "billOfLading": "BL-90001",
              "bookingNumbers": ["BK-10001"],
              "latestEvent": {"name": "Loaded on board"}
            },
            "containers": [{"number": "CSNU1234567"}]
          },
          "strategy": {"requested": "AUTO", "used": "NETWORK"},
          "cached": false
        }
        """);
    when(adapterClient.track(new NormalizedTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001")))
        .thenReturn(adapterResponse);

    ShipmentTrackingProperties properties = new ShipmentTrackingProperties();
    properties.setCacheTtl(Duration.ofMinutes(15));
    ShipmentAccessService accessService = new ShipmentAccessService(jdbcTemplate);
    service = new ShipmentTrackingService(
        jdbcTemplate,
        objectMapper,
        adapterClient,
        cmaTrackingSessionService,
        accessService,
        properties,
        new TransactionTemplate(new DataSourceTransactionManager(dataSource)),
        Clock.fixed(Instant.parse("2026-07-16T10:01:00Z"), ZoneOffset.UTC)
    );
    employee = new AuthenticatedUser(1, "customer", "Customer One", "EMPLOYEE", "ACTIVE");
    business = new AuthenticatedUser(2, "business", "Business One", "BUSINESS", "ACTIVE");
  }

  @Test
  void marksTheProductionConstructorForSpringInjection() {
    var autowiredConstructors = Arrays.stream(ShipmentTrackingService.class.getDeclaredConstructors())
        .filter(constructor -> constructor.isAnnotationPresent(Autowired.class))
        .toList();

    assertThat(autowiredConstructors).singleElement()
        .satisfies(constructor -> assertThat(constructor.getParameterCount()).isEqualTo(8));
  }

  @Test
  void routesCmaThroughPlaywrightWithTheEncryptedServerSession() throws Exception {
    CmaSessionCredentials credentials = new CmaSessionCredentials(
        "datadome=server-secret",
        "Mozilla/5.0 Test"
    );
    NormalizedTrackRequest normalized = new NormalizedTrackRequest(
        "CMA",
        "PLAYWRIGHT",
        "BOOKING",
        "TJN0940917"
    );
    JsonNode adapterResponse = new ObjectMapper().readTree("""
        {
          "snapshot": {
            "provider": {"code": "CMA"},
            "channel": "PLAYWRIGHT",
            "fetchedAt": "2026-07-16T10:00:00Z",
            "tracking": {"type": "BOOKING", "number": "TJN0940917"},
            "summary": {"bookingNumbers": ["TJN0940917"], "latestEvent": {"name": "Loaded"}},
            "containers": [{"number": "TRHU8582015"}]
          },
          "strategy": {"requested": "PLAYWRIGHT", "used": "PLAYWRIGHT"},
          "cached": false
        }
        """);
    when(cmaTrackingSessionService.requireCredentials()).thenReturn(credentials);
    when(adapterClient.track(normalized, credentials)).thenReturn(adapterResponse);

    ObjectNode response = service.track(
        new ShipmentTrackRequest("CMA", "AUTO", "BOOKING", "TJN0940917", false),
        employee
    );

    assertThat(response.path("snapshot").path("provider").path("code").asText()).isEqualTo("CMA");
    assertThat(response.path("snapshot").path("channel").asText()).isEqualTo("PLAYWRIGHT");
    verify(cmaTrackingSessionService).requireCredentials();
    verify(adapterClient).track(normalized, credentials);
  }

  @Test
  void persistsAliasesAndUsesMysqlCacheForLaterReferenceQueries() {
    ObjectNode first = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "bk-10001", false),
        employee
    );
    String shipmentId = first.path("shipmentId").asText();

    assertThat(first.path("cacheSource").asText()).isEqualTo("LIVE");
    assertThat(shipmentId).isNotBlank();
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_shipments", Integer.class)).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_tracking_snapshots", Integer.class)).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_shipment_references", Integer.class)).isEqualTo(2);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_references WHERE reference_type = 'CONTAINER'",
        Integer.class
    )).isZero();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_participants",
        Integer.class
    )).isZero();
    assertThat(first.path("fileAccess").asBoolean()).isFalse();

    ObjectNode second = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BILLOFLADING", "BL-90001", false),
        employee
    );

    assertThat(second.path("shipmentId").asText()).isEqualTo(shipmentId);
    assertThat(second.path("cacheSource").asText()).isEqualTo("MYSQL");
    assertThat(second.path("cached").asBoolean()).isTrue();
    verify(adapterClient, times(1))
        .track(new NormalizedTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001"));
  }

  @Test
  void batchSpreadsheetDetailsMergeIntoMysqlWithoutAnotherCarrierRequest() {
    ObjectNode first = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        business
    );
    ShipmentImportDetails imported = new ShipmentImportDetails(
        null, "BL-90001", "JOB-100", null, "SHA", "LAX",
        "PO-100", "2026-07-20", "2026-08-02", "1*40HC", null
    );

    ObjectNode cached = service.track(
        new ShipmentTrackRequest(
            "COSCO", "AUTO", "BILLOFLADING", "BL-90001", false, imported
        ),
        business
    );

    assertThat(cached.path("shipmentId").asText()).isEqualTo(first.path("shipmentId").asText());
    assertThat(cached.path("cacheSource").asText()).isEqualTo("MYSQL");
    assertThat(cached.path("snapshot").path("references").path("business")
        .path("forwarderJobNumber").asText()).isEqualTo("JOB-100");
    assertThat(cached.path("snapshot").path("route")).hasSize(2);
    verify(adapterClient, times(1))
        .track(new NormalizedTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001"));
  }

  @Test
  void stripsCosuForTheAdapterAndPersistsMissingSpreadsheetDetails() throws Exception {
    jdbcTemplate.update(
        "INSERT INTO cp_customers (created_by, status, client_code, party_role) VALUES (2, 'ACTIVE', 'FILE-CODE', 'SHIPPER')"
    );
    NormalizedTrackRequest normalized = new NormalizedTrackRequest(
        "COSCO",
        "AUTO",
        "BILLOFLADING",
        "6502406170"
    );
    JsonNode adapterResponse = objectMapper.readTree("""
        {
          "snapshot": {
            "provider": {"code": "COSCO"},
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:00:00Z",
            "tracking": {"type": "BILLOFLADING", "number": "6502406170"},
            "summary": {
              "billOfLading": "6502406170",
              "origin": {"name": "Shanghai"},
              "destination": {"name": "Long Beach"},
              "latestEvent": {"name": "Loaded on board"}
            },
            "references": {"business": {"clientNameCode": "API-CODE"}},
            "routingLegs": [{"vesselName": "COSCO EUROPE", "voyage": "113E"}],
            "containers": [{"number": "CSNU1234567", "sizeType": "40HC"}]
          },
          "cached": false
        }
        """);
    when(adapterClient.track(normalized)).thenReturn(adapterResponse);
    ShipmentImportDetails details = new ShipmentImportDetails(
        "COSU",
        "COSU6502406170",
        "JSH2606003",
        "COSCO EUROPE 113E-44",
        "SHA",
        "LONG BEACH",
        "HW202600057-2",
        "7-Jun-26",
        "22-Jun-26",
        "4*40HC",
        "FILE-CODE"
    );

    ObjectNode response = service.track(
        new ShipmentTrackRequest(
            "COSCO",
            "AUTO",
            "BILLOFLADING",
            "COSU6502406170",
            false,
            details
        ),
        business
    );

    JsonNode snapshot = response.path("snapshot");
    assertThat(snapshot.path("tracking").path("number").asText()).isEqualTo("6502406170");
    assertThat(snapshot.path("tracking").path("carrierPrefix").asText()).isEqualTo("COSU");
    assertThat(snapshot.path("tracking").path("originalNumber").asText())
        .isEqualTo("COSU6502406170");
    assertThat(snapshot.path("references").path("originalBillOfLading").asText())
        .isEqualTo("COSU6502406170");
    assertThat(snapshot.path("references").path("business").path("clientNameCode").asText())
        .isEqualTo("API-CODE");
    assertThat(snapshot.path("references").path("business").path("clientPoNumber").asText())
        .isEqualTo("HW202600057-2");
    assertThat(snapshot.path("references").path("business").path("forwarderJobNumber").asText())
        .isEqualTo("JSH2606003");
    assertThat(snapshot.path("extraInformation").findValuesAsText("key"))
        .contains("carrierPrefix", "originalBillOfLading", "clientPoNumber", "forwarderJobNumber")
        .doesNotContain(
            "clientNameCode", "vesselVoyage", "portOfLoading", "portOfDischarge", "volume"
        );
    verify(adapterClient).track(normalized);

    String storedJson = jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots",
        String.class
    );
    JsonNode stored = objectMapper.readTree(storedJson);
    assertThat(stored.path("tracking").path("originalNumber").asText())
        .isEqualTo("COSU6502406170");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_references WHERE reference_no_normalized = 'COSU6502406170'",
        Integer.class
    )).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT publication_status FROM cp_customer_shipment_access",
        String.class
    )).isEqualTo("DRAFT");

    Long matchedCustomerId = jdbcTemplate.queryForObject(
        "SELECT id FROM cp_customers WHERE client_code = 'FILE-CODE'", Long.class
    );
    CustomerPrincipal customer = new CustomerPrincipal(
        matchedCustomerId, "customer-public-id", "file-customer", "File Customer", "SHIPPER", "ACTIVE"
    );
    String shipmentId = response.path("shipmentId").asText();
    assertThat(service.listAssignedSnapshots(customer).path("total").asInt()).isZero();
    assertThatThrownBy(() -> service.readAssignedSnapshotByShipmentId(shipmentId, customer))
        .isInstanceOfSatisfying(ApiException.class, error ->
            assertThat(error.status()).isEqualTo(HttpStatus.NOT_FOUND)
        );
    jdbcTemplate.update(
        "UPDATE cp_customer_shipment_access SET publication_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP"
    );
    assertThat(service.listAssignedSnapshots(customer).path("total").asInt()).isEqualTo(1);
    ObjectNode customerDetail = service.readAssignedSnapshotByShipmentId(shipmentId, customer);
    assertThat(customerDetail.path("customerReadOnly").asBoolean()).isTrue();
    assertThat(customerDetail.path("cacheSource").asText()).isEqualTo("MYSQL_ASSIGNED");

    assertThatThrownBy(() -> service.track(
        new ShipmentTrackRequest(
            "COSCO",
            "AUTO",
            "BILLOFLADING",
            "COSU6502406170",
            false,
            details
        ),
        employee
    )).isInstanceOfSatisfying(ApiException.class, error ->
        assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN)
    );
  }

  @Test
  void sendsUnmatchedImportedClientCodeToTheReviewQueue() {
    ShipmentImportDetails details = new ShipmentImportDetails(
        null, null, "JOB-QUEUE", null, "SHA", "LAX", null,
        null, null, null, "UNMATCHED-CODE"
    );

    service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false, details),
        business
    );

    assertThat(jdbcTemplate.queryForObject(
        "SELECT imported_client_code FROM cp_shipment_client_match_queue WHERE match_status = 'PENDING'",
        String.class
    )).isEqualTo("UNMATCHED-CODE");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT match_reason FROM cp_shipment_client_match_queue WHERE match_status = 'PENDING'",
        String.class
    )).isEqualTo("NO_MATCH");
  }

  @Test
  void treatsContainerOnlyTrackingAsTransientInsteadOfAFileAuthorityKey() throws Exception {
    ObjectMapper objectMapper = new ObjectMapper();
    JsonNode containerOnlyResponse = objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:00:00Z",
            "tracking": {"type": "CONTAINER", "number": "CSNU1234567"},
            "summary": {"latestEvent": {"name": "In transit"}},
            "containers": [{"number": "CSNU1234567"}]
          },
          "cached": false
        }
        """);
    when(adapterClient.track(new NormalizedTrackRequest("COSCO", "AUTO", "CONTAINER", "CSNU1234567")))
        .thenReturn(containerOnlyResponse);

    ObjectNode result = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "CONTAINER", "CSNU1234567", false),
        employee
    );

    assertThat(result.path("persisted").asBoolean(true)).isFalse();
    assertThat(result.has("shipmentId")).isFalse();
    assertThat(result.path("fileAccess").asBoolean(true)).isFalse();
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_shipments", Integer.class)).isZero();
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_shipment_references", Integer.class)).isZero();
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_tracking_snapshots", Integer.class)).isZero();
  }

  @Test
  void doesNotPersistAnEmptyCarrierSnapshot() throws Exception {
    NormalizedTrackRequest normalized = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "EMPTY-1001"
    );
    when(adapterClient.track(normalized)).thenReturn(objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:00:00Z",
            "tracking": {"type": "BOOKING", "number": "EMPTY-1001"},
            "summary": {},
            "containers": []
          },
          "cached": false
        }
        """));

    assertThatThrownBy(() -> service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "EMPTY-1001", false),
        employee
    )).isInstanceOfSatisfying(ApiException.class, error -> {
      assertThat(error.status()).isEqualTo(HttpStatus.BAD_GATEWAY);
      assertThat(error.code()).isEqualTo("UPSTREAM_EMPTY");
    });
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_shipments", Integer.class)).isZero();
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_shipment_references", Integer.class)).isZero();
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_tracking_snapshots", Integer.class)).isZero();
  }

  @Test
  void persistsImportedOperationalFieldsWhenCarrierSnapshotIsEmpty() throws Exception {
    NormalizedTrackRequest normalized = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "IMPORT-EMPTY-1001"
    );
    when(adapterClient.track(normalized)).thenReturn(objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:00:00Z",
            "tracking": {"type": "BOOKING", "number": "IMPORT-EMPTY-1001"},
            "summary": {},
            "containers": []
          },
          "cached": false
        }
        """));
    ShipmentImportDetails details = new ShipmentImportDetails(
        null, null, "JOB-IMPORT", "VESSEL 001E", "SHA", "LAX", "PO-100",
        "2026-07-20", "2026-08-02", "1*40HC", "NO-SUCH-CLIENT"
    );

    ObjectNode result = service.track(
        new ShipmentTrackRequest(
            "COSCO", "AUTO", "BOOKING", "IMPORT-EMPTY-1001", false, details
        ),
        business
    );

    assertThat(result.path("persisted").asBoolean()).isTrue();
    assertThat(result.path("snapshot").path("summary").path("origin").path("name").asText())
        .isEqualTo("SHA");
    assertThat(result.path("snapshot").path("route")).hasSize(2);
    assertThat(result.path("snapshot").path("route").get(0).path("locationType").asText())
        .isEqualTo("FPOL");
    assertThat(result.path("snapshot").path("route").get(1).path("locationType").asText())
        .isEqualTo("LPOD");
    assertThat(result.path("snapshot").path("routeSource").asText())
        .isEqualTo("SYNTHESIZED_FROM_PLAN");
    ObjectNode legacySnapshot = (ObjectNode) result.path("snapshot").deepCopy();
    legacySnapshot.remove("route");
    legacySnapshot.remove("routeSource");
    jdbcTemplate.update(
        "UPDATE cp_tracking_snapshots SET snapshot_json = ?",
        objectMapper.writeValueAsString(legacySnapshot)
    );
    ObjectNode cached = service.track(
        new ShipmentTrackRequest(
            "COSCO", "AUTO", "BOOKING", "IMPORT-EMPTY-1001", false
        ),
        business
    );
    assertThat(cached.path("cacheSource").asText()).isEqualTo("MYSQL");
    assertThat(cached.path("snapshot").path("route")).hasSize(2);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT match_reason FROM cp_shipment_client_match_queue WHERE match_status = 'PENDING'",
        String.class
    )).isEqualTo("NO_MATCH");
  }

  @Test
  void discoversAndMergesContainerSubqueriesIntoTheParentShipment() throws Exception {
    ObjectNode parent = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        business
    );
    String shipmentId = parent.path("shipmentId").asText();
    String taskId = "batch_1234567890abcdef";
    NormalizedTrackRequest listRequest = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BILLOFLADING", "BL-90001", taskId
    );
    when(adapterClient.discoverContainers(listRequest)).thenReturn(objectMapper.readTree("""
        {
          "total": 1,
          "containers": [{
            "number": "CSNU1234567",
            "type": "40HC",
            "needsEnrichment": true,
            "milestones": []
          }]
        }
        """));

    ObjectNode discovered = service.discoverBatchContainers(
        shipmentId, "BL-90001", taskId, business
    );
    assertThat(discovered.path("containers")).hasSize(1);

    NormalizedTrackRequest containerRequest = new NormalizedTrackRequest(
        "COSCO", "AUTO", "CONTAINER", "CSNU1234567", taskId
    );
    when(adapterClient.track(containerRequest)).thenReturn(objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:02:00Z",
            "tracking": {"type": "CONTAINER", "number": "CSNU1234567"},
            "summary": {"latestEvent": {"name": "Truck gate out"}},
            "containers": [{
              "number": "CSNU1234567",
              "type": "40HC",
              "transportMode": "TRUCK",
              "currentLocation": "Shanghai depot",
              "latestEvent": "Truck gate out",
              "latestEventTime": "2026-07-16T09:30:00Z",
              "milestones": [{"name": "Truck gate out", "transportMode": "TRUCK"}]
            }]
          },
          "cached": false
        }
        """));

    service.enrichBatchContainer(shipmentId, "CSNU1234567", taskId, business);

    JsonNode stored = objectMapper.readTree(jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots", String.class
    ));
    JsonNode container = stored.path("containers").get(0);
    assertThat(container.path("currentLocation").asText()).isEqualTo("Shanghai depot");
    assertThat(container.path("transportMode").asText()).isEqualTo("TRUCK");
    assertThat(container.path("detailSource").asText()).isEqualTo("CONTAINER_SUBQUERY");
    assertThat(stored.path("containerEnrichment").path("completed").asInt()).isEqualTo(1);
  }

  @Test
  void keepsTheLastValidSnapshotWhenAForcedRefreshReturnsEmpty() throws Exception {
    ObjectNode first = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        employee
    );
    NormalizedTrackRequest normalized = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "BK-10001"
    );
    when(adapterClient.track(normalized, true)).thenReturn(objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:02:00Z",
            "tracking": {"type": "BOOKING", "number": "BK-10001"},
            "summary": {},
            "containers": []
          },
          "cached": false
        }
        """));

    ObjectNode refreshed = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", true),
        business
    );

    assertThat(refreshed.path("shipmentId").asText()).isEqualTo(first.path("shipmentId").asText());
    assertThat(refreshed.path("cacheSource").asText()).isEqualTo("MYSQL_STALE");
    assertThat(refreshed.path("snapshot").path("summary").path("latestEvent").path("name").asText())
        .isEqualTo("Loaded on board");
    assertThat(refreshed.path("warning").asText()).contains("last valid snapshot");
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_tracking_snapshots", Integer.class)).isEqualTo(1);
    verify(adapterClient).track(normalized, true);
  }

  @Test
  void automaticRefreshReusesTheExistingSnapshotOwner() throws Exception {
    ObjectNode first = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        employee
    );
    NormalizedTrackRequest normalized = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "BK-10001"
    );
    when(adapterClient.track(normalized, true)).thenReturn(objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:05:00Z",
            "tracking": {"type": "BOOKING", "number": "BK-10001"},
            "summary": {
              "billOfLading": "BL-90001",
              "bookingNumbers": ["BK-10001"],
              "latestEvent": {"name": "Discharged"}
            },
            "containers": [{"number": "CSNU1234567"}]
          },
          "cached": false
        }
        """));

    ObjectNode refreshed = service.refreshAutomatically("COSCO", "BOOKING", "BK-10001");

    assertThat(refreshed.path("shipmentId").asText()).isEqualTo(first.path("shipmentId").asText());
    assertThat(refreshed.path("snapshot").path("summary").path("latestEvent").path("name").asText())
        .isEqualTo("Discharged");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT queried_by FROM cp_tracking_snapshots LIMIT 1", Long.class
    )).isEqualTo(1L);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_tracking_snapshots", Integer.class
    )).isEqualTo(1);
    verify(adapterClient).track(normalized, true);
  }

  @Test
  void manualImportIsDurableMergeableAndDoesNotGrantAnotherBusinessUserAccess()
      throws Exception {
    ShipmentImportDetails firstDetails = new ShipmentImportDetails(
        null, "784-84422343", "LJSH26060018", null, "SHA", "IAH",
        "HW202600059", "6-Jun-26", "11-Jun-26", null, "Hayden US"
    );
    ShipmentBatchItemRequest firstRequest = new ShipmentBatchItemRequest(
        "row-1", null, "BILLOFLADING", "784-84422343",
        "784-84422343 空运", true, firstDetails
    );

    ObjectNode first = service.recordImportedPlaceholder(firstRequest, business);

    assertThat(first.path("created").asBoolean()).isTrue();
    String storedJson = jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots", String.class
    );
    JsonNode stored = objectMapper.readTree(storedJson);
    assertThat(stored.path("extraInformation").findValuesAsText("key"))
        .contains("forwarderJobNumber", "clientNameCode");
    assertThat(stored.path("extraInformation").findValuesAsText("name")).isEmpty();

    ShipmentImportDetails secondDetails = new ShipmentImportDetails(
        null, "784-84422343", "LJSH26060018", "CZ5221 / 22059.74-100",
        "SHA", "IAH", "HW202600059", "6-Jun-26", "11-Jun-26", "AIR", "Hayden US"
    );
    ObjectNode second = service.recordImportedPlaceholder(
        new ShipmentBatchItemRequest(
            "row-1", null, "BILLOFLADING", "784-84422343",
            "784-84422343 空运", true, secondDetails
        ),
        business
    );
    assertThat(second.path("created").asBoolean()).isFalse();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipments", Integer.class
    )).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_tracking_snapshots", Integer.class
    )).isEqualTo(1);
    JsonNode merged = objectMapper.readTree(jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots", String.class
    ));
    assertThat(merged.path("references").path("business").path("vesselVoyage").asText())
        .isEqualTo("CZ5221 / 22059.74-100");

    jdbcTemplate.update(
        "INSERT INTO cp_users (id, display_name, role) VALUES (3, 'Other Business', 'BUSINESS')"
    );
    AuthenticatedUser otherBusiness = new AuthenticatedUser(
        3, "other", "Other Business", "BUSINESS", "ACTIVE"
    );
    assertThatThrownBy(() -> service.recordImportedPlaceholder(firstRequest, otherBusiness))
        .isInstanceOfSatisfying(ApiException.class, error ->
            assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN)
        );

    ObjectNode punctuationReference = service.recordImportedPlaceholder(
        new ShipmentBatchItemRequest(
            "row-punctuation", "UNSUPPORTED", "BILLOFLADING", "ABC/123.45",
            "ABC/123.45 manual note", true,
            new ShipmentImportDetails(
                null, "ABC/123.45", "LJSH26060099", null, null, null,
                null, null, null, null, "Hayden US"
            )
        ),
        business
    );
    assertThat(punctuationReference.path("created").asBoolean()).isTrue();
  }

  @Test
  void concurrentManualImportsAcrossServiceInstancesKeepOneOwnedShipment() throws Exception {
    ShipmentTrackingProperties properties = new ShipmentTrackingProperties();
    properties.setCacheTtl(Duration.ofMinutes(15));
    ShipmentTrackingService competingService = new ShipmentTrackingService(
        jdbcTemplate,
        objectMapper,
        adapterClient,
        cmaTrackingSessionService,
        new ShipmentAccessService(jdbcTemplate),
        properties,
        new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
        Clock.fixed(Instant.parse("2026-07-16T10:01:00Z"), ZoneOffset.UTC)
    );
    ShipmentBatchItemRequest request = new ShipmentBatchItemRequest(
        "race-row", "UNSUPPORTED", "BILLOFLADING", "RACE/123.45",
        "RACE/123.45", true,
        new ShipmentImportDetails(
            null, "RACE/123.45", "JOB-RACE", null, null, null,
            null, null, null, null, "Hayden US"
        )
    );
    ExecutorService workers = Executors.newFixedThreadPool(2);
    CountDownLatch ready = new CountDownLatch(2);
    CountDownLatch start = new CountDownLatch(1);
    try {
      var first = workers.submit(() -> {
        ready.countDown();
        start.await(2, TimeUnit.SECONDS);
        return service.recordImportedPlaceholder(request, business);
      });
      var second = workers.submit(() -> {
        ready.countDown();
        start.await(2, TimeUnit.SECONDS);
        return competingService.recordImportedPlaceholder(request, business);
      });
      assertThat(ready.await(2, TimeUnit.SECONDS)).isTrue();
      start.countDown();
      assertThat(first.get(5, TimeUnit.SECONDS).path("shipmentId").asText())
          .isEqualTo(second.get(5, TimeUnit.SECONDS).path("shipmentId").asText());
    } finally {
      workers.shutdownNow();
    }

    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipments", Integer.class
    )).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_references", Integer.class
    )).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_tracking_snapshots", Integer.class
    )).isEqualTo(1);
  }

  private void createSchema() {
    jdbcTemplate.execute("""
        CREATE TABLE cp_users (
          id BIGINT PRIMARY KEY,
          display_name VARCHAR(80) NOT NULL,
          role VARCHAR(24) NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipments (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          public_id CHAR(36) NOT NULL UNIQUE,
          carrier_code VARCHAR(32) NOT NULL,
          current_snapshot_id BIGINT,
          tracking_status VARCHAR(80),
          last_tracked_at TIMESTAMP,
          fresh_until TIMESTAMP,
          created_by BIGINT,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_references (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          shipment_id BIGINT NOT NULL,
          carrier_code VARCHAR(32) NOT NULL,
          reference_type VARCHAR(24) NOT NULL,
          reference_no_raw VARCHAR(160) NOT NULL,
          reference_no_normalized VARCHAR(128) NOT NULL,
          primary_reference BOOLEAN NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(carrier_code, reference_type, reference_no_normalized)
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_tracking_snapshots (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          shipment_id BIGINT NOT NULL,
          query_reference_type VARCHAR(24) NOT NULL,
          query_reference_no VARCHAR(128) NOT NULL,
          queried_by BIGINT NOT NULL,
          queried_by_username VARCHAR(128) NOT NULL,
          source_channel VARCHAR(32),
          snapshot_json CLOB NOT NULL,
          strategy_json CLOB,
          payload_sha256 CHAR(64) NOT NULL,
          fetched_at TIMESTAMP NOT NULL,
          fresh_until TIMESTAMP NOT NULL,
          created_at TIMESTAMP NOT NULL,
          invalidated_at TIMESTAMP,
          invalidated_by BIGINT,
          invalidation_reason VARCHAR(500),
          UNIQUE KEY uk_cp_tracking_snapshots_user_query (queried_by, query_reference_type, query_reference_no)
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_participants (
          shipment_id BIGINT NOT NULL,
          user_id BIGINT NOT NULL,
          participant_role VARCHAR(24) NOT NULL,
          granted_by BIGINT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (shipment_id, user_id)
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_customers (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          public_id CHAR(36),
          username VARCHAR(64),
          display_name VARCHAR(80),
          created_by BIGINT,
          status VARCHAR(24) NOT NULL,
          client_code VARCHAR(64),
          party_role VARCHAR(20),
          customer_code_hash CHAR(64),
          customer_code_prefix VARCHAR(16),
          customer_code_mode VARCHAR(20) DEFAULT 'RANDOM',
          provisioning_source VARCHAR(20) DEFAULT 'MANUAL',
          remark VARCHAR(500)
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_customer_shipment_access (
          shipment_id BIGINT NOT NULL,
          customer_id BIGINT NOT NULL,
          relationship_role VARCHAR(20),
          publication_status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
          assigned_by BIGINT,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          published_at TIMESTAMP,
          published_by BIGINT,
          PRIMARY KEY (shipment_id, customer_id)
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_client_match_queue (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          shipment_id BIGINT NOT NULL UNIQUE,
          imported_client_code VARCHAR(160) NOT NULL,
          match_status VARCHAR(32) NOT NULL,
          match_reason VARCHAR(64) NOT NULL,
          requested_by BIGINT,
          matched_customer_id BIGINT,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL,
          resolved_at TIMESTAMP
        )
        """);
  }
}
