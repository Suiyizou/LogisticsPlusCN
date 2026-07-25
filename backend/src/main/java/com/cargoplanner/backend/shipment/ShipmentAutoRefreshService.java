package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.CRC32;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Service
public class ShipmentAutoRefreshService {
  private static final Logger log = LoggerFactory.getLogger(ShipmentAutoRefreshService.class);

  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;
  private final ShipmentTrackingService trackingService;
  private final ShipmentAutoRefreshProperties properties;
  private final Clock clock;
  private final AtomicBoolean regularScheduleAligned = new AtomicBoolean(false);

  @Autowired
  public ShipmentAutoRefreshService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      ShipmentTrackingService trackingService,
      ShipmentAutoRefreshProperties properties
  ) {
    this(jdbcTemplate, objectMapper, trackingService, properties, Clock.systemUTC());
  }

  ShipmentAutoRefreshService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      ShipmentTrackingService trackingService,
      ShipmentAutoRefreshProperties properties,
      Clock clock
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.trackingService = trackingService;
    this.properties = properties;
    this.clock = clock;
  }

  @Scheduled(
      initialDelayString = "${app.shipment-tracking.auto-refresh.initial-delay-ms:60000}",
      fixedDelayString = "${app.shipment-tracking.auto-refresh.poll-interval-ms:60000}"
  )
  public void scheduledRefresh() {
    if (!properties.isEnabled()) return;
    try {
      alignRegularScheduleOnce();
      refreshDueShipments();
    } catch (RuntimeException error) {
      log.error("Shipment auto-refresh poll failed", error);
    }
  }

  int refreshDueShipments() {
    Instant now = clock.instant();
    registerMissingJobs(now);
    List<RefreshClaim> claims = claimDueJobs(now);
    for (RefreshClaim claim : claims) refreshClaim(claim);
    return claims.size();
  }

  void alignRegularScheduleOnce() {
    if (!regularScheduleAligned.compareAndSet(false, true)) return;
    Instant now = clock.instant();
    Instant nextAttempt = nextRegularAttempt(now, "");
    int aligned = jdbcTemplate.update(
        """
        UPDATE cp_tracking_refresh_jobs
        SET next_attempt_at = ?, updated_at = ?
        WHERE auto_refresh_enabled = TRUE
          AND terminal_status IS NULL
          AND failure_count = 0
          AND lease_token IS NULL
          AND (next_attempt_at IS NULL OR next_attempt_at <> ?)
        """,
        timestamp(nextAttempt),
        timestamp(now),
        timestamp(nextAttempt)
    );
    if (aligned > 0) {
      log.info(
          "Aligned {} shipment auto-refresh jobs to the next daily run at {} ({})",
          aligned,
          properties.getDailyTime(),
          properties.getTimeZone()
      );
    }
  }

  int registerMissingJobs(Instant now) {
    List<UnregisteredShipment> shipments = jdbcTemplate.query(
        """
        SELECT s.id, s.public_id, t.snapshot_json
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        LEFT JOIN cp_tracking_refresh_jobs j ON j.shipment_id = s.id
        WHERE j.shipment_id IS NULL
          AND s.carrier_code IN ('COSCO', 'CMA')
          AND COALESCE(t.source_channel, '') <> 'IMPORTED_MANUAL'
        ORDER BY s.id
        LIMIT ?
        """,
        (rs, rowNumber) -> new UnregisteredShipment(
            rs.getLong("id"), rs.getString("public_id"), rs.getString("snapshot_json")
        ),
        bounded(properties.getDiscoveryBatchSize(), 1, 5_000)
    );
    int inserted = 0;
    for (UnregisteredShipment shipment : shipments) {
      boolean terminal = TrackingTerminalState.isEmptyReturned(readSnapshot(shipment.snapshotJson()));
      Instant nextAttempt = terminal ? null : nextRegularAttempt(now, shipment.publicId());
      try {
        inserted += jdbcTemplate.update(
            """
            INSERT INTO cp_tracking_refresh_jobs (
              shipment_id, auto_refresh_enabled, terminal_status, next_attempt_at,
              failure_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 0, ?, ?)
            """,
            shipment.id(),
            !terminal,
            terminal ? "EMPTY_RETURNED" : null,
            timestamp(nextAttempt),
            timestamp(now),
            timestamp(now)
        );
      } catch (DuplicateKeyException ignored) {
        // Another application instance registered the same shipment first.
      }
    }
    return inserted;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onSnapshotPersisted(TrackingSnapshotPersistedEvent event) {
    try {
      synchronizePersistedSnapshot(event);
    } catch (RuntimeException error) {
      // The snapshot is already committed. Do not turn a successful customer query into an
      // HTTP failure; the periodic discovery pass repairs a missing refresh job on the next poll.
      log.error("Failed to synchronize shipment {} refresh job", event.shipmentId(), error);
    }
  }

  void synchronizePersistedSnapshot(TrackingSnapshotPersistedEvent event) {
    Instant now = clock.instant();
    boolean terminal = TrackingTerminalState.isEmptyReturned(event.snapshot());
    Instant nextAttempt = terminal ? null : nextRegularAttempt(now, event.shipmentPublicId());
    int updated;
    if (terminal) {
      updated = jdbcTemplate.update(
          """
          UPDATE cp_tracking_refresh_jobs
          SET auto_refresh_enabled = FALSE, terminal_status = 'EMPTY_RETURNED',
              next_attempt_at = NULL, failure_count = 0, last_error = NULL,
              last_success_at = ?, updated_at = ?
          WHERE shipment_id = ?
          """,
          timestamp(event.persistedAt()), timestamp(now), event.shipmentId()
      );
    } else {
      updated = jdbcTemplate.update(
          """
          UPDATE cp_tracking_refresh_jobs
          SET auto_refresh_enabled = TRUE, next_attempt_at = ?, failure_count = 0,
              last_error = NULL, last_success_at = ?, updated_at = ?
          WHERE shipment_id = ? AND lease_token IS NULL AND terminal_status IS NULL
          """,
          timestamp(nextAttempt), timestamp(event.persistedAt()), timestamp(now), event.shipmentId()
      );
    }
    if (updated != 0 || refreshJobExists(event.shipmentId())) return;

    try {
      jdbcTemplate.update(
          """
          INSERT INTO cp_tracking_refresh_jobs (
            shipment_id, auto_refresh_enabled, terminal_status, next_attempt_at,
            failure_count, last_success_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 0, ?, ?, ?)
          """,
          event.shipmentId(), !terminal, terminal ? "EMPTY_RETURNED" : null,
          timestamp(nextAttempt), timestamp(event.persistedAt()), timestamp(now), timestamp(now)
      );
    } catch (DuplicateKeyException race) {
      if (terminal) synchronizePersistedSnapshot(event);
    }
  }

  private List<RefreshClaim> claimDueJobs(Instant now) {
    List<JobCandidate> candidates = jdbcTemplate.query(
        """
        SELECT j.shipment_id, j.failure_count, s.public_id
        FROM cp_tracking_refresh_jobs j
        JOIN cp_shipments s ON s.id = j.shipment_id
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE j.auto_refresh_enabled = TRUE
          AND s.carrier_code IN ('COSCO', 'CMA')
          AND COALESCE(t.source_channel, '') <> 'IMPORTED_MANUAL'
          AND j.next_attempt_at IS NOT NULL
          AND j.next_attempt_at <= ?
          AND (j.lease_until IS NULL OR j.lease_until < ?)
        ORDER BY j.next_attempt_at, j.shipment_id
        LIMIT ?
        """,
        (rs, rowNumber) -> new JobCandidate(
            rs.getLong("shipment_id"),
            rs.getInt("failure_count"),
            rs.getString("public_id")
        ),
        timestamp(now),
        timestamp(now),
        bounded(properties.getClaimBatchSize(), 1, 100)
    );

    List<RefreshClaim> claims = new ArrayList<>();
    for (JobCandidate candidate : candidates) {
      String token = UUID.randomUUID().toString();
      int claimed = jdbcTemplate.update(
          """
          UPDATE cp_tracking_refresh_jobs
          SET lease_token = ?, lease_until = ?, last_attempt_at = ?, updated_at = ?
          WHERE shipment_id = ?
            AND auto_refresh_enabled = TRUE
            AND next_attempt_at IS NOT NULL
            AND next_attempt_at <= ?
            AND (lease_until IS NULL OR lease_until < ?)
          """,
          token,
          timestamp(now.plus(valid(properties.getLeaseDuration(), Duration.ofMinutes(5)))),
          timestamp(now),
          timestamp(now),
          candidate.shipmentId(),
          timestamp(now),
          timestamp(now)
      );
      if (claimed != 1) continue;
      RefreshReference reference = findRefreshReference(candidate.shipmentId());
      RefreshClaim claim = new RefreshClaim(candidate, token, reference);
      if (reference == null) {
        recordFailure(claim, "No durable booking or bill-of-lading reference is available");
      } else {
        claims.add(claim);
      }
    }
    return claims;
  }

  private RefreshReference findRefreshReference(long shipmentId) {
    List<RefreshReference> references = jdbcTemplate.query(
        """
        SELECT s.carrier_code, r.reference_type, r.reference_no_normalized
        FROM cp_shipments s
        JOIN cp_shipment_references r ON r.shipment_id = s.id
        WHERE s.id = ? AND r.reference_type IN ('BILLOFLADING', 'BOOKING')
        ORDER BY CASE WHEN r.reference_type = 'BOOKING' THEN 0 ELSE 1 END,
                 r.primary_reference DESC,
                 r.id
        LIMIT 1
        """,
        (rs, rowNumber) -> new RefreshReference(
            rs.getString("carrier_code"),
            rs.getString("reference_type"),
            rs.getString("reference_no_normalized")
        ),
        shipmentId
    );
    return references.isEmpty() ? null : references.get(0);
  }

  private void refreshClaim(RefreshClaim claim) {
    try {
      RefreshReference reference = claim.reference();
      ObjectNode response = trackingService.refreshAutomatically(
          reference.carrier(), reference.type(), reference.number()
      );
      if (response.path("stale").asBoolean(false) || !response.path("snapshot").isObject()) {
        throw new IllegalStateException("Carrier refresh did not return a new valid snapshot");
      }
      boolean terminal = TrackingTerminalState.isEmptyReturned(response.path("snapshot"));
      completeClaim(claim, terminal);
    } catch (RuntimeException error) {
      if (error instanceof ApiException apiError
          && "MISSING_SNAPSHOT_OWNER".equals(apiError.code())) {
        disableClaim(claim, "OWNER_REQUIRED", safeMessage(error));
      } else {
        recordFailure(claim, safeMessage(error));
      }
    }
  }

  private void disableClaim(RefreshClaim claim, String terminalStatus, String message) {
    Instant now = clock.instant();
    jdbcTemplate.update(
        """
        UPDATE cp_tracking_refresh_jobs
        SET auto_refresh_enabled = FALSE, terminal_status = ?, next_attempt_at = NULL,
            lease_token = NULL, lease_until = NULL, last_error = ?, updated_at = ?
        WHERE shipment_id = ? AND lease_token = ?
        """,
        terminalStatus,
        trim(message, 500),
        timestamp(now),
        claim.candidate().shipmentId(),
        claim.token()
    );
    log.warn(
        "Shipment {} auto-refresh disabled: {}",
        claim.candidate().shipmentId(),
        terminalStatus
    );
  }

  private void completeClaim(RefreshClaim claim, boolean terminal) {
    Instant now = clock.instant();
    Instant nextAttempt = terminal ? null : nextRegularAttempt(now, claim.candidate().publicId());
    jdbcTemplate.update(
        """
        UPDATE cp_tracking_refresh_jobs
        SET auto_refresh_enabled = CASE
              WHEN terminal_status = 'EMPTY_RETURNED' THEN FALSE ELSE ? END,
            terminal_status = CASE
              WHEN terminal_status = 'EMPTY_RETURNED' THEN terminal_status ELSE ? END,
            next_attempt_at = CASE
              WHEN terminal_status = 'EMPTY_RETURNED' THEN NULL ELSE ? END,
            lease_token = NULL, lease_until = NULL, failure_count = 0, last_error = NULL,
            last_success_at = ?, updated_at = ?
        WHERE shipment_id = ? AND lease_token = ?
        """,
        !terminal,
        terminal ? "EMPTY_RETURNED" : null,
        timestamp(nextAttempt),
        timestamp(now),
        timestamp(now),
        claim.candidate().shipmentId(),
        claim.token()
    );
  }

  private void recordFailure(RefreshClaim claim, String message) {
    Instant now = clock.instant();
    int nextFailureCount = Math.max(1, claim.candidate().failureCount() + 1);
    Instant retryAt = retryAt(now, claim.candidate().publicId(), nextFailureCount);
    jdbcTemplate.update(
        """
        UPDATE cp_tracking_refresh_jobs
        SET next_attempt_at = CASE
              WHEN terminal_status = 'EMPTY_RETURNED' THEN NULL ELSE ? END,
            lease_token = NULL, lease_until = NULL,
            failure_count = ?, last_error = ?, updated_at = ?
        WHERE shipment_id = ? AND lease_token = ?
        """,
        timestamp(retryAt),
        nextFailureCount,
        trim(message, 500),
        timestamp(now),
        claim.candidate().shipmentId(),
        claim.token()
    );
    log.warn("Shipment {} auto-refresh failed; retry scheduled", claim.candidate().shipmentId());
  }

  Instant nextRegularAttempt(Instant now, String stableKey) {
    ZoneId zone = properties.getTimeZone();
    LocalTime dailyTime = properties.getDailyTime();
    ZonedDateTime zonedNow = now.atZone(zone);
    LocalDate scheduledDate = zonedNow.toLocalDate();
    ZonedDateTime candidate = scheduledDate.atTime(dailyTime).atZone(zone);
    if (!candidate.toInstant().isAfter(now)) {
      candidate = scheduledDate.plusDays(1).atTime(dailyTime).atZone(zone);
    }
    return candidate.toInstant();
  }

  private Instant retryAt(Instant now, String stableKey, int failureCount) {
    long baseMillis = valid(properties.getRetryBaseDelay(), Duration.ofMinutes(15)).toMillis();
    long maxMillis = valid(properties.getRetryMaxDelay(), Duration.ofHours(6)).toMillis();
    int exponent = Math.min(Math.max(0, failureCount - 1), 20);
    double expanded = baseMillis * Math.pow(2, exponent);
    long delayMillis = Math.min(maxMillis, expanded >= Long.MAX_VALUE ? maxMillis : (long) expanded);
    long jitterBound = Math.max(1, delayMillis / 5);
    long jitter = Math.floorMod(stableHash(stableKey + ":" + failureCount), jitterBound);
    return now.plusMillis(delayMillis + jitter);
  }

  private JsonNode readSnapshot(String json) {
    try {
      return objectMapper.readTree(json);
    } catch (JsonProcessingException error) {
      return objectMapper.createObjectNode();
    }
  }

  private boolean refreshJobExists(long shipmentId) {
    Integer count = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_tracking_refresh_jobs WHERE shipment_id = ?",
        Integer.class,
        shipmentId
    );
    return count != null && count > 0;
  }

  private long stableHash(String value) {
    CRC32 crc = new CRC32();
    crc.update((value == null ? "" : value).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    return crc.getValue();
  }

  private String safeMessage(RuntimeException error) {
    String message = error.getMessage();
    return message == null || message.isBlank() ? error.getClass().getSimpleName() : message;
  }

  private String trim(String value, int maxLength) {
    if (value == null) return null;
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }

  private int bounded(int value, int minimum, int maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  private Duration valid(Duration value, Duration fallback) {
    return value == null || value.isZero() || value.isNegative() ? fallback : value;
  }

  private Timestamp timestamp(Instant value) {
    return value == null ? null : Timestamp.from(value);
  }

  private record UnregisteredShipment(long id, String publicId, String snapshotJson) {}
  private record JobCandidate(long shipmentId, int failureCount, String publicId) {}
  private record RefreshReference(String carrier, String type, String number) {}
  private record RefreshClaim(JobCandidate candidate, String token, RefreshReference reference) {}
}
