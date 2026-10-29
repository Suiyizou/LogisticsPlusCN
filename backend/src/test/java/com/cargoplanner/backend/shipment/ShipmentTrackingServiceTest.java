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
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
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
  private ShipmentTrackingProperties properties;

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

    properties = new ShipmentTrackingProperties();
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
  void newCarrierTrackingRequiresAnAuthenticatedWorkspace() {
    assertThatThrownBy(() -> service.track(
        new ShipmentTrackRequest("MAERSK", "AUTO", "BILLOFLADING", "TEST-BL-10001", false), null
    )).isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN));
  }

  @Test
  void localCmaUsesDesktopSessionAndPersistsTheMappedSnapshot() throws Exception {
    properties.setAdapterMode(ShipmentTrackingProperties.AdapterMode.LOCAL_QUEUE);
    NormalizedTrackRequest query = new NormalizedTrackRequest("CMA", "PLAYWRIGHT", "BOOKING", "TJN0940917");
    JsonNode record = objectMapper.readTree("""
        {"schema":"tracking.v1","carrier":{"code":"CMA_CGM","name":"CMA CGM"},
         "query":{"reference_input":"TJN0940917","status":"QUERY_COMPLETED"},
         "shipment":{"booking":"TJN0940917","containers":[{"number":"CMAU1234567"}],
           "fields":{"eta":"2026-08-01 08:00"}},"meta":{"business_verified":false}}
        """);
    when(adapterClient.track(query)).thenReturn(new TrackingV1SnapshotMapper(objectMapper)
        .map(record, query, "2026-07-16T10:00:00Z", "local-job-cma"));
    ShipmentTrackRequest input = new ShipmentTrackRequest("CMA", "AUTO", "BOOKING", "TJN0940917", false);
    ObjectNode live = service.track(input, business);
    ObjectNode cached = service.track(input, business);
    assertThat(live.path("persisted").asBoolean()).isTrue();
    assertThat(cached.path("shipmentId").asText()).isEqualTo(live.path("shipmentId").asText());
    assertThat(cached.path("snapshot").path("provider").path("code").asText()).isEqualTo("CMA");
    assertThat(cached.path("snapshot").path("keyTimes").path("estimatedArrival").path("time").asText())
        .isEqualTo("2026-08-01 08:00");
    org.mockito.Mockito.verifyNoInteractions(cmaTrackingSessionService);
    verify(adapterClient, times(1)).track(query);
  }

  @Test
  void localCoscoBillAndEventsOnlyRemainIntactAcrossPersistenceAndCacheReads() throws Exception {
    properties.setAdapterMode(ShipmentTrackingProperties.AdapterMode.LOCAL_QUEUE);
    NormalizedTrackRequest query = new NormalizedTrackRequest("COSCO", "AUTO", "BILLOFLADING", "COSU000010001");
    JsonNode record = objectMapper.readTree("""
        {"schema":"tracking.v1","carrier":{"code":"COSCO"},
         "query":{"reference_input":"COSU000010001","status":"QUERY_COMPLETED"},
         "shipment":{"bill_of_lading":"COSU000010001","events":[
           {"description":"Carrier source entry","time_raw":"2026-07-15 08:00"}]},"meta":{}}
        """);
    when(adapterClient.track(query)).thenReturn(new TrackingV1SnapshotMapper(objectMapper)
        .map(record, query, "2026-07-16T10:00:00Z", "local-job-cosco"));
    ShipmentTrackRequest input = new ShipmentTrackRequest("COSCO", "AUTO", "BILLOFLADING", "COSU000010001", false);
    ObjectNode live = service.track(input, business);
    ObjectNode cached = service.track(input, business);
    assertThat(live.path("shipmentId").asText()).isNotBlank();
    assertThat(cached.path("snapshot").path("route")).isEmpty();
    assertThat(cached.path("snapshot").path("supplementalDetails").path("pendingRefresh").asBoolean()).isFalse();
    assertThat(cached.path("snapshot").path("events").get(0).path("occurredAt").isNull()).isTrue();
    assertThat(cached.path("snapshot").path("events").get(0).path("reportedTime").asText())
        .isEqualTo("2026-07-15 08:00");
    verify(adapterClient, times(1)).track(query);
  }

  @Test
  void persistsAndReusesAllNewCarrierSnapshotsWithTheirBillIdentities() throws Exception {
    for (String carrier : List.of("MAERSK", "HAPAG_LLOYD", "MSC", "OOCL")) {
      String number = "TEST-BL-10001";
      NormalizedTrackRequest request = new NormalizedTrackRequest(carrier, "AUTO", "BILLOFLADING", number);
      ObjectNode upstream = (ObjectNode) objectMapper.readTree("""
          {"snapshot":{"channel":"AGENT","fetchedAt":"2026-07-16T10:00:00Z",
          "tracking":{"type":"BILLOFLADING","number":"TEST-BL-10001"},
          "summary":{"billOfLading":"TEST-BL-10001","latestEvent":{"name":"Loaded on board"}},
          "containers":[{"number":"MSKU1234567"}]},
          "strategy":{"requested":"AUTO","used":"AGENT"}}
          """);
      upstream.withObject("snapshot").putObject("provider").put("code", carrier);
      when(adapterClient.track(request)).thenReturn(upstream);
      ShipmentTrackRequest input = new ShipmentTrackRequest(carrier, "AUTO", "BILLOFLADING", number, false);
      assertThat(service.track(input, business).path("cacheSource").asText()).isEqualTo("LIVE");
      assertThat(service.track(input, business).path("snapshot").path("provider").path("code").asText())
          .isEqualTo(carrier);
      verify(adapterClient, times(1)).track(request);
    }
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_shipments", Integer.class)).isEqualTo(4);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_references WHERE reference_type = 'BILLOFLADING' AND primary_reference = TRUE",
        Integer.class
    )).isEqualTo(4);
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
  void importedPlaceholderNeverShortCircuitsTheFirstCarrierQuery() throws Exception {
    service.recordImportedPlaceholder(
        new ShipmentBatchItemRequest(
            "row-placeholder", "COSCO", "BOOKING", "BK-10001",
            "BK-10001", false,
            new ShipmentImportDetails(
                "COSCO", "BL-90001", "JOB-10001", "TEST VESSEL / 001",
                "SHANGHAI", "LONG BEACH", null, null, null, null, "Hayden US"
            )
        ),
        business
    );

    ObjectNode response = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        business
    );

    assertThat(response.path("cacheSource").asText()).isEqualTo("LIVE");
    assertThat(jdbcTemplate.queryForObject(
        """
        SELECT t.source_channel
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        """,
        String.class
    )).isEqualTo("NETWORK");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipments", Integer.class
    )).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT last_tracked_at FROM cp_shipments", Timestamp.class
    )).isNotNull();
    verify(adapterClient).track(
        new NormalizedTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001")
    );
  }

  @Test
  void limitsTheProxyChannelToBusinessUsersAndAlwaysForcesALiveQuery() throws Exception {
    NormalizedTrackRequest normalized = new NormalizedTrackRequest(
        "COSCO", "PROXY", "BOOKING", "PROXY-10001"
    );
    when(adapterClient.track(normalized, true)).thenReturn(objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "PROXY",
            "fetchedAt": "2026-07-16T10:00:00Z",
            "tracking": {"type": "BOOKING", "number": "PROXY-10001"},
            "summary": {
              "bookingNumbers": ["PROXY-10001"],
              "latestEvent": {"name": "Loaded on board"}
            }
          },
          "strategy": {"requested": "PROXY", "used": "PROXY"}
        }
        """));

    assertThatThrownBy(() -> service.track(
        new ShipmentTrackRequest("COSCO", "PROXY", "BOOKING", "PROXY-10001", false),
        employee
    )).isInstanceOfSatisfying(ApiException.class, error ->
        assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN)
    );

    ObjectNode response = service.track(
        new ShipmentTrackRequest("COSCO", "PROXY", "BOOKING", "PROXY-10001", false),
        business
    );

    assertThat(response.path("snapshot").path("channel").asText()).isEqualTo("PROXY");
    verify(adapterClient).track(normalized, true);
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
  void persistsAliasesButRejectsBillOfLadingQueries() {
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

    assertThatThrownBy(() -> service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BILLOFLADING", "BL-90001", false),
        employee
    )).isInstanceOfSatisfying(ApiException.class, error -> {
      assertThat(error.status()).isEqualTo(HttpStatus.BAD_REQUEST);
      assertThat(error.code()).isEqualTo("BOOKING_REFERENCE_REQUIRED");
    });
    verify(adapterClient, times(1))
        .track(new NormalizedTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001"));
  }

  @Test
  void bookingRefreshReusesTheExistingBookingShipment() throws Exception {
    NormalizedTrackRequest initialBooking = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "6507943350"
    );
    when(adapterClient.track(initialBooking)).thenReturn(objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:00:00Z",
            "tracking": {"type": "BOOKING", "number": "6507943350"},
            "summary": {
              "bookingNumbers": ["6507943350"],
              "origin": {"name": "Shanghai"},
              "destination": {"name": "Long Beach"},
              "latestEvent": {"name": "Booking confirmed"}
            }
          }
        }
        """));
    ObjectNode initial = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "6507943350", false),
        business
    );

    NormalizedTrackRequest booking = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "6507943350"
    );
    when(adapterClient.track(booking, true)).thenReturn(objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:05:00Z",
            "tracking": {"type": "BOOKING", "number": "6507943350"},
            "summary": {
              "bookingNumbers": ["6507943350"],
              "origin": {"name": "Shanghai"},
              "destination": {"name": "Long Beach"},
              "latestEvent": {"name": "EIR order"},
              "containers": [{"containerType": "45HQ", "quantity": 7}]
            },
            "route": [{"location": {"name": "Shanghai"}}, {"location": {"name": "Long Beach"}}]
          }
        }
        """));

    ObjectNode refreshed = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "6507943350", true),
        business
    );

    assertThat(refreshed.path("shipmentId").asText()).isEqualTo(initial.path("shipmentId").asText());
    assertThat(refreshed.path("snapshot").path("summary").path("latestEvent").path("name").asText())
        .isEqualTo("EIR order");
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_shipments", Integer.class))
        .isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_references WHERE reference_type = 'BOOKING'",
        Integer.class
    )).isEqualTo(1);
    verify(adapterClient).track(booking, true);
  }

  @Test
  void rejectsCarrierStatusTextDisguisedAsABillReference() throws Exception {
    NormalizedTrackRequest request = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "6508063160"
    );
    when(adapterClient.track(request)).thenReturn(objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:00:00Z",
            "tracking": {"type": "BOOKING", "number": "6508063160"},
            "summary": {
              "billOfLading": "6508063160 B/L Not Ready",
              "origin": {"name": "Shanghai"},
              "destination": {"name": "Rotterdam"},
              "latestEvent": {"name": "Booking confirmed"}
            }
          }
        }
        """));

    service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "6508063160", false),
        business
    );

    assertThat(jdbcTemplate.queryForList(
        "SELECT reference_no_normalized FROM cp_shipment_references",
        String.class
    )).containsExactly("6508063160");
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
            "COSCO", "AUTO", "BOOKING", "BK-10001", false, imported
        ),
        business
    );

    assertThat(cached.path("shipmentId").asText()).isEqualTo(first.path("shipmentId").asText());
    assertThat(cached.path("cacheSource").asText()).isEqualTo("MYSQL");
    assertThat(cached.path("snapshot").path("references").path("business")
        .path("forwarderJobNumber").asText()).isEqualTo("JOB-100");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT job_number FROM cp_shipments", String.class
    )).isEqualTo("JOB-100");
    assertThat(cached.path("snapshot").path("route")).hasSize(2);

    ObjectNode unchanged = service.track(
        new ShipmentTrackRequest(
            "COSCO", "AUTO", "BOOKING", "BK-10001", false, imported
        ),
        business
    );
    assertThat(unchanged.path("importedDetailsUpdated").asBoolean()).isFalse();
    assertThat(unchanged.path("importedDetailsUnchanged").asBoolean()).isTrue();

    ShipmentImportDetails changed = new ShipmentImportDetails(
        null, "BL-90001", "JOB-101", null, "SHA", "LAX",
        "PO-100", "2026-07-20", "2026-08-02", "1*40HC", null
    );
    ObjectNode overwritten = service.track(
        new ShipmentTrackRequest(
            "COSCO", "AUTO", "BOOKING", "BK-10001", false, changed
        ),
        business
    );
    assertThat(overwritten.path("importedDetailsUpdated").asBoolean()).isTrue();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT job_number FROM cp_shipments", String.class
    )).isEqualTo("JOB-101");
    verify(adapterClient, times(1))
        .track(new NormalizedTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001"));
  }

  @Test
  void usesBookingForTheAdapterAndPersistsMissingSpreadsheetDetails() throws Exception {
    jdbcTemplate.update(
        "INSERT INTO cp_customers (public_id, username, display_name, created_by, "
            + "responsible_agent_id, status, client_code, party_role) "
            + "VALUES ('customer-public-id', 'file-customer', 'File Customer', "
            + "2, 2, 'ACTIVE', 'FILE-CODE', 'SHIPPER')"
    );
    NormalizedTrackRequest normalized = new NormalizedTrackRequest(
        "COSCO",
        "AUTO",
        "BOOKING",
        "6502406170"
    );
    JsonNode adapterResponse = objectMapper.readTree("""
        {
          "snapshot": {
            "provider": {"code": "COSCO"},
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:00:00Z",
            "tracking": {"type": "BOOKING", "number": "6502406170"},
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
            "BOOKING",
            "COSU6502406170",
            false,
            details
        ),
        business
    );

    JsonNode snapshot = response.path("snapshot");
    assertThat(snapshot.path("tracking").path("number").asText()).isEqualTo("6502406170");
    assertThat(snapshot.path("tracking").has("carrierPrefix")).isFalse();
    assertThat(snapshot.path("tracking").has("originalNumber")).isFalse();
    assertThat(snapshot.path("references").has("originalBillOfLading")).isFalse();
    assertThat(snapshot.path("references").path("business").path("clientNameCode").asText())
        .isEqualTo("FILE-CODE");
    assertThat(snapshot.path("references").path("business").path("clientPoNumber").asText())
        .isEqualTo("HW202600057-2");
    assertThat(snapshot.path("references").path("business").path("forwarderJobNumber").asText())
        .isEqualTo("JSH2606003");
    assertThat(snapshot.path("extraInformation").findValuesAsText("key"))
        .doesNotContain(
            "carrierPrefix", "originalBillOfLading", "clientPoNumber", "forwarderJobNumber",
            "clientNameCode"
        );
    verify(adapterClient).track(normalized);

    String storedJson = jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots",
        String.class
    );
    JsonNode stored = objectMapper.readTree(storedJson);
    assertThat(stored.path("tracking").has("originalNumber")).isFalse();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT job_number FROM cp_shipments", String.class
    )).isEqualTo("JSH2606003");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT client_po_number FROM cp_shipments", String.class
    )).isEqualTo("HW202600057-2");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT client_name_code FROM cp_shipments", String.class
    )).isEqualTo("FILE-CODE");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT original_bill_of_lading FROM cp_shipments", String.class
    )).isEqualTo("COSU6502406170");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_references WHERE reference_no_normalized = 'COSU6502406170'",
        Integer.class
    )).isZero();
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
    ObjectNode customerList = service.listAssignedSnapshots(customer);
    assertThat(customerList.path("total").asInt()).isEqualTo(1);
    assertThat(customerList.path("items").get(0).path("snapshot")
        .path("references").path("business").path("forwarderJobNumber").asText())
        .isEqualTo("JSH2606003");
    ObjectNode customerDetail = service.readAssignedSnapshotByShipmentId(shipmentId, customer);
    assertThat(customerDetail.path("customerReadOnly").asBoolean()).isTrue();
    assertThat(customerDetail.path("cacheSource").asText()).isEqualTo("MYSQL_ASSIGNED");
    assertThat(customerDetail.path("snapshot").path("references").path("business")
        .path("clientPoNumber").asText()).isEqualTo("HW202600057-2");
    assertThat(customerDetail.path("snapshot").path("references").path("business")
        .path("clientNameCode").asText()).isEqualTo("FILE-CODE");

    jdbcTemplate.update(
        """
        INSERT INTO cp_customers (
          id, public_id, username, display_name, status, party_role,
          customer_code_hash, customer_code_prefix, created_by, responsible_agent_id
        ) VALUES (900, 'oversea-agent-public-id', 'oversea-agent', 'Oversea Agent',
                  'ACTIVE', 'OVERSEA_AGENT', 'agent-hash', 'AGENT', 1, 1)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_oversea_agent_customers (
          customer_id, oversea_agent_customer_id, assigned_by
        ) VALUES (?, 900, 1)
        """,
        matchedCustomerId
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_oversea_agent_shipment_scopes (
          shipment_id, oversea_agent_customer_id, represented_customer_id,
          status, assigned_by
        ) VALUES (
          (SELECT id FROM cp_shipments WHERE public_id = ?),
          900, ?, 'ACTIVE', 1
        )
        """,
        shipmentId,
        matchedCustomerId
    );
    CustomerPrincipal overseaAgent = new CustomerPrincipal(
        900, "oversea-agent-public-id", "oversea-agent", "Oversea Agent",
        "OVERSEA_AGENT", "ACTIVE",
        matchedCustomerId, "customer-public-id", "File Customer", "SHIPPER"
    );
    assertThat(service.listAssignedSnapshots(overseaAgent, 1, 5).path("total").asLong())
        .isEqualTo(1L);
    jdbcTemplate.update(
        """
        INSERT INTO cp_customer_shipment_access (
          shipment_id, customer_id, relationship_role, publication_status, assigned_by
        ) VALUES (
          (SELECT id FROM cp_shipments WHERE public_id = ?),
          900, 'OVERSEA_AGENT', 'DRAFT', 1
        )
        """,
        shipmentId
    );
    ObjectNode agentShipments = service.listAssignedSnapshots(overseaAgent, 1, 5);
    assertThat(agentShipments.path("total").asLong()).isEqualTo(1L);
    assertThat(agentShipments.path("overseaAgentManagement").asBoolean()).isTrue();
    assertThat(agentShipments.path("customerReadOnly").asBoolean()).isTrue();
    assertThat(agentShipments.path("capabilities").path("editShipmentMasterData").asBoolean())
        .isFalse();
    assertThat(agentShipments.path("capabilities").path("refreshTracking").asBoolean())
        .isTrue();
    assertThat(agentShipments.path("scopeCustomer").path("id").asText())
        .isEqualTo("customer-public-id");
    assertThat(agentShipments.path("items").get(0).path("publicationStatus").asText())
        .isEqualTo("PUBLISHED");
    assertThat(agentShipments.path("items").get(0).path("followed").asBoolean()).isFalse();
    JsonNode visibleCustomer = agentShipments.path("items").get(0)
        .path("boundCustomers").get(0);
    assertThat(agentShipments.path("items").get(0).path("boundCustomers").size()).isEqualTo(1);
    assertThat(visibleCustomer.path("id").asText()).isEqualTo("customer-public-id");
    assertThat(visibleCustomer.has("username")).isFalse();
    assertThat(visibleCustomer.path("clientCode").asText()).isEqualTo("FILE-CODE");
    assertThat(service.readAssignedSnapshotByShipmentId(shipmentId, overseaAgent)
        .path("customerReadOnly").asBoolean()).isTrue();
    assertThat(service.readAssignedSnapshotByShipmentId(shipmentId, overseaAgent)
        .path("shipmentId").asText()).isEqualTo(shipmentId);

    assertThatThrownBy(() -> service.updateOverseaAgentAssignedShipment(
        shipmentId,
        new CustomerShipmentUpdateRequest(
            "Oversea follow-up", "JOB-OVERSEA", "PO-OVERSEA", "CLIENT-OVERSEA"
        ),
        overseaAgent
    )).isInstanceOfSatisfying(ApiException.class, error ->
        assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN)
    );
    assertThat(jdbcTemplate.queryForObject(
        "SELECT job_number FROM cp_shipments WHERE public_id = ?",
        String.class,
        shipmentId
    )).isEqualTo("JSH2606003");
    assertThatThrownBy(() -> service.updateOverseaAgentAssignedShipment(
        shipmentId,
        new CustomerShipmentUpdateRequest("No access", null, null, null),
        customer
    )).isInstanceOfSatisfying(ApiException.class, error ->
        assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN)
    );

    assertThat(service.setOverseaAgentShipmentFollow(shipmentId, true, overseaAgent)
        .path("following").asBoolean()).isTrue();
    assertThat(service.listAssignedSnapshots(overseaAgent, 1, 5)
        .path("items").get(0).path("followed").asBoolean()).isTrue();
    ObjectNode followedAgentShipments =
        service.listAssignedSnapshots(overseaAgent, 1, 5, true);
    assertThat(followedAgentShipments.path("total").asLong()).isEqualTo(1L);
    assertThat(followedAgentShipments.path("followingOnly").asBoolean()).isTrue();
    assertThatThrownBy(() ->
        service.setOverseaAgentShipmentFollow(shipmentId, true, customer)
    ).isInstanceOfSatisfying(ApiException.class, error ->
        assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN)
    );

    when(adapterClient.track(normalized, true)).thenReturn(adapterResponse);
    ObjectNode agentRefresh =
        service.refreshOverseaAgentAssignedShipment(shipmentId, overseaAgent);
    assertThat(agentRefresh.path("overseaAgentManaged").asBoolean()).isTrue();
    assertThat(agentRefresh.path("shipmentId").asText()).isEqualTo(shipmentId);
    assertThat(jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) FROM cp_oversea_agent_shipment_follows
        WHERE oversea_agent_customer_id = 900
          AND shipment_id = (SELECT id FROM cp_shipments WHERE public_id = ?)
          AND last_refreshed_at IS NOT NULL
        """,
        Integer.class,
        shipmentId
    )).isEqualTo(1);
    verify(adapterClient).track(normalized, true);

    assertThat(service.setOverseaAgentShipmentFollow(shipmentId, false, overseaAgent)
        .path("following").asBoolean()).isFalse();
    assertThat(service.listAssignedSnapshots(overseaAgent, 1, 5)
        .path("items").get(0).path("followed").asBoolean()).isFalse();
    assertThat(service.listAssignedSnapshots(overseaAgent, 1, 5, true)
        .path("total").asLong()).isZero();

    for (long id = 500; id < 506; id++) {
      jdbcTemplate.update(
          """
          INSERT INTO cp_shipments (
            id, public_id, carrier_code, tracking_status, created_by, responsible_agent_id,
            created_at, updated_at
          ) VALUES (?, ?, 'COSCO', 'Pending', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          """,
          id, "customer-page-" + id
      );
      jdbcTemplate.update(
          """
          INSERT INTO cp_customer_shipment_access (
            shipment_id, customer_id, relationship_role, publication_status, assigned_by
          ) VALUES (?, ?, 'SHIPPER', 'PUBLISHED', 1)
          """,
          id, matchedCustomerId
      );
    }
    ObjectNode firstPage = service.listAssignedSnapshots(customer, 1, 5);
    ObjectNode secondPage = service.listAssignedSnapshots(customer, 2, 5);
    assertThat(firstPage.path("total").asLong()).isEqualTo(7L);
    assertThat(firstPage.path("totalPages").asInt()).isEqualTo(2);
    assertThat(firstPage.path("items").size()).isEqualTo(5);
    assertThat(secondPage.path("items").size()).isEqualTo(2);

    jdbcTemplate.update(
        "UPDATE cp_shipments SET tracking_status = 'EMPTY_RETURNED' WHERE id = 500"
    );
    ObjectNode unfinishedPage = service.listAssignedSnapshots(
        customer, 1, 5, false, null, "desc", true
    );
    assertThat(unfinishedPage.path("allTotal").asLong()).isEqualTo(7L);
    assertThat(unfinishedPage.path("unfinishedTotal").asLong()).isEqualTo(6L);
    assertThat(unfinishedPage.path("total").asLong()).isEqualTo(6L);
    assertThat(unfinishedPage.path("totalPages").asInt()).isEqualTo(2);
    assertThat(unfinishedPage.path("unfinishedOnly").asBoolean()).isTrue();

    assertThatThrownBy(() -> service.track(
        new ShipmentTrackRequest(
            "COSCO",
            "AUTO",
            "BOOKING",
            "6502406170",
            false,
            details
        ),
        employee
    )).isInstanceOfSatisfying(ApiException.class, error ->
        assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN)
    );
  }

  @Test
  void sortsCustomerShipmentsByDisplayedArrivalBeforeApplyingPagination() {
    jdbcTemplate.update(
        """
        INSERT INTO cp_customers (
          id, public_id, username, display_name, status, party_role,
          customer_code_hash, customer_code_prefix, created_by, responsible_agent_id
        ) VALUES (
          700, 'sort-customer-id', 'sort-customer', 'Sort Customer', 'ACTIVE', 'SHIPPER',
          'sort-customer-hash', 'SORT', 2, 2
        )
        """
    );
    List<String> snapshots = List.of(
        """
        {"tracking":{"type":"BOOKING","number":"SORT-0"},"summary":{"latestEvent":{"name":"Arrived"}},
         "routingLegs":[{"mode":"SEA","actualArrival":"2026-07-07T00:00:00Z","estimatedArrival":"2026-08-20T00:00:00Z"}]}
        """,
        """
        {"tracking":{"type":"BOOKING","number":"SORT-1"},"summary":{"latestEvent":{"name":"Sailing"}},
         "keyTimes":{"estimatedFinalArrival":{"time":"2026-08-13T00:00:00Z"}}}
        """,
        """
        {"tracking":{"type":"BOOKING","number":"SORT-2"},"summary":{"latestEvent":{"name":"Sailing"}},
         "keyTimes":{"estimatedFinalArrival":{"time":"2026-07-28T00:00:00Z"}}}
        """,
        """
        {"tracking":{"type":"BOOKING","number":"SORT-3"},"summary":{"latestEvent":{"name":"Sailing"}},
         "keyTimes":{"estimatedFinalArrival":{"time":"2026-07-15T00:00:00Z"}}}
        """,
        """
        {"tracking":{"type":"BOOKING","number":"SORT-4"},"summary":{"latestEvent":{"name":"Sailing"}},
         "keyTimes":{"estimatedFinalArrival":{"time":"2026-07-09T00:00:00Z"}}}
        """,
        """
        {"tracking":{"type":"BOOKING","number":"SORT-5"},"summary":{"latestEvent":{"name":"Sailing"}},
         "keyTimes":{"estimatedFinalArrival":{"time":"2026-07-01T00:00:00Z"}}}
        """
    );
    for (int index = 0; index < snapshots.size(); index += 1) {
      long id = 1700L + index;
      String reference = "SORT-" + index;
      jdbcTemplate.update(
          """
          INSERT INTO cp_shipments (
            id, public_id, carrier_code, tracking_status, created_by, responsible_agent_id,
            created_at, updated_at
          ) VALUES (?, ?, 'COSCO', 'In transit', 2, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          """,
          id,
          "sort-shipment-" + index
      );
      jdbcTemplate.update(
          """
          INSERT INTO cp_shipment_references (
            id, shipment_id, carrier_code, reference_type, reference_no_raw,
            reference_no_normalized, primary_reference
          ) VALUES (?, ?, 'COSCO', 'BOOKING', ?, ?, TRUE)
          """,
          id,
          id,
          reference,
          reference
      );
      jdbcTemplate.update(
          """
          INSERT INTO cp_tracking_snapshots (
            id, shipment_id, query_reference_type, query_reference_no, queried_by,
            queried_by_username, source_channel, snapshot_json, payload_sha256,
            fetched_at, fresh_until, created_at
          ) VALUES (?, ?, 'BOOKING', ?, 2, 'business', 'AUTO', ?, REPEAT('a', 64),
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          """,
          id,
          id,
          reference,
          snapshots.get(index)
      );
      jdbcTemplate.update(
          "UPDATE cp_shipments SET current_snapshot_id = ? WHERE id = ?",
          id,
          id
      );
      jdbcTemplate.update(
          """
          INSERT INTO cp_customer_shipment_access (
            shipment_id, customer_id, relationship_role, publication_status, assigned_by
          ) VALUES (?, 700, 'SHIPPER', 'PUBLISHED', 2)
          """,
          id
      );
    }

    CustomerPrincipal customer = new CustomerPrincipal(
        700, "sort-customer-id", "sort-customer", "Sort Customer", "SHIPPER", "ACTIVE"
    );
    ObjectNode firstPage = service.listAssignedSnapshots(
        customer, 1, 5, false, null, "desc"
    );
    ObjectNode secondPage = service.listAssignedSnapshots(
        customer, 2, 5, false, null, "desc"
    );

    assertThat(firstPage.path("items").findValuesAsText("referenceNo"))
        .containsExactly("SORT-1", "SORT-2", "SORT-3", "SORT-4", "SORT-0");
    assertThat(secondPage.path("items").findValuesAsText("referenceNo"))
        .containsExactly("SORT-5");
    assertThat(firstPage.path("etaSort").asText()).isEqualTo("desc");
  }

  @Test
  void overseaAgentListsLinkedCustomerShipmentsAndFiltersBySelectedCustomer() {
    jdbcTemplate.update(
        """
        INSERT INTO cp_customers (
          id, public_id, username, display_name, status, party_role,
          client_code, customer_code_hash, customer_code_prefix,
          created_by, responsible_agent_id
        ) VALUES
          (100, 'agent-100', 'agent-100', 'Agent 100', 'ACTIVE', 'OVERSEA_AGENT',
           'AGENT-100', 'agent-hash', 'AGENT', 1, 1),
          (101, 'customer-101', 'customer-101', 'Customer 101', 'ACTIVE', 'SHIPPER',
           'CLIENT-101', 'customer-hash-101', 'C101', 1, 1),
          (102, 'customer-102', 'customer-102', 'Customer 102', 'ACTIVE', 'CONSIGNEE',
           'CLIENT-102', 'customer-hash-102', 'C102', 1, 1),
          (103, 'customer-103', 'customer-103', 'Customer 103', 'ACTIVE', 'SHIPPER',
           'CLIENT-103', 'customer-hash-103', 'C103', 1, 1),
          (200, 'agent-200', 'agent-200', 'Agent 200', 'ACTIVE', 'OVERSEA_AGENT',
           'AGENT-200', 'agent-hash-200', 'AGENT200', 1, 1)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_oversea_agent_customers (
          customer_id, oversea_agent_customer_id, assigned_by
        ) VALUES (101, 100, 1), (102, 100, 1)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipments (
          id, public_id, carrier_code, tracking_status, created_by, responsible_agent_id,
          created_at, updated_at
        ) VALUES
          (1001, 'linked-shipment-1', 'COSCO', 'Pending', 1, 1,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          (1002, 'linked-shipment-2', 'COSCO', 'Pending', 1, 1,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          (1003, 'agent-own-shipment', 'COSCO', 'Pending', 1, 1,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          (1004, 'unrelated-shipment', 'COSCO', 'Pending', 1, 1,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_customer_shipment_access (
          shipment_id, customer_id, relationship_role, publication_status, assigned_by
        ) VALUES
          (1001, 101, 'SHIPPER', 'PUBLISHED', 1),
          (1001, 102, 'CONSIGNEE', 'DRAFT', 1),
          (1002, 102, 'CONSIGNEE', 'DRAFT', 1),
          (1003, 100, 'OVERSEA_AGENT', 'DRAFT', 1),
          (1003, 200, 'OVERSEA_AGENT', 'DRAFT', 1),
          (1004, 103, 'SHIPPER', 'PUBLISHED', 1)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_oversea_agent_shipment_follows (
          oversea_agent_customer_id, shipment_id
        ) VALUES (100, 1002)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_oversea_agent_shipment_scopes (
          shipment_id, oversea_agent_customer_id, represented_customer_id,
          status, assigned_by
        ) VALUES
          (1001, 100, 101, 'ACTIVE', 1),
          (1001, 100, 102, 'ACTIVE', 1),
          (1002, 100, 102, 'ACTIVE', 1)
        """
    );

    CustomerPrincipal agent = new CustomerPrincipal(
        100, "agent-100", "agent-100", "Agent 100", "OVERSEA_AGENT", "ACTIVE"
    );
    ObjectNode allShipments = service.listAssignedSnapshots(agent, 1, 20);

    assertThat(allShipments.path("total").asLong()).isEqualTo(2L);
    assertThat(allShipments.path("availableCustomers").findValuesAsText("clientCode"))
        .containsExactly("CLIENT-101", "CLIENT-102");
    assertThat(allShipments.path("items").findValuesAsText("shipmentId"))
        .containsExactlyInAnyOrder("linked-shipment-1", "linked-shipment-2");
    assertThat(allShipments.path("items").findValuesAsText("shipmentId"))
        .doesNotContain("agent-own-shipment", "unrelated-shipment");

    ObjectNode customer101Shipments = service.listAssignedSnapshots(
        agent, 1, 20, false, "customer-101"
    );
    assertThat(customer101Shipments.path("total").asLong()).isEqualTo(1L);
    assertThat(customer101Shipments.path("items").get(0).path("boundCustomers").get(0)
        .path("clientCode").asText()).isEqualTo("CLIENT-101");

    ObjectNode customer102Shipments = service.listAssignedSnapshots(
        agent, 1, 20, false, "customer-102"
    );
    assertThat(customer102Shipments.path("total").asLong()).isEqualTo(2L);
    assertThatThrownBy(() -> service.listAssignedSnapshots(
        agent, 1, 20, false, "customer-103"
    )).isInstanceOfSatisfying(ApiException.class, error ->
        assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN)
    );
    assertThat(customer102Shipments.path("items").findValuesAsText("shipmentId"))
        .containsExactlyInAnyOrder("linked-shipment-1", "linked-shipment-2");
    assertThatThrownBy(() -> service.refreshOverseaAgentAssignedShipment(
        "linked-shipment-2", null, agent
    )).isInstanceOfSatisfying(ApiException.class, error ->
        assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT)
    );
    assertThatThrownBy(() -> service.refreshOverseaAgentAssignedShipment(
        "linked-shipment-2", "customer-101", agent
    )).isInstanceOfSatisfying(ApiException.class, error ->
        assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN)
    );

    ObjectNode followedShipments =
        service.listAssignedSnapshots(agent, 1, 20, true);
    assertThat(followedShipments.path("total").asLong()).isEqualTo(1L);
    assertThat(followedShipments.path("items").get(0).path("shipmentId").asText())
        .isEqualTo("linked-shipment-2");
    assertThat(followedShipments.path("items").get(0).path("followed").asBoolean())
        .isTrue();

    CustomerPrincipal unlinkedAgent = new CustomerPrincipal(
        200, "agent-200", "agent-200", "Agent 200", "OVERSEA_AGENT", "ACTIVE"
    );
    assertThat(service.listAssignedSnapshots(unlinkedAgent, 1, 20).path("total").asLong())
        .isZero();
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
  void bookingTrackReusesExistingCoscoNumericBillShellInsteadOfCreatingDuplicate()
      throws Exception {
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipments (
          public_id, carrier_code, tracking_status, created_by, responsible_agent_id,
          created_at, updated_at
        ) VALUES ('existing-bill-shell', 'COSCO', NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
    );
    Long shipmentId = jdbcTemplate.queryForObject(
        "SELECT id FROM cp_shipments WHERE public_id = 'existing-bill-shell'", Long.class
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_references (
          shipment_id, carrier_code, reference_type, reference_no_raw,
          reference_no_normalized, primary_reference
        ) VALUES (?, 'COSCO', 'BILLOFLADING', '9508245590', '9508245590', TRUE)
        """,
        shipmentId
    );
    NormalizedTrackRequest normalized = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "9508245590"
    );
    when(adapterClient.track(normalized)).thenReturn(objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:00:00Z",
            "tracking": {"type": "BOOKING", "number": "9508245590"},
            "summary": {
              "bookingNumbers": ["9508245590"],
              "latestEvent": {"name": "EIR Printed"}
            },
            "containers": []
          },
          "cached": false
        }
        """));

    ObjectNode response = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "9508245590", false),
        employee
    );

    assertThat(response.path("shipmentId").asText()).isEqualTo("existing-bill-shell");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipments", Integer.class
    )).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_references WHERE shipment_id = ?", Integer.class,
        shipmentId
    )).isEqualTo(2);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_tracking_snapshots WHERE shipment_id = ?", Integer.class,
        shipmentId
    )).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT current_snapshot_id FROM cp_shipments WHERE id = ?", Long.class, shipmentId
    )).isNotNull();
    verify(adapterClient).track(normalized);
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
        "COSCO", "AUTO", "BOOKING", "BK-10001", taskId
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
        shipmentId, "BK-10001", taskId, business
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
  void loadsAndPersistsSupplementalTransportAndBookingDetails() throws Exception {
    ObjectNode parent = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        business
    );
    String shipmentId = parent.path("shipmentId").asText();
    NormalizedTrackRequest request = new NormalizedTrackRequest(
        "COSCO", "NETWORK", "BOOKING", "BK-10001"
    );
    when(adapterClient.loadSupplementalDetails(request)).thenReturn(objectMapper.readTree("""
        {
          "fetchedAt": "2026-07-16T10:02:00Z",
          "partial": false,
          "containers": [{
            "number": "FBIU4832780",
            "transportMode": "Truck",
            "trafficTerm": "CY | CY",
            "currentLocation": "Shanghai Coscon Logistics Lin Gang",
            "latestEvent": "Empty pickup",
            "latestEventTime": "2026-07-16T07:49:00"
          }],
          "references": {
            "external": ["REF-1", "REF-1"],
            "business": {},
            "information": [
              {"name": "POL", "value": "Old value", "sequence": 1},
              {"name": "POL", "value": "Shanghai-Shanghai Shengdong (I), Yangshan", "sequence": 1},
              {"name": "POD", "value": "Long Beach-Pacific Container Terminal", "sequence": 2}
            ]
          }
        }
        """));

    ObjectNode result = service.loadSupplementalDetails(
        shipmentId,
        new ShipmentTrackRequest("COSCO", "NETWORK", "BOOKING", "BK-10001", false),
        business
    );

    assertThat(result.path("databaseStored").asBoolean()).isTrue();
    assertThat(result.path("snapshot").path("containers")).hasSize(2);
    assertThat(result.path("snapshot").path("references").path("external")).hasSize(1);
    assertThat(result.path("snapshot").path("references").path("information")).hasSize(2);
    assertThat(result.path("snapshot").path("references").path("information").get(0)
        .path("value").asText()).isEqualTo("Shanghai-Shanghai Shengdong (I), Yangshan");
    assertThat(result.path("snapshot").path("supplementalDetails").path("containerCount").asInt())
        .isEqualTo(2);
    verify(adapterClient).loadSupplementalDetails(request);
  }

  @Test
  void batchMainRefreshCarriesForwardOlderSupplementalDataAsStalePending()
      throws Exception {
    ObjectNode parent = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        business
    );
    String shipmentId = parent.path("shipmentId").asText();
    NormalizedTrackRequest supplementalRequest = new NormalizedTrackRequest(
        "COSCO", "NETWORK", "BOOKING", "BK-10001"
    );
    when(adapterClient.loadSupplementalDetails(supplementalRequest)).thenReturn(
        objectMapper.readTree("""
            {
              "fetchedAt": "2026-07-16T10:02:00Z",
              "partial": false,
              "containers": [{
                "number": "FBIU4832780",
                "latestEvent": "Discharged at Last POD",
                "latestEventTime": "2026-08-01T15:38:00Z"
              }],
              "references": {
                "external": ["REF-OLD"],
                "business": {"clientPoNumber": "PO-OLD"},
                "information": [{"name": "POD", "value": "Long Beach", "sequence": 1}]
              }
            }
            """
        )
    );
    service.loadSupplementalDetails(
        shipmentId,
        new ShipmentTrackRequest("COSCO", "NETWORK", "BOOKING", "BK-10001", false),
        business
    );

    String taskId = "batch_1234567890abcdef";
    NormalizedTrackRequest batchRequest = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "BK-10001", taskId
    );
    when(adapterClient.track(batchRequest, true)).thenReturn(objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-08-08T10:00:00Z",
            "tracking": {"type": "BOOKING", "number": "BK-10001"},
            "summary": {
              "bookingNumbers": ["BK-10001"],
              "latestEvent": {"name": "Empty returned"}
            },
            "route": [{"sequence": 1, "city": "Long Beach", "actualTime": "2026-08-07T20:24:00Z"}],
            "containers": [],
            "references": {"external": [], "business": {}, "information": []}
          },
          "strategy": {"requested": "AUTO", "used": "NETWORK"}
        }
        """));

    ObjectNode refreshed = service.track(
        new ShipmentTrackRequest(
            "COSCO", "AUTO", "BOOKING", "BK-10001", true, null, taskId
        ),
        business
    );

    JsonNode snapshot = refreshed.path("snapshot");
    assertThat(snapshot.path("summary").path("latestEvent").path("name").asText())
        .isEqualTo("Empty returned");
    assertThat(snapshot.path("containers").findValuesAsText("number"))
        .contains("FBIU4832780");
    assertThat(snapshot.path("references").path("external").get(0).asText())
        .isEqualTo("REF-OLD");
    assertThat(snapshot.path("supplementalDetails").path("carriedForward").asBoolean())
        .isTrue();
    assertThat(snapshot.path("supplementalDetails").path("pendingRefresh").asBoolean())
        .isTrue();
    assertThat(snapshot.path("supplementalDetails").path("partial").asBoolean())
        .isTrue();
  }

  @Test
  void automaticMainRefreshPreservesOlderSupplementalDataWhenEnrichmentIsPartial()
      throws Exception {
    ObjectNode initial = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        business
    );
    String shipmentId = initial.path("shipmentId").asText();
    NormalizedTrackRequest supplementalRequest = new NormalizedTrackRequest(
        "COSCO", "NETWORK", "BOOKING", "BK-10001"
    );
    when(adapterClient.loadSupplementalDetails(supplementalRequest)).thenReturn(
        objectMapper.readTree("""
            {
              "partial": false,
              "containers": [{
                "number":"CSNU1234567",
                "latestEvent":"Discharged at Last POD",
                "latestEventTime":"2026-08-01T15:38:00Z"
              }],
              "references": {"external":[],"business":{},"information":[]}
            }
            """
        )
    );
    service.loadSupplementalDetails(
        shipmentId,
        new ShipmentTrackRequest("COSCO", "NETWORK", "BOOKING", "BK-10001", false),
        business
    );
    NormalizedTrackRequest request = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "BK-10001"
    );
    ObjectNode firstPartial = (ObjectNode) objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-08-08T10:00:00Z",
            "tracking": {"type": "BOOKING", "number": "BK-10001"},
            "summary": {
              "bookingNumbers": ["BK-10001"],
              "latestEvent": {"name": "Discharged"}
            },
            "route": [{"sequence": 1, "city": "Long Beach"}],
            "containers": [{"number":"CSNU1234567","transportMode":"Vessel"}]
          },
          "enrichment": {
            "partial": true,
            "warning": {
              "code": "COSCO_UPSTREAM_BLOCKED",
              "message": "COSCO temporarily rejected this outbound IP"
            }
          },
          "strategy": {"requested": "AUTO", "used": "NETWORK"}
        }
        """);
    ObjectNode secondPartial = firstPartial.deepCopy();
    ((ObjectNode) secondPartial.path("snapshot")).put("fetchedAt", "2026-08-09T10:00:00Z");
    when(adapterClient.track(request, true)).thenReturn(firstPartial, secondPartial);

    ObjectNode refreshed = service.refreshAutomatically("COSCO", "BOOKING", "BK-10001");
    ObjectNode refreshedAgain = service.refreshAutomatically("COSCO", "BOOKING", "BK-10001");

    assertThat(refreshed.path("snapshot").path("summary").path("latestEvent")
        .path("name").asText()).isEqualTo("Discharged");
    assertThat(refreshed.path("snapshot").path("containers").findValuesAsText("number"))
        .contains("CSNU1234567");
    assertThat(refreshed.path("snapshot").path("containers").get(0)
        .path("transportMode").asText()).isEqualTo("Vessel");
    assertThat(refreshed.path("snapshot").path("containers").get(0)
        .path("latestEvent").asText()).isEqualTo("Discharged at Last POD");
    assertThat(refreshed.path("snapshot").path("supplementalDetails")
        .path("carriedForward").asBoolean()).isTrue();
    assertThat(refreshed.path("snapshot").path("supplementalDetails")
        .path("pendingRefresh").asBoolean()).isTrue();
    assertThat(refreshed.path("snapshot").path("supplementalDetails")
        .path("sourceFetchedAt").asText()).isEqualTo("2026-07-16T10:01:00Z");
    assertThat(refreshedAgain.path("snapshot").path("supplementalDetails")
        .path("sourceFetchedAt").asText()).isEqualTo("2026-07-16T10:01:00Z");
  }

  @Test
  void concurrentSupplementalMergesAcrossServiceInstancesPreserveBothResults()
      throws Exception {
    ObjectNode parent = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        business
    );
    String shipmentId = parent.path("shipmentId").asText();
    TrackingAdapterClient competingAdapter = mock(TrackingAdapterClient.class);
    ShipmentTrackingProperties properties = new ShipmentTrackingProperties();
    properties.setCacheTtl(Duration.ofMinutes(15));
    ShipmentTrackingService competingService = new ShipmentTrackingService(
        jdbcTemplate,
        objectMapper,
        competingAdapter,
        cmaTrackingSessionService,
        new ShipmentAccessService(jdbcTemplate),
        properties,
        new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
        Clock.fixed(Instant.parse("2026-07-16T10:01:00Z"), ZoneOffset.UTC)
    );
    NormalizedTrackRequest firstRequest = new NormalizedTrackRequest(
        "COSCO", "NETWORK", "BOOKING", "BK-10001"
    );
    NormalizedTrackRequest secondRequest = new NormalizedTrackRequest(
        "COSCO", "PROXY", "BOOKING", "BK-10001"
    );
    JsonNode firstDetails = objectMapper.readTree("""
        {
          "partial": false,
          "containers": [{"number":"AAAA1234567","latestEvent":"Loaded"}],
          "references": {"external":["REF-A"],"business":{},"information":[]}
        }
        """);
    JsonNode secondDetails = objectMapper.readTree("""
        {
          "partial": false,
          "containers": [{"number":"BBBB1234567","latestEvent":"Discharged"}],
          "references": {"external":["REF-B"],"business":{},"information":[]}
        }
        """);
    CountDownLatch adaptersReady = new CountDownLatch(2);
    CountDownLatch releaseAdapters = new CountDownLatch(1);
    when(adapterClient.loadSupplementalDetails(firstRequest)).thenAnswer(invocation -> {
      adaptersReady.countDown();
      releaseAdapters.await(2, TimeUnit.SECONDS);
      return firstDetails;
    });
    when(competingAdapter.loadSupplementalDetails(secondRequest)).thenAnswer(invocation -> {
      adaptersReady.countDown();
      releaseAdapters.await(2, TimeUnit.SECONDS);
      return secondDetails;
    });

    ExecutorService workers = Executors.newFixedThreadPool(2);
    try {
      var first = workers.submit(() -> service.loadSupplementalDetails(
          shipmentId,
          new ShipmentTrackRequest("COSCO", "NETWORK", "BOOKING", "BK-10001", false),
          business
      ));
      var second = workers.submit(() -> competingService.loadSupplementalDetails(
          shipmentId,
          new ShipmentTrackRequest("COSCO", "PROXY", "BOOKING", "BK-10001", false),
          business
      ));
      assertThat(adaptersReady.await(2, TimeUnit.SECONDS)).isTrue();
      releaseAdapters.countDown();
      first.get(5, TimeUnit.SECONDS);
      second.get(5, TimeUnit.SECONDS);
    } finally {
      workers.shutdownNow();
    }

    JsonNode stored = objectMapper.readTree(jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots "
            + "WHERE id = (SELECT current_snapshot_id FROM cp_shipments WHERE public_id = ?)",
        String.class,
        shipmentId
    ));
    assertThat(stored.path("containers").findValuesAsText("number"))
        .contains("AAAA1234567", "BBBB1234567");
    List<String> externalReferences = new java.util.ArrayList<>();
    stored.path("references").path("external")
        .forEach(value -> externalReferences.add(value.asText()));
    assertThat(externalReferences).contains("REF-A", "REF-B");
    String storedJson = stored.toString();
    String storedHash = jdbcTemplate.queryForObject(
        "SELECT payload_sha256 FROM cp_tracking_snapshots "
            + "WHERE id = (SELECT current_snapshot_id FROM cp_shipments WHERE public_id = ?)",
        String.class,
        shipmentId
    );
    String expectedHash = java.util.HexFormat.of().formatHex(
        java.security.MessageDigest.getInstance("SHA-256")
            .digest(storedJson.getBytes(java.nio.charset.StandardCharsets.UTF_8))
    );
    assertThat(storedHash).isEqualTo(expectedHash);
  }

  @Test
  void olderSupplementalResponseCannotOverwriteANewerCommittedResponse()
      throws Exception {
    ObjectNode parent = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        business
    );
    String shipmentId = parent.path("shipmentId").asText();
    TrackingAdapterClient newerAdapter = mock(TrackingAdapterClient.class);
    ShipmentTrackingProperties properties = new ShipmentTrackingProperties();
    properties.setCacheTtl(Duration.ofMinutes(15));
    ShipmentTrackingService newerService = new ShipmentTrackingService(
        jdbcTemplate,
        objectMapper,
        newerAdapter,
        cmaTrackingSessionService,
        new ShipmentAccessService(jdbcTemplate),
        properties,
        new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
        Clock.fixed(Instant.parse("2026-07-16T10:02:00Z"), ZoneOffset.UTC)
    );
    NormalizedTrackRequest olderRequest = new NormalizedTrackRequest(
        "COSCO", "NETWORK", "BOOKING", "BK-10001"
    );
    NormalizedTrackRequest newerRequest = new NormalizedTrackRequest(
        "COSCO", "PROXY", "BOOKING", "BK-10001"
    );
    JsonNode olderDetails = objectMapper.readTree("""
        {
          "fetchedAt":"2026-07-16T10:01:30Z",
          "partial":false,
          "containers":[{"number":"AAAA1234567","latestEvent":"Loaded"}],
          "references":{"external":[],"business":{},"information":[]}
        }
        """);
    JsonNode newerDetails = objectMapper.readTree("""
        {
          "fetchedAt":"2026-07-16T10:02:30Z",
          "partial":false,
          "containers":[{"number":"AAAA1234567","latestEvent":"Discharged"}],
          "references":{"external":[],"business":{},"information":[]}
        }
        """);
    CountDownLatch olderRequestStarted = new CountDownLatch(1);
    CountDownLatch releaseOlderResponse = new CountDownLatch(1);
    when(adapterClient.loadSupplementalDetails(olderRequest)).thenAnswer(invocation -> {
      olderRequestStarted.countDown();
      releaseOlderResponse.await(5, TimeUnit.SECONDS);
      return olderDetails;
    });
    when(newerAdapter.loadSupplementalDetails(newerRequest)).thenReturn(newerDetails);

    ExecutorService worker = Executors.newSingleThreadExecutor();
    try {
      var olderResult = worker.submit(() -> service.loadSupplementalDetails(
          shipmentId,
          new ShipmentTrackRequest("COSCO", "NETWORK", "BOOKING", "BK-10001", false),
          business
      ));
      assertThat(olderRequestStarted.await(2, TimeUnit.SECONDS)).isTrue();
      ObjectNode newerResult = newerService.loadSupplementalDetails(
          shipmentId,
          new ShipmentTrackRequest("COSCO", "PROXY", "BOOKING", "BK-10001", false),
          business
      );
      assertThat(newerResult.path("databaseStored").asBoolean()).isTrue();
      releaseOlderResponse.countDown();
      ObjectNode supersededResult = olderResult.get(5, TimeUnit.SECONDS);
      assertThat(supersededResult.path("superseded").asBoolean()).isTrue();
      assertThat(supersededResult.path("databaseStored").asBoolean()).isFalse();
    } finally {
      releaseOlderResponse.countDown();
      worker.shutdownNow();
    }

    JsonNode stored = objectMapper.readTree(jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots "
            + "WHERE id = (SELECT current_snapshot_id FROM cp_shipments WHERE public_id = ?)",
        String.class,
        shipmentId
    ));
    JsonNode container = stored.path("containers").findValue("latestEvent");
    assertThat(container.asText()).isEqualTo("Discharged");
    assertThat(stored.path("supplementalDetails").path("lastSuccessfulAt").asText())
        .isEqualTo("2026-07-16T10:02:30Z");
    assertThat(stored.path("supplementalDetails").path("lastAppliedRequestStartedAt").asText())
        .isEqualTo("2026-07-16T10:02:00Z");
  }

  @Test
  void mainCarryForwardKeepsTheBarrierAgainstAnOlderSupplementalResponse()
      throws Exception {
    ObjectNode parent = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        business
    );
    String shipmentId = parent.path("shipmentId").asText();
    ShipmentTrackingProperties properties = new ShipmentTrackingProperties();
    properties.setCacheTtl(Duration.ofMinutes(15));
    TrackingAdapterClient mainAdapter = mock(TrackingAdapterClient.class);
    ShipmentTrackingService mainService = new ShipmentTrackingService(
        jdbcTemplate, objectMapper, mainAdapter, cmaTrackingSessionService,
        new ShipmentAccessService(jdbcTemplate), properties,
        new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
        Clock.fixed(Instant.parse("2026-07-16T10:02:00Z"), ZoneOffset.UTC)
    );
    TrackingAdapterClient olderAdapter = mock(TrackingAdapterClient.class);
    ShipmentTrackingService olderService = new ShipmentTrackingService(
        jdbcTemplate, objectMapper, olderAdapter, cmaTrackingSessionService,
        new ShipmentAccessService(jdbcTemplate), properties,
        new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
        Clock.fixed(Instant.parse("2026-07-16T10:03:00Z"), ZoneOffset.UTC)
    );
    TrackingAdapterClient newerAdapter = mock(TrackingAdapterClient.class);
    ShipmentTrackingService newerService = new ShipmentTrackingService(
        jdbcTemplate, objectMapper, newerAdapter, cmaTrackingSessionService,
        new ShipmentAccessService(jdbcTemplate), properties,
        new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
        Clock.fixed(Instant.parse("2026-07-16T10:04:00Z"), ZoneOffset.UTC)
    );
    NormalizedTrackRequest olderRequest = new NormalizedTrackRequest(
        "COSCO", "NETWORK", "BOOKING", "BK-10001"
    );
    NormalizedTrackRequest newerRequest = new NormalizedTrackRequest(
        "COSCO", "PROXY", "BOOKING", "BK-10001"
    );
    NormalizedTrackRequest mainRequest = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "BK-10001"
    );
    JsonNode olderDetails = objectMapper.readTree("""
        {
          "fetchedAt":"2026-07-16T10:03:30Z",
          "partial":false,
          "containers":[{"number":"AAAA1234567","latestEvent":"Loaded"}],
          "references":{"external":[],"business":{},"information":[]}
        }
        """);
    JsonNode newerDetails = objectMapper.readTree("""
        {
          "fetchedAt":"2026-07-16T10:04:30Z",
          "partial":false,
          "containers":[{"number":"AAAA1234567","latestEvent":"Discharged"}],
          "references":{"external":["REF-NEW"],"business":{},"information":[]}
        }
        """);
    JsonNode mainResponse = objectMapper.readTree("""
        {
          "snapshot":{
            "channel":"NETWORK",
            "fetchedAt":"2026-07-16T10:02:30Z",
            "tracking":{"type":"BOOKING","number":"BK-10001"},
            "summary":{"bookingNumbers":["BK-10001"],"latestEvent":{"name":"In transit"}},
            "route":[{"sequence":1,"city":"Long Beach"}],
            "containers":[{"number":"AAAA1234567","latestEvent":"Discharged"}],
            "references":{"external":["REF-NEW"],"business":{},"information":[]}
          },
          "enrichment":{
            "partial":true,
            "warning":{"code":"COSCO_UPSTREAM_BLOCKED","message":"supplement delayed"}
          },
          "strategy":{"requested":"AUTO","used":"NETWORK"}
        }
        """);
    CountDownLatch mainRequestStarted = new CountDownLatch(1);
    CountDownLatch releaseMainResponse = new CountDownLatch(1);
    CountDownLatch olderRequestStarted = new CountDownLatch(1);
    CountDownLatch releaseOlderResponse = new CountDownLatch(1);
    when(mainAdapter.track(mainRequest, true)).thenAnswer(invocation -> {
      mainRequestStarted.countDown();
      releaseMainResponse.await(5, TimeUnit.SECONDS);
      return mainResponse;
    });
    when(olderAdapter.loadSupplementalDetails(olderRequest)).thenAnswer(invocation -> {
      olderRequestStarted.countDown();
      releaseOlderResponse.await(5, TimeUnit.SECONDS);
      return olderDetails;
    });
    when(newerAdapter.loadSupplementalDetails(newerRequest)).thenReturn(newerDetails);

    ExecutorService workers = Executors.newFixedThreadPool(2);
    try {
      var mainResult = workers.submit(
          () -> mainService.refreshAutomatically("COSCO", "BOOKING", "BK-10001")
      );
      assertThat(mainRequestStarted.await(2, TimeUnit.SECONDS)).isTrue();
      var olderResult = workers.submit(() -> olderService.loadSupplementalDetails(
          shipmentId,
          new ShipmentTrackRequest("COSCO", "NETWORK", "BOOKING", "BK-10001", false),
          business
      ));
      assertThat(olderRequestStarted.await(2, TimeUnit.SECONDS)).isTrue();
      newerService.loadSupplementalDetails(
          shipmentId,
          new ShipmentTrackRequest("COSCO", "PROXY", "BOOKING", "BK-10001", false),
          business
      );
      releaseMainResponse.countDown();
      ObjectNode refreshed = mainResult.get(5, TimeUnit.SECONDS);
      assertThat(refreshed.path("snapshot").path("containers").findValuesAsText("number"))
          .contains("AAAA1234567");
      releaseOlderResponse.countDown();
      assertThat(olderResult.get(5, TimeUnit.SECONDS).path("superseded").asBoolean()).isTrue();
    } finally {
      releaseMainResponse.countDown();
      releaseOlderResponse.countDown();
      workers.shutdownNow();
    }

    JsonNode stored = objectMapper.readTree(jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots "
            + "WHERE id = (SELECT current_snapshot_id FROM cp_shipments WHERE public_id = ?)",
        String.class,
        shipmentId
    ));
    assertThat(stored.path("containers").findValue("latestEvent").asText())
        .isEqualTo("Discharged");
    assertThat(stored.path("supplementalDetails").path("lastAppliedRequestStartedAt").asText())
        .isEqualTo("2026-07-16T10:04:00Z");
  }

  @Test
  void supplementalMergeRollsBackSnapshotAndShipmentWhenEventPublicationFails()
      throws Exception {
    ObjectNode parent = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        business
    );
    String shipmentId = parent.path("shipmentId").asText();
    Map<String, Object> before = jdbcTemplate.queryForMap(
        """
        SELECT t.snapshot_json, t.payload_sha256, s.updated_at
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE s.public_id = ?
        """,
        shipmentId
    );
    TrackingAdapterClient failingAdapter = mock(TrackingAdapterClient.class);
    NormalizedTrackRequest request = new NormalizedTrackRequest(
        "COSCO", "NETWORK", "BOOKING", "BK-10001"
    );
    when(failingAdapter.loadSupplementalDetails(request)).thenReturn(objectMapper.readTree("""
        {
          "partial":false,
          "containers":[{"number":"ROLL1234567","latestEvent":"Loaded"}],
          "references":{"external":["REF-ROLLBACK"],"business":{},"information":[]}
        }
        """));
    ShipmentTrackingProperties properties = new ShipmentTrackingProperties();
    ShipmentTrackingService failingService = new ShipmentTrackingService(
        jdbcTemplate,
        objectMapper,
        failingAdapter,
        cmaTrackingSessionService,
        new ShipmentAccessService(jdbcTemplate),
        properties,
        new DataSourceTransactionManager(jdbcTemplate.getDataSource()),
        event -> {
          throw new IllegalStateException("event publication failed");
        }
    );

    assertThatThrownBy(() -> failingService.loadSupplementalDetails(
        shipmentId,
        new ShipmentTrackRequest("COSCO", "NETWORK", "BOOKING", "BK-10001", false),
        business
    )).isInstanceOf(IllegalStateException.class)
        .hasMessage("event publication failed");

    Map<String, Object> after = jdbcTemplate.queryForMap(
        """
        SELECT t.snapshot_json, t.payload_sha256, s.updated_at
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE s.public_id = ?
        """,
        shipmentId
    );
    assertThat(after).isEqualTo(before);
  }

  @Test
  void mainRefreshCarriesForwardSupplementalDataCommittedWhileCarrierCallWasInFlight()
      throws Exception {
    ObjectNode parent = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        business
    );
    String shipmentId = parent.path("shipmentId").asText();
    TrackingAdapterClient competingAdapter = mock(TrackingAdapterClient.class);
    ShipmentTrackingProperties properties = new ShipmentTrackingProperties();
    properties.setCacheTtl(Duration.ofMinutes(15));
    ShipmentTrackingService competingService = new ShipmentTrackingService(
        jdbcTemplate,
        objectMapper,
        competingAdapter,
        cmaTrackingSessionService,
        new ShipmentAccessService(jdbcTemplate),
        properties,
        new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
        Clock.fixed(Instant.parse("2026-07-16T10:01:00Z"), ZoneOffset.UTC)
    );
    NormalizedTrackRequest forceRequest = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "BK-10001"
    );
    JsonNode mainResponse = objectMapper.readTree("""
        {
          "snapshot": {
            "channel": "NETWORK",
            "fetchedAt": "2026-08-08T10:00:00Z",
            "tracking": {"type": "BOOKING", "number": "BK-10001"},
            "summary": {
              "bookingNumbers": ["BK-10001"],
              "latestEvent": {"name": "Discharged"}
            },
            "route": [{"sequence":1,"city":"Long Beach"}],
            "containers": [],
            "references": {"external":[],"business":{},"information":[]}
          },
          "enrichment": {
            "partial": true,
            "warning": {"code":"COSCO_UPSTREAM_BLOCKED","message":"supplement delayed"}
          },
          "strategy": {"requested":"AUTO","used":"NETWORK"}
        }
        """);
    CountDownLatch mainCarrierCallStarted = new CountDownLatch(1);
    CountDownLatch releaseMainCarrierCall = new CountDownLatch(1);
    when(adapterClient.track(forceRequest, true)).thenAnswer(invocation -> {
      mainCarrierCallStarted.countDown();
      releaseMainCarrierCall.await(5, TimeUnit.SECONDS);
      return mainResponse;
    });
    NormalizedTrackRequest supplementalRequest = new NormalizedTrackRequest(
        "COSCO", "PROXY", "BOOKING", "BK-10001"
    );
    when(competingAdapter.loadSupplementalDetails(supplementalRequest)).thenReturn(
        objectMapper.readTree("""
            {
              "partial": false,
              "containers": [{
                "number":"NEWS1234567",
                "latestEvent":"Discharged at Last POD",
                "latestEventTime":"2026-08-08T09:30:00Z"
              }],
              "references": {
                "external":["REF-LATEST"],
                "business":{},
                "information":[{"name":"POD","value":"Long Beach","sequence":1}]
              }
            }
            """
        )
    );

    ExecutorService worker = Executors.newSingleThreadExecutor();
    try {
      var mainRefresh = worker.submit(
          () -> service.refreshAutomatically("COSCO", "BOOKING", "BK-10001")
      );
      assertThat(mainCarrierCallStarted.await(2, TimeUnit.SECONDS)).isTrue();
      competingService.loadSupplementalDetails(
          shipmentId,
          new ShipmentTrackRequest("COSCO", "PROXY", "BOOKING", "BK-10001", false),
          business
      );
      releaseMainCarrierCall.countDown();
      ObjectNode refreshed = mainRefresh.get(5, TimeUnit.SECONDS);

      assertThat(refreshed.path("snapshot").path("containers").findValuesAsText("number"))
          .contains("NEWS1234567");
      List<String> externalReferences = new java.util.ArrayList<>();
      refreshed.path("snapshot").path("references").path("external")
          .forEach(value -> externalReferences.add(value.asText()));
      assertThat(externalReferences).contains("REF-LATEST");
      assertThat(refreshed.path("snapshot").path("supplementalDetails")
          .path("carriedForward").asBoolean()).isTrue();
    } finally {
      releaseMainCarrierCall.countDown();
      worker.shutdownNow();
    }
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
  void batchForceRefreshNeverReturnsAStaleSnapshotAsSuccess() throws Exception {
    ObjectNode first = service.track(
        new ShipmentTrackRequest("COSCO", "AUTO", "BOOKING", "BK-10001", false),
        employee
    );
    String taskId = "batch_1234567890abcdef";
    NormalizedTrackRequest normalized = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "BK-10001", taskId
    );
    when(adapterClient.track(normalized, true)).thenThrow(new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "COSCO_UPSTREAM_BLOCKED",
        "COSCO temporarily rejected this outbound IP",
        900_000L,
        Map.of("route", "DIRECT", "upstreamStatus", 403)
    ));

    assertThatThrownBy(() -> service.track(
        new ShipmentTrackRequest(
            "COSCO", "AUTO", "BOOKING", "BK-10001", true, null, taskId
        ),
        business
    )).isInstanceOfSatisfying(ApiException.class, error -> {
      assertThat(error.code()).isEqualTo("COSCO_UPSTREAM_BLOCKED");
      assertThat(error.details()).containsEntry("fallbackSource", "MYSQL_STALE");
      assertThat(error.details()).containsEntry("stale", true);
      assertThat(error.details()).containsEntry(
          "snapshotFetchedAt", first.path("fetchedAt").asText()
      );
    });
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
        "row-1", null, "BOOKING", "784-84422343",
        "784-84422343 空运", true, firstDetails
    );

    ObjectNode first = service.recordImportedPlaceholder(firstRequest, business);

    assertThat(first.path("created").asBoolean()).isTrue();
    String storedJson = jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots", String.class
    );
    JsonNode stored = objectMapper.readTree(storedJson);
    assertThat(stored.path("extraInformation").findValuesAsText("key"))
        .doesNotContain("forwarderJobNumber", "clientNameCode");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT job_number FROM cp_shipments", String.class
    )).isEqualTo("LJSH26060018");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT client_name_code FROM cp_shipments", String.class
    )).isEqualTo("Hayden US");
    assertThat(stored.path("extraInformation").findValuesAsText("name")).isEmpty();

    ShipmentImportDetails secondDetails = new ShipmentImportDetails(
        null, "784-84422343", "LJSH26060018-UPDATED", "CZ5221 / 22059.74-100",
        "SHA", "IAH", "HW202600059", "6-Jun-26", "11-Jun-26", "AIR", "Hayden US"
    );
    ObjectNode second = service.recordImportedPlaceholder(
        new ShipmentBatchItemRequest(
            "row-1", null, "BOOKING", "784-84422343",
            "784-84422343 空运", true, secondDetails
        ),
        business
    );
    assertThat(second.path("created").asBoolean()).isFalse();
    assertThat(second.path("updated").asBoolean()).isTrue();
    assertThat(second.path("unchanged").asBoolean()).isFalse();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipments", Integer.class
    )).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_tracking_snapshots", Integer.class
    )).isEqualTo(1);
    JsonNode merged = objectMapper.readTree(jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots", String.class
    ));
    assertThat(merged.path("extraInformation").findValuesAsText("value"))
        .contains("CZ5221 / 22059.74-100");
    assertThat(merged.toString()).doesNotContain("LJSH26060018-UPDATED");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT job_number FROM cp_shipments", String.class
    )).isEqualTo("LJSH26060018-UPDATED");

    ObjectNode unchanged = service.recordImportedPlaceholder(
        new ShipmentBatchItemRequest(
            "row-1", null, "BOOKING", "784-84422343",
            "784-84422343 绌鸿繍", true, secondDetails
        ),
        business
    );
    assertThat(unchanged.path("updated").asBoolean()).isFalse();
    assertThat(unchanged.path("unchanged").asBoolean()).isTrue();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots", String.class
    )).isEqualTo(merged.toString());

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
            "row-punctuation", "UNSUPPORTED", "BOOKING", "ABC/123.45",
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
        "race-row", "UNSUPPORTED", "BOOKING", "RACE/123.45",
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

  @Test
  void forcedRefreshInvalidatesEmptyShellAndPointsShipmentAtNewSnapshot() throws Exception {
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipments (
          public_id, carrier_code, tracking_status, created_by, responsible_agent_id,
          created_at, updated_at
        ) VALUES ('shell-shipment', 'COSCO', 'Needs review', 2, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
    );
    Long shipmentId = jdbcTemplate.queryForObject(
        "SELECT id FROM cp_shipments WHERE public_id = 'shell-shipment'", Long.class
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_references (
          shipment_id, carrier_code, reference_type, reference_no_raw,
          reference_no_normalized, primary_reference
        ) VALUES (?, 'COSCO', 'BILLOFLADING', 'COSU6502406170', 'COSU6502406170', TRUE)
        """,
        shipmentId
    );
    String shellJson = "{\"provider\":{\"code\":\"COSCO\"},\"tracking\":{\"status\":\"EMPTY\"}}";
    jdbcTemplate.update(
        """
        INSERT INTO cp_tracking_snapshots (
          shipment_id, query_reference_type, query_reference_no, queried_by,
          queried_by_username, source_channel, snapshot_json, payload_sha256,
          fetched_at, fresh_until, created_at
        ) VALUES (?, 'BILLOFLADING', 'COSU6502406170', 2, 'business', 'NETWORK', ?,
                  ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        shipmentId, shellJson, "0".repeat(64)
    );
    Long shellSnapshotId = jdbcTemplate.queryForObject(
        "SELECT id FROM cp_tracking_snapshots WHERE shipment_id = ?", Long.class, shipmentId
    );
    jdbcTemplate.update(
        "UPDATE cp_shipments SET current_snapshot_id = ? WHERE id = ?",
        shellSnapshotId, shipmentId
    );

    NormalizedTrackRequest normalized = new NormalizedTrackRequest(
        "COSCO", "AUTO", "BOOKING", "6502406170"
    );
    when(adapterClient.track(normalized, true)).thenReturn(objectMapper.readTree("""
        {
          "snapshot": {
            "provider": {"code": "COSCO"},
            "channel": "NETWORK",
            "fetchedAt": "2026-07-16T10:05:00Z",
            "tracking": {"type": "BOOKING", "number": "6502406170"},
            "summary": {
              "billOfLading": "6502406170",
              "origin": {"name": "Shanghai"},
              "destination": {"name": "Long Beach"},
              "latestEvent": {"name": "Loaded on board"}
            },
            "containers": [{"number": "CSNU1234567"}]
          }
        }
        """));

    ObjectNode refreshed = service.track(
        new ShipmentTrackRequest(
            "COSCO", "AUTO", "BOOKING", "6502406170", true
        ),
        business
    );

    assertThat(refreshed.path("shipmentId").asText()).isEqualTo("shell-shipment");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_tracking_snapshots WHERE shipment_id = ?",
        Integer.class, shipmentId
    )).isEqualTo(2);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT invalidation_reason FROM cp_tracking_snapshots WHERE id = ?",
        String.class, shellSnapshotId
    )).contains("empty or unusable");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT current_snapshot_id FROM cp_shipments WHERE id = ?", Long.class, shipmentId
    )).isNotEqualTo(shellSnapshotId);
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
          business_note VARCHAR(2000),
          job_number VARCHAR(160),
          client_po_number VARCHAR(160),
          client_name_code VARCHAR(160),
          original_bill_of_lading VARCHAR(64),
          last_tracked_at TIMESTAMP,
          fresh_until TIMESTAMP,
          created_by BIGINT,
          responsible_agent_id BIGINT,
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
          INDEX idx_cp_tracking_snapshots_user_query (queried_by, query_reference_type, query_reference_no, invalidated_at)
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
          responsible_agent_id BIGINT,
          status VARCHAR(24) NOT NULL,
          client_code VARCHAR(64),
          party_role VARCHAR(20),
          customer_code_hash CHAR(64),
          customer_code_prefix VARCHAR(16),
          customer_code_mode VARCHAR(20) DEFAULT 'RANDOM',
          provisioning_source VARCHAR(20) DEFAULT 'MANUAL',
          contact_email VARCHAR(254), remark VARCHAR(500)
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
        CREATE TABLE cp_oversea_agent_customers (
          customer_id BIGINT PRIMARY KEY,
          oversea_agent_customer_id BIGINT NOT NULL,
          assigned_by BIGINT NOT NULL,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_oversea_agent_shipment_scopes (
          shipment_id BIGINT NOT NULL,
          oversea_agent_customer_id BIGINT NOT NULL,
          represented_customer_id BIGINT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          assigned_by BIGINT NOT NULL,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (shipment_id, oversea_agent_customer_id, represented_customer_id)
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_oversea_agent_shipment_follows (
          oversea_agent_customer_id BIGINT NOT NULL,
          shipment_id BIGINT NOT NULL,
          followed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_refreshed_at TIMESTAMP,
          PRIMARY KEY (oversea_agent_customer_id, shipment_id)
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
