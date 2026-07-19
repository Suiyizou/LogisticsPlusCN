package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
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
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class ShipmentAutoRefreshServiceTest {
  private static final Instant NOW = Instant.parse("2026-07-19T00:00:00Z");

  private JdbcTemplate jdbcTemplate;
  private ObjectMapper objectMapper;
  private ShipmentTrackingService trackingService;
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
    ShipmentAutoRefreshProperties properties = new ShipmentAutoRefreshProperties();
    properties.setRefreshInterval(Duration.ofDays(1));
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
  void registersShipmentsIntoStableSlotsAcrossTheNextDay() {
    insertShipment(1, "00000000-0000-0000-0000-000000000001", "In transit");
    insertShipment(2, "00000000-0000-0000-0000-000000000099", "Discharged");

    assertThat(service.registerMissingJobs(NOW)).isEqualTo(2);
    Instant first = nextAttempt(1);
    Instant second = nextAttempt(2);

    assertThat(first).isAfter(NOW).isBeforeOrEqualTo(NOW.plus(Duration.ofDays(1)));
    assertThat(second).isAfter(NOW).isBeforeOrEqualTo(NOW.plus(Duration.ofDays(1)));
    assertThat(first).isNotEqualTo(second);
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
    when(trackingService.refreshAutomatically("COSCO", "BILLOFLADING", "BL1"))
        .thenReturn(response);

    assertThat(service.refreshDueShipments()).isEqualTo(1);
    assertThat(service.refreshDueShipments()).isZero();

    verify(trackingService, times(1)).refreshAutomatically("COSCO", "BILLOFLADING", "BL1");
    assertThat(nextAttempt(1)).isAfter(NOW);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT failure_count FROM cp_tracking_refresh_jobs WHERE shipment_id = 1", Integer.class
    )).isZero();
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
    verify(trackingService, never()).refreshAutomatically("COSCO", "BILLOFLADING", "BL1");
  }

  @Test
  void failureReleasesTheLeaseAndSchedulesAnExponentialRetry() {
    insertShipment(1, "00000000-0000-0000-0000-000000000001", "In transit");
    insertDueJob(1, NOW.minusSeconds(1));
    when(trackingService.refreshAutomatically("COSCO", "BILLOFLADING", "BL1"))
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
        ) VALUES (?, ?, 'COSCO', 'BILLOFLADING', ?, TRUE)
        """, id, id, "BL" + id);
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
          id BIGINT PRIMARY KEY, shipment_id BIGINT NOT NULL, snapshot_json CLOB NOT NULL
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
          terminal_status VARCHAR(40), next_attempt_at TIMESTAMP, lease_token VARCHAR(36),
          lease_until TIMESTAMP, failure_count INT NOT NULL, last_error VARCHAR(500),
          last_attempt_at TIMESTAMP, last_success_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL
        )
        """);
  }
}
