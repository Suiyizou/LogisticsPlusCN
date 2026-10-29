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
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.CRC32;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.context.event.EventListener;
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
    if (!properties.isEnabled() && !properties.isSupplementalRetryEnabled()) return;
    try {
      if (properties.isEnabled()) alignRegularScheduleOnce();
      refreshDueShipments(properties.isEnabled());
    } catch (RuntimeException error) {
      log.error("Shipment auto-refresh poll failed", error);
    }
  }

  int refreshDueShipments() {
    return refreshDueShipments(true);
  }

  private int refreshDueShipments(boolean includeFullRefresh) {
    Instant now = clock.instant();
    if (includeFullRefresh) registerMissingJobs(now);
    List<RefreshClaim> claims = claimDueJobs(now, includeFullRefresh);
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
          AND refresh_scope = 'FULL'
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
          AND s.carrier_code IN (%s)
          AND COALESCE(t.source_channel, '') <> 'IMPORTED_MANUAL'
        ORDER BY s.id
        LIMIT ?
        """.formatted(refreshCarrierCodes()),
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

  @EventListener
  public void onSupplementalRetryRequested(SupplementalTrackingRetryRequestedEvent event) {
    if (!properties.isSupplementalRetryEnabled() || event == null
        || event.shipmentPublicId() == null || event.shipmentPublicId().isBlank()) {
      return;
    }
    List<String> requestedSources = (event.sources() == null
        ? List.<String>of()
        : event.sources()).stream()
        .map(source -> source == null ? "" : source.trim())
        .filter(source -> source.equals("bookingInfo") || source.equals("containerInfo"))
        .distinct()
        .toList();
    if (requestedSources.isEmpty()) {
      requestedSources = List.of("bookingInfo", "containerInfo");
    }
    Instant requestedAt = event.requestedAt() == null ? clock.instant() : event.requestedAt();
    Instant retryAt = initialSupplementalRetryAt(
        requestedAt,
        event.shipmentPublicId() + ":" + String.join(",", requestedSources)
    );
    String sources = String.join(",", requestedSources);
    jdbcTemplate.update(
        """
        INSERT INTO cp_tracking_refresh_jobs (
          shipment_id, auto_refresh_enabled, refresh_scope, supplemental_sources,
          next_attempt_at, failure_count, last_error, created_at, updated_at
        )
        SELECT s.id, TRUE, 'SUPPLEMENTAL', ?, ?, 0, ?, ?, ?
        FROM cp_shipments s
        WHERE s.public_id = ?
        ON DUPLICATE KEY UPDATE
          auto_refresh_enabled = CASE
            WHEN terminal_status = 'EMPTY_RETURNED' THEN auto_refresh_enabled ELSE TRUE END,
          supplemental_sources = CASE
            WHEN terminal_status = 'EMPTY_RETURNED' THEN supplemental_sources
            WHEN refresh_scope = 'SUPPLEMENTAL'
              AND supplemental_sources <> VALUES(supplemental_sources)
              THEN 'bookingInfo,containerInfo'
            ELSE VALUES(supplemental_sources) END,
          next_attempt_at = CASE
            WHEN terminal_status = 'EMPTY_RETURNED' THEN NULL
            WHEN lease_token IS NOT NULL THEN VALUES(next_attempt_at)
            WHEN refresh_scope = 'SUPPLEMENTAL' AND next_attempt_at < VALUES(next_attempt_at)
              THEN next_attempt_at
            ELSE VALUES(next_attempt_at) END,
          failure_count = CASE
            WHEN refresh_scope = 'SUPPLEMENTAL' THEN failure_count ELSE 0 END,
          refresh_scope = CASE
            WHEN terminal_status = 'EMPTY_RETURNED' THEN refresh_scope ELSE 'SUPPLEMENTAL' END,
          lease_token = CASE
            WHEN terminal_status = 'EMPTY_RETURNED' THEN lease_token ELSE NULL END,
          lease_until = CASE
            WHEN terminal_status = 'EMPTY_RETURNED' THEN lease_until ELSE NULL END,
          last_error = VALUES(last_error), updated_at = VALUES(updated_at)
        """,
        trim(sources, 128),
        timestamp(retryAt),
        trim(event.errorMessage(), 500),
        timestamp(requestedAt),
        timestamp(requestedAt),
        event.shipmentPublicId().trim()
    );
    Integer scheduled = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*)
        FROM cp_tracking_refresh_jobs j
        JOIN cp_shipments s ON s.id = j.shipment_id
        WHERE s.public_id = ? AND j.refresh_scope = 'SUPPLEMENTAL'
          AND j.next_attempt_at IS NOT NULL
        """,
        Integer.class,
        event.shipmentPublicId().trim()
    );
    if (scheduled == null || scheduled == 0) return;
    event.markScheduled();
    try {
      trackingService.recordSupplementalRetryOutcome(
          event.shipmentPublicId(),
          false,
          event.errorCode() == null || event.errorCode().isBlank()
              ? "COSCO_SUPPLEMENTAL_PARTIAL"
              : event.errorCode(),
          event.errorMessage(),
          null
      );
    } catch (RuntimeException diagnosticError) {
      log.warn(
          "Supplemental retry job was scheduled for shipment {}, but its diagnostic marker failed",
          event.shipmentPublicId(),
          diagnosticError
      );
    }
  }

  Instant initialSupplementalRetryAt(Instant now, String stableKey) {
    long minimumMs = valid(
        properties.getSupplementalRetryMinDelay(), Duration.ofMinutes(15)
    ).toMillis();
    long maximumMs = valid(
        properties.getSupplementalRetryMaxDelay(), Duration.ofMinutes(30)
    ).toMillis();
    maximumMs = Math.max(minimumMs, maximumMs);
    long spread = Math.max(1L, maximumMs - minimumMs + 1L);
    long jitter = Math.floorMod(stableHash(stableKey), spread);
    return now.plusMillis(minimumMs + jitter);
  }

  void synchronizePersistedSnapshot(TrackingSnapshotPersistedEvent event) {
    Instant now = clock.instant();
    boolean terminal = TrackingTerminalState.isEmptyReturned(event.snapshot());
    boolean supplementalPending = event.snapshot() != null
        && event.snapshot().path("supplementalDetails")
            .path("pendingRefresh").asBoolean(false);
    Instant nextAttempt = terminal ? null : nextRegularAttempt(now, event.shipmentPublicId());
    int updated;
    if (terminal) {
      updated = jdbcTemplate.update(
          """
          UPDATE cp_tracking_refresh_jobs
          SET auto_refresh_enabled = FALSE, refresh_scope = 'FULL',
              supplemental_sources = NULL, terminal_status = 'EMPTY_RETURNED',
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
          SET auto_refresh_enabled = TRUE, refresh_scope = 'FULL',
              supplemental_sources = CASE
                WHEN ? = TRUE THEN COALESCE(NULLIF(supplemental_sources, ''),
                  'bookingInfo,containerInfo')
                ELSE NULL END,
              next_attempt_at = ?, failure_count = 0,
              last_error = NULL, last_success_at = ?, updated_at = ?
          WHERE shipment_id = ? AND lease_token IS NULL AND terminal_status IS NULL
            AND refresh_scope = 'FULL'
          """,
          supplementalPending,
          timestamp(nextAttempt), timestamp(event.persistedAt()), timestamp(now), event.shipmentId()
      );
    }
    if (updated != 0 || refreshJobExists(event.shipmentId())) return;

    try {
      jdbcTemplate.update(
          """
          INSERT INTO cp_tracking_refresh_jobs (
            shipment_id, auto_refresh_enabled, refresh_scope, supplemental_sources,
            terminal_status, next_attempt_at,
            failure_count, last_success_at, created_at, updated_at
          ) VALUES (?, ?, 'FULL', ?, ?, ?, 0, ?, ?, ?)
          """,
          event.shipmentId(), !terminal,
          supplementalPending && !terminal ? "bookingInfo,containerInfo" : null,
          terminal ? "EMPTY_RETURNED" : null,
          timestamp(nextAttempt), timestamp(event.persistedAt()), timestamp(now), timestamp(now)
      );
    } catch (DuplicateKeyException race) {
      if (terminal) synchronizePersistedSnapshot(event);
    }
  }

  private List<RefreshClaim> claimDueJobs(Instant now, boolean includeFullRefresh) {
    List<JobCandidate> candidates = jdbcTemplate.query(
        """
        SELECT j.shipment_id, j.failure_count, s.public_id,
               j.refresh_scope, j.supplemental_sources
        FROM cp_tracking_refresh_jobs j
        JOIN cp_shipments s ON s.id = j.shipment_id
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE j.auto_refresh_enabled = TRUE
          AND s.carrier_code IN (%s)
          AND COALESCE(t.source_channel, '') <> 'IMPORTED_MANUAL'
          AND j.next_attempt_at IS NOT NULL
          AND j.next_attempt_at <= ?
          AND (? = TRUE OR j.refresh_scope = 'SUPPLEMENTAL')
          AND (j.lease_until IS NULL OR j.lease_until < ?)
        ORDER BY j.next_attempt_at, j.shipment_id
        LIMIT ?
        """.formatted(refreshCarrierCodes()),
        (rs, rowNumber) -> new JobCandidate(
            rs.getLong("shipment_id"),
            rs.getInt("failure_count"),
            rs.getString("public_id"),
            rs.getString("refresh_scope"),
            rs.getString("supplemental_sources")
        ),
        timestamp(now),
        includeFullRefresh,
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
            AND refresh_scope = ?
            AND (
              supplemental_sources = ?
              OR (supplemental_sources IS NULL AND ? IS NULL)
            )
          """,
          token,
          timestamp(now.plus(valid(properties.getLeaseDuration(), Duration.ofMinutes(5)))),
          timestamp(now),
          timestamp(now),
          candidate.shipmentId(),
          timestamp(now),
          timestamp(now),
          candidate.refreshScope(),
          candidate.supplementalSources(),
          candidate.supplementalSources()
      );
      if (claimed != 1) continue;
      RefreshReference reference = findRefreshReference(candidate.shipmentId());
      RefreshClaim claim = new RefreshClaim(candidate, token, reference);
      if (reference == null) {
        recordFailure(claim, "No booking reference is available");
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
        WHERE s.id = ? AND %s
        ORDER BY r.primary_reference DESC,
                 r.id
        LIMIT 1
        """.formatted(refreshReferencePredicate()),
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
    boolean supplemental = !trackingService.usesLocalTrackingQueue()
        && "SUPPLEMENTAL".equalsIgnoreCase(claim.candidate().refreshScope());
    try {
      RefreshReference reference = claim.reference();
      ObjectNode response = supplemental
          ? trackingService.refreshSupplementalAutomatically(
              claim.candidate().publicId(),
              reference.carrier(),
              reference.type(),
              reference.number(),
              supplementalSources(claim.candidate().supplementalSources())
          )
          : trackingService.refreshAutomatically(
              reference.carrier(), reference.type(), reference.number()
          );
      if (supplemental && response.path("partial").asBoolean(false)) {
        throw supplementalPartialError(response);
      }
      if (response.path("stale").asBoolean(false) || !response.path("snapshot").isObject()) {
        throw new IllegalStateException("Carrier refresh did not return a new valid snapshot");
      }
      boolean preservePendingSources = false;
      if (!supplemental && response.path("snapshot").path("supplementalDetails")
          .path("pendingRefresh").asBoolean(false)) {
        String errorCode = response.path("enrichment").path("warning")
            .path("code").asText("COSCO_SUPPLEMENTAL_PARTIAL");
        String errorMessage = supplementalPendingMessage(response);
        boolean scheduled = trackingService.scheduleSupplementalRetry(
            claim.candidate().publicId(),
            List.of("bookingInfo", "containerInfo"),
            errorCode,
            errorMessage
        );
        if (!scheduled) {
          preservePendingSources = true;
          trackingService.recordSupplementalRetryOutcome(
              claim.candidate().publicId(), false, errorCode, errorMessage, claim.token()
          );
        }
      }
      if (supplemental) {
        trackingService.recordSupplementalRetryOutcome(
            claim.candidate().publicId(), true, null, null, claim.token()
        );
      }
      boolean terminal = TrackingTerminalState.isEmptyReturned(response.path("snapshot"));
      completeClaim(claim, terminal, preservePendingSources);
    } catch (RuntimeException error) {
      if (supplemental) {
        try {
          trackingService.recordSupplementalRetryOutcome(
              claim.candidate().publicId(),
              false,
              error instanceof ApiException apiError ? apiError.code() : "SUPPLEMENTAL_RETRY_FAILED",
              safeMessage(error),
              claim.token()
          );
        } catch (RuntimeException diagnosticError) {
          log.warn(
              "Shipment {} supplemental retry diagnostic could not be persisted",
              claim.candidate().shipmentId(),
              diagnosticError
          );
        }
      }
      if (error instanceof ApiException apiError
          && "MISSING_SNAPSHOT_OWNER".equals(apiError.code())) {
        disableClaim(claim, "OWNER_REQUIRED", safeMessage(error));
      } else if (error instanceof ApiException apiError
          && "TRACKING_HUMAN_REQUIRED".equals(apiError.code())) {
        disableClaim(claim, "HUMAN_REQUIRED", safeMessage(error));
      } else {
        recordFailure(claim, safeMessage(error));
      }
    }
  }

  private String refreshCarrierCodes() {
    return trackingService.usesLocalTrackingQueue()
        ? "'" + String.join("', '", TrackingCarriers.CODES) + "'"
        : "'COSCO', 'CMA', 'MAERSK', 'HAPAG_LLOYD', 'MSC', 'OOCL'";
  }

  private String refreshReferencePredicate() {
    return trackingService.usesLocalTrackingQueue()
        ? "(r.reference_type = 'BOOKING' OR (s.carrier_code <> 'CMA' AND r.reference_type = 'BILLOFLADING'))"
        : "(r.reference_type = 'BOOKING' OR (s.carrier_code IN ('MAERSK', 'HAPAG_LLOYD', 'MSC', 'OOCL')"
            + " AND r.reference_type = 'BILLOFLADING'))";
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

  private void completeClaim(
      RefreshClaim claim,
      boolean terminal,
      boolean preservePendingSources
  ) {
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
            refresh_scope = 'FULL',
            supplemental_sources = CASE
              WHEN ? = TRUE AND terminal_status IS NULL
                THEN COALESCE(NULLIF(supplemental_sources, ''),
                  'bookingInfo,containerInfo')
              ELSE NULL END,
            lease_token = NULL, lease_until = NULL, failure_count = 0, last_error = NULL,
            last_success_at = ?, updated_at = ?
        WHERE shipment_id = ? AND lease_token = ?
        """,
        !terminal,
        terminal ? "EMPTY_RETURNED" : null,
        timestamp(nextAttempt),
        preservePendingSources,
        timestamp(now),
        timestamp(now),
        claim.candidate().shipmentId(),
        claim.token()
    );
  }

  private void recordFailure(RefreshClaim claim, String message) {
    Instant now = clock.instant();
    int nextFailureCount = Math.max(1, claim.candidate().failureCount() + 1);
    int supplementalFailureLimit = bounded(
        properties.getSupplementalFailureLimitBeforeFull(), 1, 100
    );
    boolean yieldToFull = properties.isEnabled()
        && "SUPPLEMENTAL".equalsIgnoreCase(claim.candidate().refreshScope())
        && nextFailureCount >= supplementalFailureLimit;
    Instant retryAt = yieldToFull
        ? nextRegularAttempt(now, claim.candidate().publicId())
        : retryAt(now, claim.candidate().publicId(), nextFailureCount);
    jdbcTemplate.update(
        """
        UPDATE cp_tracking_refresh_jobs
        SET next_attempt_at = CASE
              WHEN terminal_status = 'EMPTY_RETURNED' THEN NULL ELSE ? END,
            refresh_scope = CASE
              WHEN terminal_status = 'EMPTY_RETURNED' THEN refresh_scope
              WHEN ? = TRUE THEN 'FULL' ELSE refresh_scope END,
            lease_token = NULL, lease_until = NULL,
            failure_count = ?, last_error = ?, updated_at = ?
        WHERE shipment_id = ? AND lease_token = ?
        """,
        timestamp(retryAt),
        yieldToFull,
        nextFailureCount,
        trim(message, 500),
        timestamp(now),
        claim.candidate().shipmentId(),
        claim.token()
    );
    if (yieldToFull) {
      log.warn(
          "Shipment {} supplemental refresh reached {} failures; preserved {} and yielded to the next FULL refresh",
          claim.candidate().shipmentId(),
          nextFailureCount,
          claim.candidate().supplementalSources()
      );
    } else {
      log.warn("Shipment {} auto-refresh failed; retry scheduled", claim.candidate().shipmentId());
    }
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

  private List<String> supplementalSources(String value) {
    if (value == null || value.isBlank()) return List.of("bookingInfo", "containerInfo");
    return java.util.Arrays.stream(value.split(","))
        .map(String::trim)
        .filter(source -> source.equals("bookingInfo") || source.equals("containerInfo"))
        .distinct()
        .toList();
  }

  private ApiException supplementalPartialError(JsonNode response) {
    JsonNode warnings = response.path("warnings");
    JsonNode strategy = response.path("strategy");
    String strategyRoute = diagnosticText(
        strategy.hasNonNull("route") ? strategy.path("route") : strategy.path("used"), 80
    );
    String strategyProxyNode = diagnosticText(strategy.path("proxyNode"), 80);
    int strategyAttempts = Math.max(
        0,
        Math.max(
            strategy.path("proxyAttempts").asInt(0),
            strategy.path("playwrightAttempts").asInt(0)
        )
    );
    List<String> strategyTriedNodes = diagnosticNodes(strategy.path("triedNodes"));
    List<String> summaries = new ArrayList<>();
    List<Map<String, Object>> structuredWarnings = new ArrayList<>();
    LinkedHashSet<String> warningCodes = new LinkedHashSet<>();
    Long retryAfterMs = null;
    if (warnings.isArray()) {
      for (JsonNode warning : warnings) {
        if (!warning.isObject()) continue;
        String source = diagnosticText(warning.path("source"), 40);
        String code = diagnosticText(warning.path("code"), 120);
        String message = diagnosticText(warning.path("message"), 500);
        String route = diagnosticText(warning.path("route"), 80);
        if (route == null) route = strategyRoute;
        String proxyNode = diagnosticText(warning.path("proxyNode"), 80);
        if (proxyNode == null) proxyNode = strategyProxyNode;
        String causeCode = diagnosticText(warning.path("causeCode"), 120);
        int attempts = Math.max(0, warning.path("attempts").asInt(0));
        if (attempts == 0) attempts = strategyAttempts;
        List<String> triedNodes = new ArrayList<>(diagnosticNodes(warning.path("triedNodes")));
        if (triedNodes.isEmpty()) triedNodes.addAll(strategyTriedNodes);

        if (code != null) warningCodes.add(code);
        if (warning.path("retryAfterMs").canConvertToLong()) {
          retryAfterMs = Math.max(
              retryAfterMs == null ? 0L : retryAfterMs,
              Math.max(0L, warning.path("retryAfterMs").asLong())
          );
        }

        Map<String, Object> diagnostic = new LinkedHashMap<>();
        putIfPresent(diagnostic, "source", source);
        putIfPresent(diagnostic, "code", code);
        putIfPresent(diagnostic, "message", message);
        putIfPresent(diagnostic, "causeCode", causeCode);
        putIfPresent(diagnostic, "route", route);
        putIfPresent(diagnostic, "proxyNode", proxyNode);
        if (attempts > 0) diagnostic.put("attempts", attempts);
        if (!triedNodes.isEmpty()) diagnostic.put("triedNodes", List.copyOf(triedNodes));
        if (warning.path("retryAfterMs").canConvertToLong()) {
          diagnostic.put("retryAfterMs", Math.max(0L, warning.path("retryAfterMs").asLong()));
        }
        structuredWarnings.add(diagnostic);

        StringBuilder summary = new StringBuilder();
        if (source != null) summary.append(source).append(": ");
        summary.append(message == null ? "Supplemental carrier query failed" : message);
        if (code != null) summary.append(" [code=").append(code).append(']');
        if (causeCode != null) summary.append(" [cause=").append(causeCode).append(']');
        if (route != null) summary.append(" [route=").append(route).append(']');
        if (proxyNode != null) summary.append(" [proxy=").append(proxyNode).append(']');
        if (attempts > 0) summary.append(" [attempts=").append(attempts).append(']');
        if (!triedNodes.isEmpty()) {
          summary.append(" [tried=").append(String.join(",", triedNodes)).append(']');
        }
        summaries.add(summary.toString());
      }
    }

    if (summaries.isEmpty()) {
      Map<String, Object> diagnostic = new LinkedHashMap<>();
      putIfPresent(diagnostic, "route", strategyRoute);
      putIfPresent(diagnostic, "proxyNode", strategyProxyNode);
      if (strategyAttempts > 0) diagnostic.put("attempts", strategyAttempts);
      if (!strategyTriedNodes.isEmpty()) {
        diagnostic.put("triedNodes", List.copyOf(strategyTriedNodes));
      }
      if (!diagnostic.isEmpty()) structuredWarnings.add(diagnostic);
      StringBuilder summary = new StringBuilder("COSCO supplemental details remain partial");
      if (strategyRoute != null) summary.append(" [route=").append(strategyRoute).append(']');
      if (strategyProxyNode != null) {
        summary.append(" [proxy=").append(strategyProxyNode).append(']');
      }
      if (strategyAttempts > 0) {
        summary.append(" [attempts=").append(strategyAttempts).append(']');
      }
      if (!strategyTriedNodes.isEmpty()) {
        summary.append(" [tried=").append(String.join(",", strategyTriedNodes)).append(']');
      }
      summaries.add(summary.toString());
    }

    Map<String, Object> details = new LinkedHashMap<>();
    if (!structuredWarnings.isEmpty()) details.put("warnings", List.copyOf(structuredWarnings));
    String message = String.join(" | ", summaries);
    String primaryCode = warningCodes.size() == 1
        ? warningCodes.iterator().next()
        : "COSCO_SUPPLEMENTAL_PARTIAL";
    return new ApiException(
        HttpStatus.BAD_GATEWAY,
        primaryCode,
        message,
        retryAfterMs,
        details
    );
  }

  private String supplementalPendingMessage(JsonNode response) {
    JsonNode warning = response.path("enrichment").path("warning");
    JsonNode strategy = response.path("strategy");
    String message = diagnosticText(warning.path("message"), 500);
    if (message == null) {
      message = "The main route was refreshed, but supplemental details remain pending";
    }
    String code = diagnosticText(warning.path("code"), 120);
    String route = diagnosticText(warning.path("route"), 80);
    if (route == null) route = diagnosticText(strategy.path("used"), 80);
    String proxyNode = diagnosticText(warning.path("proxyNode"), 80);
    if (proxyNode == null) proxyNode = diagnosticText(strategy.path("proxyNode"), 80);
    int attempts = Math.max(
        warning.path("attempts").asInt(0),
        strategy.path("proxyAttempts").asInt(0)
    );
    List<String> triedNodes = diagnosticNodes(warning.path("triedNodes"));
    if (triedNodes.isEmpty()) triedNodes = diagnosticNodes(strategy.path("triedNodes"));
    StringBuilder summary = new StringBuilder(message);
    if (code != null) summary.append(" [code=").append(code).append(']');
    if (route != null) summary.append(" [route=").append(route).append(']');
    if (proxyNode != null) summary.append(" [proxy=").append(proxyNode).append(']');
    if (attempts > 0) summary.append(" [attempts=").append(attempts).append(']');
    if (!triedNodes.isEmpty()) {
      summary.append(" [tried=").append(String.join(",", triedNodes)).append(']');
    }
    return summary.toString();
  }

  private String diagnosticText(JsonNode value, int maxLength) {
    if (value == null || value.isMissingNode() || value.isNull()) return null;
    String text = value.asText("").replaceAll("[\\p{Cntrl}]", " ").trim();
    if (text.isBlank()) return null;
    return text.length() <= maxLength ? text : text.substring(0, maxLength);
  }

  private List<String> diagnosticNodes(JsonNode values) {
    if (values == null || !values.isArray()) return List.of();
    List<String> nodes = new ArrayList<>();
    for (JsonNode valueNode : values) {
      String value = diagnosticText(valueNode, 80);
      if (value != null && !nodes.contains(value) && nodes.size() < 20) nodes.add(value);
    }
    return List.copyOf(nodes);
  }

  private void putIfPresent(Map<String, Object> target, String key, String value) {
    if (value != null) target.put(key, value);
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
  private record JobCandidate(
      long shipmentId,
      int failureCount,
      String publicId,
      String refreshScope,
      String supplementalSources
  ) {}
  private record RefreshReference(String carrier, String type, String number) {}
  private record RefreshClaim(JobCandidate candidate, String token, RefreshReference reference) {}
}
