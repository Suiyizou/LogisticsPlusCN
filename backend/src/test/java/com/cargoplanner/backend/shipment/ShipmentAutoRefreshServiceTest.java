package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class ShipmentAutoRefreshServiceTest {
  private static final Instant NOW = Instant.parse("2026-07-19T00:00:00Z");

  private JdbcTemplate jdbcTemplate;
  private ObjectMapper objectMapper;
  private ShipmentTrackingService trackingService;
  private ShipmentAutoRefreshProperties properties;
  private ShipmentAutoRefreshService service;

  @BeforeEach
  void setUp() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""
    );
    jdbcTemplate = new JdbcTemplate(dataSource);
    createSchema();
    objectMapper = new ObjectMapper();
    trackingService = mock(ShipmentTrackingService.class);
    properties = new ShipmentAutoRefreshProperties();
    properties.setDailyTime(LocalTime.MIDNIGHT);
    properties.setTimeZone(ZoneId.of("Asia/Shanghai"));
    properties.setLeaseDuration(Duration.ofMinutes(5));
    properties.setRetryBaseDelay(Duration.ofMinutes(15));
    properties.setRetryMaxDelay(Duration.ofHours(6));
    properties.setClaimBatchSize(10);
    service = new ShipmentAutoRefreshService(
        jdbcTemplate, objectMapper, trackingService, properties,
        Clock.fixed(NOW, ZoneOffset.UTC)
    );
  }

  @Test
  void humanVerificationPausesAutomaticRefreshInsteadOfSpendingMoreAgentRuns() {
    insertShipment(1, "00000000-0000-0000-0000-000000000001", "In transit");
    jdbcTemplate.update("UPDATE cp_shipments SET carrier_code = 'MSC' WHERE id = 1");
    jdbcTemplate.update("UPDATE cp_shipment_references SET carrier_code = 'MSC' WHERE shipment_id = 1");
    insertDueJob(1, NOW.minusSeconds(1));
    when(trackingService.refreshAutomatically("MSC", "BOOKING", "BK1")).thenThrow(
        new com.cargoplanner.backend.common.ApiException(
            org.springframework.http.HttpStatus.CONFLICT, "TRACKING_HUMAN_REQUIRED", "Carrier verification required"
        )
    );
    assertThat(service.refreshDueShipments()).isEqualTo(1);
    assertThat(service.refreshDueShipments()).isZero();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT terminal_status FROM cp_tracking_refresh_jobs WHERE shipment_id = 1", String.class
    )).isEqualTo("HUMAN_REQUIRED");
    verify(trackingService, times(1)).refreshAutomatically("MSC", "BOOKING", "BK1");
  }

  @Test
  void discoversAndRefreshesNewCarriersUsingTheirPrimaryBillReference() {
    int index = 1;
    for (String carrier : List.of("MAERSK", "HAPAG_LLOYD", "MSC", "OOCL")) {
      String publicId = String.format("00000000-0000-0000-0000-%012d", index);
      insertShipment(index, publicId, "In transit");
      jdbcTemplate.update("UPDATE cp_shipments SET carrier_code = ? WHERE id = ?", carrier, index);
      jdbcTemplate.update(
          "UPDATE cp_shipment_references SET carrier_code = ?, reference_type = 'BILLOFLADING' WHERE shipment_id = ?",
          carrier, index
      );
      ObjectNode response = objectMapper.createObjectNode();
      response.putObject("snapshot").putObject("summary").putObject("latestEvent").put("name", "In transit");
      when(trackingService.refreshAutomatically(carrier, "BILLOFLADING", "BK" + index)).thenReturn(response);
      index++;
    }
    assertThat(service.registerMissingJobs(NOW)).isEqualTo(4);
    jdbcTemplate.update("UPDATE cp_tracking_refresh_jobs SET next_attempt_at = ?", Timestamp.from(NOW.minusSeconds(1)));
    assertThat(service.refreshDueShipments()).isEqualTo(4);
    index = 1;
    for (String carrier : List.of("MAERSK", "HAPAG_LLOYD", "MSC", "OOCL")) {
      verify(trackingService).refreshAutomatically(carrier, "BILLOFLADING", "BK" + index);
      index++;
    }
  }

  @Test
  void keepsScheduledRefreshDisabledByDefault() {
    assertThat(new ShipmentAutoRefreshProperties().isEnabled()).isFalse();
    assertThat(new ShipmentAutoRefreshProperties().isSupplementalRetryEnabled()).isTrue();
    assertThat(new ShipmentAutoRefreshProperties()
        .getSupplementalFailureLimitBeforeFull()).isEqualTo(3);
  }

  @Test
  void schedulesOnlySupplementalRetryBetweenFifteenAndThirtyMinutes() {
    String publicId = "00000000-0000-0000-0000-000000000001";
    insertShipment(1, publicId, "In transit");
    insertDueJob(1, NOW.plus(Duration.ofHours(12)));

    service.onSupplementalRetryRequested(new SupplementalTrackingRetryRequestedEvent(
        publicId,
        java.util.List.of("bookingInfo", "containerInfo"),
        "COSCO_UPSTREAM_BLOCKED",
        "COSCO temporarily rejected this outbound IP",
        NOW
    ));

    assertThat(jdbcTemplate.queryForObject(
        "SELECT refresh_scope FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("SUPPLEMENTAL");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT supplemental_sources FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("bookingInfo,containerInfo");
    assertThat(nextAttempt(1)).isBetween(
        NOW.plus(Duration.ofMinutes(15)),
        NOW.plus(Duration.ofMinutes(30))
    );
    verify(trackingService).recordSupplementalRetryOutcome(
        publicId,
        false,
        "COSCO_UPSTREAM_BLOCKED",
        "COSCO temporarily rejected this outbound IP",
        null
    );
  }

  @Test
  void mergesConcurrentSupplementalRequestsAndSupersedesAnOlderLease() {
    String publicId = "00000000-0000-0000-0000-000000000001";
    insertShipment(1, publicId, "In transit");
    insertDueJob(1, NOW.plus(Duration.ofHours(12)));

    service.onSupplementalRetryRequested(new SupplementalTrackingRetryRequestedEvent(
        publicId, java.util.List.of("bookingInfo"), "BOOKING_FAILED", "booking failed", NOW
    ));
    jdbcTemplate.update(
        "UPDATE cp_tracking_refresh_jobs SET lease_token = 'older-worker', lease_until = ? "
            + "WHERE shipment_id = 1",
        Timestamp.from(NOW.plus(Duration.ofMinutes(5)))
    );
    service.onSupplementalRetryRequested(new SupplementalTrackingRetryRequestedEvent(
        publicId, java.util.List.of("containerInfo"), "CONTAINER_FAILED",
        "container failed", NOW.plusSeconds(1)
    ));

    assertThat(jdbcTemplate.queryForObject(
        "SELECT supplemental_sources FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("bookingInfo,containerInfo");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT lease_token FROM cp_tracking_refresh_jobs WHERE shipment_id = 1", String.class
    )).isNull();
    assertThat(nextAttempt(1)).isBetween(
        NOW.plusSeconds(1).plus(Duration.ofMinutes(15)),
        NOW.plusSeconds(1).plus(Duration.ofMinutes(30))
    );
  }

  @Test
  void olderMainSnapshotEventCannotEraseANewerSupplementalRetry() throws Exception {
    String publicId = "00000000-0000-0000-0000-000000000001";
    insertShipment(1, publicId, "In transit");
    insertDueJob(1, NOW.minusSeconds(1));

    service.onSupplementalRetryRequested(new SupplementalTrackingRetryRequestedEvent(
        publicId, java.util.List.of("containerInfo"), "CONTAINER_FAILED",
        "container failed", NOW
    ));
    ObjectNode nonTerminal = (ObjectNode) objectMapper.readTree(
        "{\"summary\":{\"latestEvent\":{\"name\":\"Discharged\"}}}"
    );
    service.synchronizePersistedSnapshot(new TrackingSnapshotPersistedEvent(
        1L, publicId, nonTerminal, NOW.plusSeconds(1)
    ));

    assertThat(jdbcTemplate.queryForObject(
        "SELECT refresh_scope FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("SUPPLEMENTAL");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT supplemental_sources FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("containerInfo");
    assertThat(nextAttempt(1)).isBetween(
        NOW.plus(Duration.ofMinutes(15)), NOW.plus(Duration.ofMinutes(30))
    );
  }

  @Test
  void dueSupplementalRetryNeverRunsTheMainCarrierQuery() throws Exception {
    String publicId = "00000000-0000-0000-0000-000000000001";
    insertShipment(1, publicId, "In transit");
    insertDueJob(1, NOW.minusSeconds(1));
    jdbcTemplate.update(
        "UPDATE cp_tracking_refresh_jobs SET refresh_scope = 'SUPPLEMENTAL', "
            + "supplemental_sources = 'containerInfo' WHERE shipment_id = 1"
    );
    ObjectNode response = (ObjectNode) objectMapper.readTree("""
        {"snapshot":{"summary":{"latestEvent":{"name":"Discharged"}}},"partial":false}
        """);
    when(trackingService.refreshSupplementalAutomatically(
        publicId, "COSCO", "BOOKING", "BK1", java.util.List.of("containerInfo")
    )).thenReturn(response);

    assertThat(service.refreshDueShipments()).isEqualTo(1);

    verify(trackingService, times(1)).refreshSupplementalAutomatically(
        publicId, "COSCO", "BOOKING", "BK1", java.util.List.of("containerInfo")
    );
    verify(trackingService, never()).refreshAutomatically("COSCO", "BOOKING", "BK1");
    verify(trackingService, times(1)).recordSupplementalRetryOutcome(
        eq(publicId), eq(true), eq(null), eq(null), anyString()
    );
    assertThat(jdbcTemplate.queryForObject(
        "SELECT refresh_scope FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("FULL");
  }

  @Test
  void failedSupplementalRetryKeepsTheShipmentPartialAndSchedulesAnotherRetry()
      throws Exception {
    String publicId = "00000000-0000-0000-0000-000000000001";
    insertShipment(1, publicId, "In transit");
    insertDueJob(1, NOW.minusSeconds(1));
    jdbcTemplate.update(
        "UPDATE cp_tracking_refresh_jobs SET refresh_scope = 'SUPPLEMENTAL', "
            + "supplemental_sources = 'bookingInfo' WHERE shipment_id = 1"
    );
    ObjectNode response = (ObjectNode) objectMapper.readTree("""
        {
          "snapshot":{"summary":{"latestEvent":{"name":"Discharged"}}},
          "partial":true,
          "warnings":[{
            "source":"bookingInfo",
            "code":"COSCO_UPSTREAM_BLOCKED",
            "causeCode":"HTTP_403",
            "message":"COSCO temporarily rejected this outbound IP",
            "route":"PLAYWRIGHT_PROXY"
          }],
          "strategy":{
            "used":"PLAYWRIGHT_PROXY",
            "proxyNode":"browser-proxy-a1b2",
            "playwrightAttempts":1,
            "triedNodes":["browser-proxy-a1b2"]
          }
        }
        """);
    when(trackingService.refreshSupplementalAutomatically(
        publicId, "COSCO", "BOOKING", "BK1", java.util.List.of("bookingInfo")
    )).thenReturn(response);

    assertThat(service.refreshDueShipments()).isEqualTo(1);

    verify(trackingService, times(1)).recordSupplementalRetryOutcome(
        eq(publicId),
        eq(false),
        eq("COSCO_UPSTREAM_BLOCKED"),
        contains("[proxy=browser-proxy-a1b2]"),
        anyString()
    );
    assertThat(jdbcTemplate.queryForObject(
        "SELECT refresh_scope FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("SUPPLEMENTAL");
    assertThat(nextAttempt(1)).isAfter(NOW);
  }

  @Test
  void mixedSupplementalFailuresKeepTheirPerSourceCodesWithoutMislabelingTheWholeRetry()
      throws Exception {
    String publicId = "00000000-0000-0000-0000-000000000001";
    insertShipment(1, publicId, "In transit");
    insertDueJob(1, NOW.minusSeconds(1));
    jdbcTemplate.update(
        "UPDATE cp_tracking_refresh_jobs SET refresh_scope = 'SUPPLEMENTAL', "
            + "supplemental_sources = 'bookingInfo,containerInfo' WHERE shipment_id = 1"
    );
    ObjectNode response = (ObjectNode) objectMapper.readTree("""
        {
          "snapshot":{"summary":{"latestEvent":{"name":"Discharged"}}},
          "partial":true,
          "warnings":[
            {"source":"bookingInfo","code":"COSCO_UPSTREAM_BLOCKED","message":"blocked"},
            {"source":"containerInfo","code":"COSCO_SUPPLEMENTAL_EMPTY","message":"empty"}
          ]
        }
        """);
    when(trackingService.refreshSupplementalAutomatically(
        publicId,
        "COSCO",
        "BOOKING",
        "BK1",
        java.util.List.of("bookingInfo", "containerInfo")
    )).thenReturn(response);

    assertThat(service.refreshDueShipments()).isEqualTo(1);

    verify(trackingService).recordSupplementalRetryOutcome(
        eq(publicId),
        eq(false),
        eq("COSCO_SUPPLEMENTAL_PARTIAL"),
        argThat(message -> message.contains("COSCO_UPSTREAM_BLOCKED")
            && message.contains("COSCO_SUPPLEMENTAL_EMPTY")),
        anyString()
    );
  }

  @Test
  void fullRefreshSchedulesOnlySupplementalWorkWhenMainRouteIsFresh() throws Exception {
    String publicId = "00000000-0000-0000-0000-000000000001";
    insertShipment(1, publicId, "In transit");
    insertDueJob(1, NOW.minusSeconds(1));
    ObjectNode response = (ObjectNode) objectMapper.readTree("""
        {
          "snapshot":{
            "summary":{"latestEvent":{"name":"Discharged"}},
            "supplementalDetails":{"partial":true,"pendingRefresh":true}
          },
          "enrichment":{"warning":{
            "code":"COSCO_UPSTREAM_BLOCKED",
            "message":"COSCO temporarily rejected this outbound IP"
          }},
          "stale":false
        }
        """);
    when(trackingService.refreshAutomatically("COSCO", "BOOKING", "BK1"))
        .thenReturn(response);
    when(trackingService.scheduleSupplementalRetry(
        eq(publicId),
        eq(java.util.List.of("bookingInfo", "containerInfo")),
        eq("COSCO_UPSTREAM_BLOCKED"),
        argThat(message -> message.contains("COSCO temporarily rejected this outbound IP")
            && message.contains("[code=COSCO_UPSTREAM_BLOCKED]"))
    )).thenReturn(true);

    assertThat(service.refreshDueShipments()).isEqualTo(1);

    verify(trackingService).scheduleSupplementalRetry(
        eq(publicId),
        eq(java.util.List.of("bookingInfo", "containerInfo")),
        eq("COSCO_UPSTREAM_BLOCKED"),
        argThat(message -> message.contains("COSCO temporarily rejected this outbound IP")
            && message.contains("[code=COSCO_UPSTREAM_BLOCKED]"))
    );
    verify(trackingService, never()).refreshSupplementalAutomatically(
        eq(publicId), eq("COSCO"), eq("BOOKING"), eq("BK1"),
        eq(java.util.List.of("bookingInfo", "containerInfo"))
    );
  }

  @Test
  void registersAllShipmentsForTheNextConfiguredDailyRun() {
    insertShipment(1, "00000000-0000-0000-0000-000000000001", "In transit");
    insertShipment(2, "00000000-0000-0000-0000-000000000099", "Discharged");

    assertThat(service.registerMissingJobs(NOW)).isEqualTo(2);
    Instant first = nextAttempt(1);
    Instant second = nextAttempt(2);

    assertThat(first).isEqualTo(Instant.parse("2026-07-19T16:00:00Z"));
    assertThat(second).isEqualTo(first);
  }

  @Test
  void supportsACustomDailyTimeAndTimeZone() {
    properties.setDailyTime(LocalTime.of(2, 30));
    properties.setTimeZone(ZoneId.of("Asia/Tokyo"));

    assertThat(service.nextRegularAttempt(
        Instant.parse("2026-07-19T16:00:00Z"), "shipment"
    )).isEqualTo(Instant.parse("2026-07-19T17:30:00Z"));
  }

  @Test
  void alignsLegacyDistributedJobsToTheNextDailyRunOnce() {
    insertShipment(1, "00000000-0000-0000-0000-000000000001", "In transit");
    insertDueJob(1, NOW.plus(Duration.ofHours(2)));

    service.alignRegularScheduleOnce();

    assertThat(nextAttempt(1)).isEqualTo(Instant.parse("2026-07-19T16:00:00Z"));
  }

  @Test
  void registrationDisablesAnAlreadyReturnedShipment() {
    insertShipment(1, "00000000-0000-0000-0000-000000000001", "Empty Returned");

    service.registerMissingJobs(NOW);

    assertThat(jdbcTemplate.queryForObject(
        "SELECT auto_refresh_enabled FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        Boolean.class
    )).isFalse();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT terminal_status FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("EMPTY_RETURNED");
    assertThat(nextAttempt(1)).isNull();
  }

  @Test
  void claimsAndRefreshesADueShipmentOnlyOnce() throws Exception {
    insertShipment(1, "00000000-0000-0000-0000-000000000001", "In transit");
    insertDueJob(1, NOW.minusSeconds(1));
    ObjectNode response = (ObjectNode) objectMapper.readTree("""
        {"snapshot":{"summary":{"latestEvent":{"name":"Discharged"}},
        "containers":[{"latestEvent":"Discharged"}]},"stale":false}
        """);
    when(trackingService.refreshAutomatically("COSCO", "BOOKING", "BK1"))
        .thenReturn(response);

    assertThat(service.refreshDueShipments()).isEqualTo(1);
    assertThat(service.refreshDueShipments()).isZero();

    verify(trackingService, times(1)).refreshAutomatically("COSCO", "BOOKING", "BK1");
    assertThat(nextAttempt(1)).isAfter(NOW);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT failure_count FROM cp_tracking_refresh_jobs WHERE shipment_id = 1", Integer.class
    )).isZero();
  }

  @Test
  void staleSupplementalCandidateCannotClaimAfterAnotherWorkerAddsASource() throws Exception {
    String publicId = "00000000-0000-0000-0000-000000000001";
    insertShipment(1, publicId, "In transit");
    insertDueJob(1, NOW.minusSeconds(1));
    jdbcTemplate.update(
        "UPDATE cp_tracking_refresh_jobs SET refresh_scope = 'SUPPLEMENTAL', "
            + "supplemental_sources = 'bookingInfo' WHERE shipment_id = 1"
    );

    JdbcTemplate mutationTemplate = new JdbcTemplate(jdbcTemplate.getDataSource());
    AtomicBoolean appendContainerSource = new AtomicBoolean(true);
    JdbcTemplate interleavingTemplate = new JdbcTemplate(jdbcTemplate.getDataSource()) {
      @Override
      public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) {
        List<T> rows = super.query(sql, rowMapper, args);
        if (sql.contains("SELECT j.shipment_id, j.failure_count")
            && appendContainerSource.compareAndSet(true, false)) {
          mutationTemplate.update(
              "UPDATE cp_tracking_refresh_jobs SET supplemental_sources = "
                  + "'bookingInfo,containerInfo' WHERE shipment_id = 1"
          );
        }
        return rows;
      }
    };
    ShipmentAutoRefreshService interleavingService = new ShipmentAutoRefreshService(
        interleavingTemplate, objectMapper, trackingService, properties,
        Clock.fixed(NOW, ZoneOffset.UTC)
    );

    assertThat(interleavingService.refreshDueShipments()).isZero();
    verify(trackingService, never()).refreshSupplementalAutomatically(
        anyString(), anyString(), anyString(), anyString(), org.mockito.ArgumentMatchers.anyList()
    );

    ObjectNode response = (ObjectNode) objectMapper.readTree("""
        {"snapshot":{"summary":{"latestEvent":{"name":"Discharged"}}},"partial":false}
        """);
    when(trackingService.refreshSupplementalAutomatically(
        publicId,
        "COSCO",
        "BOOKING",
        "BK1",
        java.util.List.of("bookingInfo", "containerInfo")
    )).thenReturn(response);

    assertThat(interleavingService.refreshDueShipments()).isEqualTo(1);
    verify(trackingService).refreshSupplementalAutomatically(
        publicId,
        "COSCO",
        "BOOKING",
        "BK1",
        java.util.List.of("bookingInfo", "containerInfo")
    );
  }

  @Test
  void prefersBookingReferenceWhenBookingAndBillBothExist() throws Exception {
    insertShipment(1, "00000000-0000-0000-0000-000000000001", "In transit");
    jdbcTemplate.update("""
        INSERT INTO cp_shipment_references (
          id, shipment_id, carrier_code, reference_type, reference_no_normalized, primary_reference
        ) VALUES (101, 1, 'COSCO', 'BOOKING', 'BK1', FALSE)
        """);
    insertDueJob(1, NOW.minusSeconds(1));
    ObjectNode response = (ObjectNode) objectMapper.readTree("""
        {"snapshot":{"summary":{"latestEvent":{"name":"Booking confirmed"}}},"stale":false}
        """);
    when(trackingService.refreshAutomatically("COSCO", "BOOKING", "BK1"))
        .thenReturn(response);

    assertThat(service.refreshDueShipments()).isEqualTo(1);

    verify(trackingService, times(1)).refreshAutomatically("COSCO", "BOOKING", "BK1");
    verify(trackingService, never()).refreshAutomatically("COSCO", "BILLOFLADING", "BL1");
  }

  @Test
  void activeLeasePreventsASecondWorkerFromQueryingTheSameShipment() {
    insertShipment(1, "00000000-0000-0000-0000-000000000001", "In transit");
    insertDueJob(1, NOW.minusSeconds(1));
    jdbcTemplate.update(
        "UPDATE cp_tracking_refresh_jobs SET lease_token = 'other', lease_until = ? WHERE shipment_id = 1",
        Timestamp.from(NOW.plusSeconds(60))
    );

    assertThat(service.refreshDueShipments()).isZero();
    verify(trackingService, never()).refreshAutomatically("COSCO", "BOOKING", "BK1");
  }

  @Test
  void failureReleasesTheLeaseAndSchedulesAnExponentialRetry() {
    insertShipment(1, "00000000-0000-0000-0000-000000000001", "In transit");
    insertDueJob(1, NOW.minusSeconds(1));
    when(trackingService.refreshAutomatically("COSCO", "BOOKING", "BK1"))
        .thenThrow(new IllegalStateException("temporary upstream failure"));

    assertThat(service.refreshDueShipments()).isEqualTo(1);

    assertThat(jdbcTemplate.queryForObject(
        "SELECT failure_count FROM cp_tracking_refresh_jobs WHERE shipment_id = 1", Integer.class
    )).isEqualTo(1);
    assertThat(nextAttempt(1)).isBetween(NOW.plus(Duration.ofMinutes(15)), NOW.plus(Duration.ofMinutes(18)));
    assertThat(jdbcTemplate.queryForObject(
        "SELECT lease_token FROM cp_tracking_refresh_jobs WHERE shipment_id = 1", String.class
    )).isNull();
  }

  @Test
  void repeatedSupplementalFailuresYieldToDailyFullWithoutDroppingPendingSources()
      throws Exception {
    String publicId = "00000000-0000-0000-0000-000000000001";
    properties.setEnabled(true);
    properties.setSupplementalFailureLimitBeforeFull(2);
    insertShipment(1, publicId, "In transit");
    insertDueJob(1, NOW.minusSeconds(1));
    jdbcTemplate.update(
        "UPDATE cp_tracking_refresh_jobs SET refresh_scope = 'SUPPLEMENTAL', "
            + "supplemental_sources = 'bookingInfo', failure_count = 1 WHERE shipment_id = 1"
    );
    when(trackingService.refreshSupplementalAutomatically(
        publicId, "COSCO", "BOOKING", "BK1", java.util.List.of("bookingInfo")
    )).thenThrow(new IllegalStateException("supplemental upstream still blocked"));

    assertThat(service.refreshDueShipments()).isEqualTo(1);

    assertThat(jdbcTemplate.queryForObject(
        "SELECT refresh_scope FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("FULL");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT supplemental_sources FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("bookingInfo");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT failure_count FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        Integer.class
    )).isEqualTo(2);
    assertThat(nextAttempt(1)).isEqualTo(Instant.parse("2026-07-19T16:00:00Z"));
    verify(trackingService, never()).refreshAutomatically("COSCO", "BOOKING", "BK1");

    jdbcTemplate.update(
        "UPDATE cp_tracking_refresh_jobs SET next_attempt_at = ? WHERE shipment_id = 1",
        Timestamp.from(NOW.minusSeconds(1))
    );
    ObjectNode fullResponse = (ObjectNode) objectMapper.readTree("""
        {"snapshot":{"summary":{"latestEvent":{"name":"Discharged"}}},"stale":false}
        """);
    when(trackingService.refreshAutomatically("COSCO", "BOOKING", "BK1"))
        .thenReturn(fullResponse);

    assertThat(service.refreshDueShipments()).isEqualTo(1);

    verify(trackingService).refreshAutomatically("COSCO", "BOOKING", "BK1");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT supplemental_sources FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isNull();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT failure_count FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        Integer.class
    )).isZero();
  }

  @Test
  void partialFullRecoveryKeepsPendingSourcesWhenSupplementalSchedulingIsUnavailable()
      throws Exception {
    String publicId = "00000000-0000-0000-0000-000000000001";
    properties.setEnabled(true);
    insertShipment(1, publicId, "In transit");
    insertDueJob(1, NOW.minusSeconds(1));
    jdbcTemplate.update(
        "UPDATE cp_tracking_refresh_jobs SET supplemental_sources = 'containerInfo' "
            + "WHERE shipment_id = 1"
    );
    ObjectNode response = (ObjectNode) objectMapper.readTree("""
        {
          "snapshot":{
            "summary":{"latestEvent":{"name":"Discharged"}},
            "supplementalDetails":{"partial":true,"pendingRefresh":true}
          },
          "enrichment":{"warning":{"code":"COSCO_UPSTREAM_BLOCKED","message":"blocked"}},
          "stale":false
        }
        """);
    when(trackingService.refreshAutomatically("COSCO", "BOOKING", "BK1"))
        .thenReturn(response);

    assertThat(service.refreshDueShipments()).isEqualTo(1);

    verify(trackingService).scheduleSupplementalRetry(
        eq(publicId),
        eq(java.util.List.of("bookingInfo", "containerInfo")),
        eq("COSCO_UPSTREAM_BLOCKED"),
        anyString()
    );
    assertThat(jdbcTemplate.queryForObject(
        "SELECT refresh_scope FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("FULL");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT supplemental_sources FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("containerInfo");
    assertThat(nextAttempt(1)).isEqualTo(Instant.parse("2026-07-19T16:00:00Z"));
  }

  @Test
  void partialSnapshotEventsCannotEraseSourcesWaitingForFullRecovery() throws Exception {
    String publicId = "00000000-0000-0000-0000-000000000001";
    insertShipment(1, publicId, "In transit");
    insertDueJob(1, NOW.plus(Duration.ofHours(2)));
    jdbcTemplate.update(
        "UPDATE cp_tracking_refresh_jobs SET supplemental_sources = 'bookingInfo' "
            + "WHERE shipment_id = 1"
    );
    ObjectNode partialSnapshot = (ObjectNode) objectMapper.readTree("""
        {
          "summary":{"latestEvent":{"name":"Discharged"}},
          "supplementalDetails":{"partial":true,"pendingRefresh":true}
        }
        """);

    service.synchronizePersistedSnapshot(new TrackingSnapshotPersistedEvent(
        1L, publicId, partialSnapshot, NOW
    ));

    assertThat(jdbcTemplate.queryForObject(
        "SELECT refresh_scope FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("FULL");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT supplemental_sources FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("bookingInfo");
  }

  @Test
  void supplementalOnlyModeKeepsRetryingSupplementalAfterTheFailureLimit() {
    String publicId = "00000000-0000-0000-0000-000000000001";
    properties.setEnabled(false);
    properties.setSupplementalFailureLimitBeforeFull(1);
    insertShipment(1, publicId, "In transit");
    insertDueJob(1, NOW.minusSeconds(1));
    jdbcTemplate.update(
        "UPDATE cp_tracking_refresh_jobs SET refresh_scope = 'SUPPLEMENTAL', "
            + "supplemental_sources = 'bookingInfo' WHERE shipment_id = 1"
    );
    when(trackingService.refreshSupplementalAutomatically(
        publicId, "COSCO", "BOOKING", "BK1", java.util.List.of("bookingInfo")
    )).thenThrow(new IllegalStateException("supplemental upstream still blocked"));

    assertThat(service.refreshDueShipments()).isEqualTo(1);

    assertThat(jdbcTemplate.queryForObject(
        "SELECT refresh_scope FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("SUPPLEMENTAL");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT supplemental_sources FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        String.class
    )).isEqualTo("bookingInfo");
  }

  @Test
  void persistedTerminalSnapshotStopsImmediatelyAndCannotBeReenabled() throws Exception {
    insertShipment(1, "00000000-0000-0000-0000-000000000001", "In transit");
    insertDueJob(1, NOW.plus(Duration.ofHours(1)));
    ObjectNode terminal = (ObjectNode) objectMapper.readTree(
        "{\"summary\":{\"latestEvent\":{\"name\":\"Empty Returned\"}}}"
    );
    ObjectNode olderNonTerminal = (ObjectNode) objectMapper.readTree(
        "{\"summary\":{\"latestEvent\":{\"name\":\"Discharged\"}}}"
    );

    service.synchronizePersistedSnapshot(new TrackingSnapshotPersistedEvent(
        1, "00000000-0000-0000-0000-000000000001", terminal, NOW
    ));
    service.synchronizePersistedSnapshot(new TrackingSnapshotPersistedEvent(
        1, "00000000-0000-0000-0000-000000000001", olderNonTerminal, NOW
    ));

    assertThat(jdbcTemplate.queryForObject(
        "SELECT auto_refresh_enabled FROM cp_tracking_refresh_jobs WHERE shipment_id = 1",
        Boolean.class
    )).isFalse();
    assertThat(nextAttempt(1)).isNull();
  }

  private void insertShipment(long id, String publicId, String latestEvent) {
    String snapshot = "{\"summary\":{\"latestEvent\":{\"name\":\"" + latestEvent + "\"}}}";
    jdbcTemplate.update(
        "INSERT INTO cp_shipments (id, public_id, carrier_code, current_snapshot_id) VALUES (?, ?, 'COSCO', ?)",
        id, publicId, id
    );
    jdbcTemplate.update(
        "INSERT INTO cp_tracking_snapshots (id, shipment_id, snapshot_json) VALUES (?, ?, ?)",
        id, id, snapshot
    );
    jdbcTemplate.update("""
        INSERT INTO cp_shipment_references (
          id, shipment_id, carrier_code, reference_type, reference_no_normalized, primary_reference
        ) VALUES (?, ?, 'COSCO', 'BOOKING', ?, TRUE)
        """, id, id, "BK" + id);
  }

  private void insertDueJob(long shipmentId, Instant nextAttempt) {
    jdbcTemplate.update("""
        INSERT INTO cp_tracking_refresh_jobs (
          shipment_id, auto_refresh_enabled, next_attempt_at, failure_count, created_at, updated_at
        ) VALUES (?, TRUE, ?, 0, ?, ?)
        """, shipmentId, Timestamp.from(nextAttempt), Timestamp.from(NOW), Timestamp.from(NOW));
  }

  private Instant nextAttempt(long shipmentId) {
    Timestamp value = jdbcTemplate.queryForObject(
        "SELECT next_attempt_at FROM cp_tracking_refresh_jobs WHERE shipment_id = ?",
        Timestamp.class,
        shipmentId
    );
    return value == null ? null : value.toInstant();
  }

  private void createSchema() {
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipments (
          id BIGINT PRIMARY KEY, public_id CHAR(36) NOT NULL, carrier_code VARCHAR(32) NOT NULL,
          current_snapshot_id BIGINT
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_tracking_snapshots (
          id BIGINT PRIMARY KEY, shipment_id BIGINT NOT NULL, source_channel VARCHAR(32),
          snapshot_json CLOB NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_references (
          id BIGINT PRIMARY KEY, shipment_id BIGINT NOT NULL, carrier_code VARCHAR(32) NOT NULL,
          reference_type VARCHAR(24) NOT NULL, reference_no_normalized VARCHAR(128) NOT NULL,
          primary_reference BOOLEAN NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_tracking_refresh_jobs (
          shipment_id BIGINT PRIMARY KEY, auto_refresh_enabled BOOLEAN NOT NULL,
          refresh_scope VARCHAR(24) NOT NULL DEFAULT 'FULL',
          supplemental_sources VARCHAR(128),
          terminal_status VARCHAR(40), next_attempt_at TIMESTAMP, lease_token VARCHAR(36),
          lease_until TIMESTAMP, failure_count INT NOT NULL, last_error VARCHAR(500),
          last_attempt_at TIMESTAMP, last_success_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL
        )
        """);
  }
}
