package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import com.cargoplanner.backend.shipment.TrackingAdapterClient.NormalizedTrackRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class ShipmentTrackingService {
  private static final List<String> SUPPORTED_TYPES = List.of("BILLOFLADING", "BOOKING", "CONTAINER");
  private static final List<String> SUPPORTED_CHANNELS = List.of("AUTO", "NETWORK", "PLAYWRIGHT");

  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;
  private final TrackingAdapterClient adapterClient;
  private final CmaTrackingSessionService cmaTrackingSessionService;
  private final ShipmentAccessService accessService;
  private final ShipmentTrackingProperties properties;
  private final TransactionTemplate transactionTemplate;
  private final Clock clock;
  private final ApplicationEventPublisher eventPublisher;

  @Autowired
  public ShipmentTrackingService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      TrackingAdapterClient adapterClient,
      CmaTrackingSessionService cmaTrackingSessionService,
      ShipmentAccessService accessService,
      ShipmentTrackingProperties properties,
      PlatformTransactionManager transactionManager,
      ApplicationEventPublisher eventPublisher
  ) {
    this(
        jdbcTemplate,
        objectMapper,
        adapterClient,
        cmaTrackingSessionService,
        accessService,
        properties,
        new TransactionTemplate(transactionManager),
        Clock.systemUTC(),
        eventPublisher
    );
  }

  ShipmentTrackingService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      TrackingAdapterClient adapterClient,
      CmaTrackingSessionService cmaTrackingSessionService,
      ShipmentAccessService accessService,
      ShipmentTrackingProperties properties,
      TransactionTemplate transactionTemplate,
      Clock clock
  ) {
    this(
        jdbcTemplate, objectMapper, adapterClient, cmaTrackingSessionService, accessService,
        properties, transactionTemplate, clock, event -> {}
    );
  }

  private ShipmentTrackingService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      TrackingAdapterClient adapterClient,
      CmaTrackingSessionService cmaTrackingSessionService,
      ShipmentAccessService accessService,
      ShipmentTrackingProperties properties,
      TransactionTemplate transactionTemplate,
      Clock clock,
      ApplicationEventPublisher eventPublisher
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.adapterClient = adapterClient;
    this.cmaTrackingSessionService = cmaTrackingSessionService;
    this.accessService = accessService;
    this.properties = properties;
    this.transactionTemplate = transactionTemplate;
    this.clock = clock;
    this.eventPublisher = eventPublisher;
  }

  public ObjectNode track(ShipmentTrackRequest input, AuthenticatedUser user) {
    return track(input, user, false);
  }

  /**
   * Returns only a business-confirmed database snapshot assigned to the signed-in customer.
   * This path deliberately never calls a carrier adapter and never grants access by searching.
   */
  public ObjectNode readAssignedSnapshot(
      ShipmentTrackRequest input,
      CustomerPrincipal customer
  ) {
    if (customer == null) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Customer sign in is required");
    }
    NormalizedTrackRequest request = normalize(input);
    if (!isDurableReferenceType(request.type())) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Customers can only open assigned booking or bill-of-lading records"
      );
    }
    List<CachedShipment> records = jdbcTemplate.query(
        """
        SELECT s.id AS shipment_id, s.public_id, t.snapshot_json, t.strategy_json,
               t.fetched_at, t.fresh_until
        FROM cp_customer_shipment_access a
        JOIN cp_shipments s ON s.id = a.shipment_id
        JOIN cp_shipment_references r ON r.shipment_id = s.id
        LEFT JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        WHERE a.customer_id = ?
          AND a.publication_status = 'PUBLISHED'
          AND r.carrier_code = ?
          AND r.reference_type = ?
          AND r.reference_no_normalized = ?
        LIMIT 1
        """,
        this::mapCachedShipment,
        customer.id(),
        request.carrier(),
        request.type(),
        normalizeReference(request.number())
    );
    if (records.isEmpty()) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Shipment is not assigned to this customer; contact your business representative"
      );
    }
    CachedShipment cached = records.get(0);
    if (cached.snapshotJson() == null || !isUsableCachedSnapshot(cached.snapshotJson())) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "Assigned shipment has no confirmed tracking data; contact your business representative"
      );
    }
    ObjectNode response = cachedResponse(cached, null, false);
    response.put("cacheSource", "MYSQL_ASSIGNED");
    response.put("fileAccess", true);
    response.put("customerReadOnly", true);
    return response;
  }

  /** Returns one explicitly published, assigned shipment by its durable public id. */
  public ObjectNode readAssignedSnapshotByShipmentId(
      String shipmentPublicId,
      CustomerPrincipal customer
  ) {
    if (customer == null) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Customer sign in is required");
    }
    List<CachedShipment> records = jdbcTemplate.query(
        """
        SELECT s.id AS shipment_id, s.public_id, t.snapshot_json, t.strategy_json,
               t.fetched_at, t.fresh_until
        FROM cp_customer_shipment_access a
        JOIN cp_shipments s ON s.id = a.shipment_id
        LEFT JOIN cp_tracking_snapshots t
          ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        WHERE a.customer_id = ? AND a.publication_status = 'PUBLISHED' AND s.public_id = ?
        LIMIT 1
        """,
        this::mapCachedShipment,
        customer.id(),
        shipmentPublicId == null ? "" : shipmentPublicId.trim()
    );
    if (records.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Published shipment was not found");
    }
    CachedShipment cached = records.get(0);
    if (cached.snapshotJson() == null || !isUsableCachedSnapshot(cached.snapshotJson())) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "Assigned shipment has no confirmed tracking data; contact your business representative"
      );
    }
    ObjectNode response = cachedResponse(cached, null, false);
    response.put("cacheSource", "MYSQL_ASSIGNED");
    response.put("fileAccess", true);
    response.put("customerReadOnly", true);
    return response;
  }

  /** Lists the database-backed shipment records explicitly assigned to a customer. */
  public ObjectNode listAssignedSnapshots(CustomerPrincipal customer) {
    if (customer == null) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Customer sign in is required");
    }
    List<CustomerAssignedShipment> records = jdbcTemplate.query(
        """
        SELECT s.id AS shipment_id, s.public_id, s.carrier_code, s.tracking_status,
               s.last_tracked_at, r.reference_type, r.reference_no_raw,
               t.snapshot_json, t.strategy_json, t.fetched_at, t.fresh_until
        FROM cp_customer_shipment_access a
        JOIN cp_shipments s ON s.id = a.shipment_id
        LEFT JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id FROM cp_shipment_references r2
          WHERE r2.shipment_id = s.id
          ORDER BY r2.primary_reference DESC, r2.id ASC LIMIT 1
        )
        LEFT JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        WHERE a.customer_id = ? AND a.publication_status = 'PUBLISHED'
        ORDER BY a.assigned_at DESC, s.updated_at DESC
        """,
        (rs, rowNumber) -> new CustomerAssignedShipment(
            new CachedShipment(
                rs.getLong("shipment_id"), rs.getString("public_id"),
                rs.getString("snapshot_json"), rs.getString("strategy_json"),
                instant(rs, "fetched_at"), instant(rs, "fresh_until")
            ),
            rs.getString("carrier_code"), rs.getString("reference_type"),
            rs.getString("reference_no_raw"), rs.getString("tracking_status"),
            instant(rs, "last_tracked_at")
        ),
        customer.id()
    );
    ObjectNode response = objectMapper.createObjectNode();
    ArrayNode items = response.putArray("items");
    for (CustomerAssignedShipment record : records) {
      CachedShipment cached = record.cached();
      ObjectNode item = items.addObject();
      item.put("shipmentId", cached.shipmentPublicId());
      item.put("carrier", record.carrier());
      item.put("referenceType", record.referenceType());
      item.put("referenceNo", record.referenceNo());
      item.put("trackingStatus", record.trackingStatus());
      item.put(
          "lastTrackedAt",
          record.lastTrackedAt() == null ? null : record.lastTrackedAt().toString()
      );
      boolean available = cached.snapshotJson() != null
          && isUsableCachedSnapshot(cached.snapshotJson());
      item.put("dataAvailable", available);
      if (available) item.set("snapshot", readJson(cached.snapshotJson()));
    }
    response.put("total", records.size());
    response.put("customerReadOnly", true);
    return response;
  }

  /** Runs a trusted force refresh for the background scheduler. */
  ObjectNode refreshAutomatically(String carrier, String type, String number) {
    return track(
        new ShipmentTrackRequest(carrier, "AUTO", type, number, true),
        null,
        true
    );
  }

  private ObjectNode track(
      ShipmentTrackRequest input,
      AuthenticatedUser user,
      boolean trustedAutomaticRefresh
  ) {
    NormalizedTrackRequest request = normalize(input);
    ShipmentImportDetails importedDetails = normalizeImportedDetails(input, request, user);
    boolean forceRefresh = Boolean.TRUE.equals(input == null ? null : input.forceRefresh());
    if (forceRefresh && !trustedAutomaticRefresh
        && (user == null || !user.canManageShipmentFiles())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Only business users or administrators may force a refresh");
    }

    // Container numbers are reusable transport equipment identifiers, not durable shipment
    // identities. Never resolve a long-lived shipment aggregate from a container-only alias.
    CachedShipment cached = user != null && isDurableReferenceType(request.type()) ? findCached(request) : null;
    Instant now = clock.instant();
    if (!forceRefresh && importedDetails == null && cached != null
        && cached.freshUntil() != null && cached.freshUntil().isAfter(now)) {
      return cachedResponse(cached, user, false);
    }

    JsonNode upstream;
    try {
      upstream = "CMA".equals(request.carrier())
          ? adapterClient.track(request, cmaTrackingSessionService.requireCredentials())
          : adapterClient.track(request);
    } catch (ApiException error) {
      String failureCode = trackingFailureCode(error);
      if (importedDetails == null && cached != null
          && (error.status().is5xxServerError() || error.status() == HttpStatus.TOO_MANY_REQUESTS)) {
        ObjectNode response = cachedResponse(cached, user, true);
        response.put("warning", error.getMessage());
        ObjectNode diagnostic = response.putObject("diagnostic");
        diagnostic.put("code", failureCode);
        diagnostic.put("message", error.getMessage());
        return response;
      }
      throw new ApiException(error.status(), failureCode, error.getMessage());
    }

    JsonNode snapshot = upstream.path("snapshot");
    if (!snapshot.isObject()) {
      throw new ApiException(
          HttpStatus.BAD_GATEWAY, "UPSTREAM_EMPTY",
          "Tracking adapter returned an incomplete snapshot"
      );
    }
    upstream = enrichWithImportedDetails(upstream, importedDetails);
    snapshot = upstream.path("snapshot");
    if (!hasMeaningfulTrackingData(snapshot)) {
      if (cached != null) {
        ObjectNode response = cachedResponse(cached, user, true);
        response.put("warning", "Live tracking returned no operational data; the last valid snapshot was kept");
        ObjectNode diagnostic = response.putObject("diagnostic");
        diagnostic.put("code", "UPSTREAM_EMPTY");
        diagnostic.put("message", "Carrier returned no operational tracking data");
        return response;
      }
      throw new ApiException(
          HttpStatus.BAD_GATEWAY, "UPSTREAM_EMPTY",
          "Carrier returned no operational tracking data"
      );
    }

    if (extractReferences(request, snapshot).isEmpty()) {
      return transientLiveResponse(upstream);
    }

    if (user == null) {
      return transientLiveResponse(upstream);
    }

    PersistedShipment persisted = persistAtomically(request, upstream, cached, user, now);
    if (persisted == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to persist tracking result");
    }
    matchImportedClientCode(persisted, importedDetails, user, now);
    return liveResponse(upstream, persisted, user);
  }

  private void matchImportedClientCode(
      PersistedShipment shipment,
      ShipmentImportDetails importedDetails,
      AuthenticatedUser user,
      Instant now
  ) {
    if (shipment == null || importedDetails == null || user == null
        || !user.canManageShipmentFiles() || importedDetails.clientNameCode() == null
        || importedDetails.clientNameCode().isBlank()) {
      return;
    }
    String clientCode = importedDetails.clientNameCode().trim().toUpperCase(Locale.ROOT);
    List<ImportedCustomerMatch> matches = user.isAdmin()
        ? jdbcTemplate.query(
            "SELECT id, party_role FROM cp_customers WHERE client_code = ? AND status = 'ACTIVE'",
            (rs, rowNumber) -> new ImportedCustomerMatch(
                rs.getLong("id"), rs.getString("party_role")
            ),
            clientCode
        )
        : jdbcTemplate.query(
            "SELECT id, party_role FROM cp_customers WHERE client_code = ? AND status = 'ACTIVE' AND created_by = ?",
            (rs, rowNumber) -> new ImportedCustomerMatch(
                rs.getLong("id"), rs.getString("party_role")
            ),
            clientCode,
            user.id()
        );
    String reason = matches.isEmpty() ? "NO_MATCH" : matches.size() > 1 ? "AMBIGUOUS" : null;
    ImportedCustomerMatch match = matches.size() == 1 ? matches.get(0) : null;
    if (match != null && ("SHIPPER".equals(match.partyRole()) || "CONSIGNEE".equals(match.partyRole()))) {
      Integer conflicts = jdbcTemplate.queryForObject(
          """
          SELECT COUNT(*) FROM cp_customer_shipment_access
          WHERE shipment_id = ? AND relationship_role = ? AND customer_id <> ?
          """,
          Integer.class,
          shipment.shipmentId(), match.partyRole(), match.customerId()
      );
      if (conflicts != null && conflicts > 0) reason = "ROLE_CONFLICT";
    }
    if (match != null && reason == null) {
      jdbcTemplate.update(
          """
          INSERT INTO cp_customer_shipment_access (
            customer_id, shipment_id, relationship_role, publication_status, assigned_by
          ) VALUES (?, ?, ?, 'DRAFT', ?)
          ON DUPLICATE KEY UPDATE customer_id = customer_id
          """,
          match.customerId(), shipment.shipmentId(), match.partyRole(), user.id()
      );
      jdbcTemplate.update(
          """
          UPDATE cp_shipment_client_match_queue
          SET match_status = 'RESOLVED', match_reason = 'AUTO_BOUND',
              matched_customer_id = ?, resolved_at = ?, updated_at = ?
          WHERE shipment_id = ?
          """,
          match.customerId(), timestamp(now), timestamp(now), shipment.shipmentId()
      );
      return;
    }
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_client_match_queue (
          shipment_id, imported_client_code, match_status, match_reason, requested_by,
          created_at, updated_at
        ) VALUES (?, ?, 'PENDING', ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          imported_client_code = VALUES(imported_client_code),
          match_status = 'PENDING', match_reason = VALUES(match_reason),
          requested_by = VALUES(requested_by), matched_customer_id = NULL,
          resolved_at = NULL, updated_at = VALUES(updated_at)
        """,
        shipment.shipmentId(), clientCode, reason == null ? "NO_MATCH" : reason,
        user.id(), timestamp(now), timestamp(now)
    );
  }

  public JsonNode cancelBatchTask(String taskId) {
    String normalized = taskId == null ? "" : taskId.trim();
    if (!normalized.matches("[A-Za-z0-9_-]{16,80}")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Batch task id is invalid");
    }
    return adapterClient.cancelBatchTask(normalized);
  }

  private String trackingFailureCode(ApiException error) {
    if (error.code() != null && !error.code().isBlank()) return error.code();
    String message = error.getMessage() == null ? "" : error.getMessage().toLowerCase(Locale.ROOT);
    if (error.status() == HttpStatus.TOO_MANY_REQUESTS || error.status() == HttpStatus.FORBIDDEN
        || message.contains("cooldown") || message.contains("rate limit")
        || message.contains("datadome") || message.contains("risk control")) {
      return "RATE_LIMITED";
    }
    if (error.status() == HttpStatus.BAD_REQUEST || message.contains("format")
        || message.contains("unsupported shipment number")) {
      return "INVALID_REFERENCE";
    }
    if (error.status() == HttpStatus.NOT_FOUND || message.contains("no operational")
        || message.contains("empty") || message.contains("incomplete")) {
      return "UPSTREAM_EMPTY";
    }
    return "ADAPTER_FAILURE";
  }

  private boolean hasMeaningfulTrackingData(JsonNode snapshot) {
    if (arrayHasItems(snapshot.path("containers"))
        || arrayHasItems(snapshot.path("route"))
        || arrayHasItems(snapshot.path("routingLegs"))
        || arrayHasItems(snapshot.path("sailingSchedule"))) {
      return true;
    }
    JsonNode summary = snapshot.path("summary");
    if (hasText(summary.path("latestEvent"), "name", "time", "occurredAt", "location")
        || hasText(summary.path("origin"), "name", "location")
        || hasText(summary.path("destination"), "name", "location")) {
      return true;
    }
    JsonNode keyTimes = snapshot.path("keyTimes");
    return hasText(keyTimes.path("actualDeparture"), "time", "value")
        || hasText(keyTimes.path("actualArrival"), "time", "value")
        || hasText(keyTimes.path("estimatedFinalArrival"), "time", "value");
  }

  private boolean arrayHasItems(JsonNode node) {
    return node != null && node.isArray() && !node.isEmpty();
  }

  private boolean hasText(JsonNode node, String... fields) {
    if (node == null || node.isMissingNode() || node.isNull()) return false;
    for (String field : fields) {
      if (!node.path(field).asText("").isBlank()) return true;
    }
    return false;
  }

  private synchronized PersistedShipment persistAtomically(
      NormalizedTrackRequest request,
      JsonNode upstream,
      CachedShipment existingQuery,
      AuthenticatedUser user,
      Instant now
  ) {
    try {
      return transactionTemplate.execute(status -> persist(request, upstream, existingQuery, user, now));
    } catch (DuplicateKeyException race) {
      CachedShipment winner = findCached(request);
      if (winner == null) throw race;
      return transactionTemplate.execute(status -> persist(request, upstream, winner, user, now));
    }
  }

  private PersistedShipment persist(
      NormalizedTrackRequest request,
      JsonNode upstream,
      CachedShipment existingQuery,
      AuthenticatedUser user,
      Instant now
  ) {
    JsonNode snapshot = upstream.path("snapshot");
    if (!snapshot.isObject()) {
      throw new ApiException(HttpStatus.BAD_GATEWAY, "Tracking adapter returned an incomplete snapshot");
    }
    List<ShipmentReference> references = extractReferences(request, snapshot);
    ShipmentIdentity shipment = existingQuery == null
        ? findShipmentByAnyReference(references)
        : new ShipmentIdentity(existingQuery.shipmentId(), existingQuery.shipmentPublicId());
    if (shipment == null) {
      shipment = createShipment(request.carrier(), user, now);
    }
    for (ShipmentReference reference : references) {
      attachReference(shipment.id(), reference);
    }

    String snapshotJson = writeJson(snapshot);
    JsonNode strategy = upstream.path("strategy");
    String strategyJson = strategy.isMissingNode() || strategy.isNull() ? null : writeJson(strategy);
    Instant fetchedAt = parseInstant(snapshot.path("fetchedAt").asText(null), now);
    Instant freshUntil = now.plus(cacheTtl());
    long snapshotId = insertSnapshot(
        shipment.id(),
        request,
        snapshot,
        snapshotJson,
        strategyJson,
        fetchedAt,
        freshUntil,
        now,
        user
    );
    String trackingStatus = trim(
        snapshot.path("summary").path("latestEvent").path("name").asText(null),
        80
    );
    jdbcTemplate.update(
        """
        UPDATE cp_shipments
        SET current_snapshot_id = ?, tracking_status = ?, last_tracked_at = ?, fresh_until = ?, updated_at = ?
        WHERE id = ?
        """,
        snapshotId,
        trackingStatus,
        timestamp(fetchedAt),
        timestamp(freshUntil),
        timestamp(now),
        shipment.id()
    );
    eventPublisher.publishEvent(new TrackingSnapshotPersistedEvent(
        shipment.id(), shipment.publicId(), snapshot.deepCopy(), now
    ));
    return new PersistedShipment(shipment.id(), shipment.publicId(), fetchedAt, freshUntil);
  }

  private CachedShipment findCached(NormalizedTrackRequest request) {
    List<CachedShipment> records = jdbcTemplate.query(
        """
        SELECT s.id AS shipment_id, s.public_id, t.snapshot_json, t.strategy_json,
               t.fetched_at, t.fresh_until
        FROM cp_shipment_references r
        JOIN cp_shipments s ON s.id = r.shipment_id
        LEFT JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        WHERE r.carrier_code = ? AND r.reference_type = ? AND r.reference_no_normalized = ?
        LIMIT 1
        """,
        this::mapCachedShipment,
        request.carrier(),
        request.type(),
        normalizeReference(request.number())
    );
    CachedShipment record = records.isEmpty() ? null : records.get(0);
    return record == null || record.snapshotJson() == null
        || !isUsableCachedSnapshot(record.snapshotJson()) ? null : record;
  }

  private boolean isUsableCachedSnapshot(String snapshotJson) {
    if (snapshotJson == null || snapshotJson.isBlank()) return false;
    try {
      JsonNode snapshot = objectMapper.readTree(snapshotJson);
      return snapshot != null && snapshot.isObject() && hasMeaningfulTrackingData(snapshot);
    } catch (JsonProcessingException error) {
      return false;
    }
  }

  private ShipmentIdentity findShipmentByAnyReference(List<ShipmentReference> references) {
    for (ShipmentReference reference : references) {
      List<ShipmentIdentity> shipments = jdbcTemplate.query(
          """
          SELECT s.id, s.public_id
          FROM cp_shipment_references r
          JOIN cp_shipments s ON s.id = r.shipment_id
          WHERE r.carrier_code = ? AND r.reference_type = ? AND r.reference_no_normalized = ?
          LIMIT 1
          """,
          (rs, rowNumber) -> new ShipmentIdentity(rs.getLong("id"), rs.getString("public_id")),
          reference.carrier(),
          reference.type(),
          reference.normalizedNumber()
      );
      if (!shipments.isEmpty()) return shipments.get(0);
    }
    return null;
  }

  private ShipmentIdentity createShipment(String carrier, AuthenticatedUser creator, Instant now) {
    String publicId = UUID.randomUUID().toString();
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbcTemplate.update((connection) -> {
      PreparedStatement statement = connection.prepareStatement(
          """
          INSERT INTO cp_shipments (
            public_id, carrier_code, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?)
          """,
          Statement.RETURN_GENERATED_KEYS
      );
      statement.setString(1, publicId);
      statement.setString(2, carrier);
      if (creator == null) statement.setNull(3, java.sql.Types.BIGINT);
      else statement.setLong(3, creator.id());
      statement.setTimestamp(4, timestamp(now));
      statement.setTimestamp(5, timestamp(now));
      return statement;
    }, keyHolder);
    Number key = keyHolder.getKey();
    if (key == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create shipment");
    }
    return new ShipmentIdentity(key.longValue(), publicId);
  }

  private void attachReference(long shipmentId, ShipmentReference reference) {
    if (!isDurableReferenceType(reference.type())) return;
    List<Long> owners = jdbcTemplate.query(
        """
        SELECT shipment_id
        FROM cp_shipment_references
        WHERE carrier_code = ? AND reference_type = ? AND reference_no_normalized = ?
        """,
        (rs, rowNumber) -> rs.getLong("shipment_id"),
        reference.carrier(),
        reference.type(),
        reference.normalizedNumber()
    );
    if (!owners.isEmpty()) return;
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_references (
          shipment_id, carrier_code, reference_type, reference_no_raw,
          reference_no_normalized, primary_reference
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        shipmentId,
        reference.carrier(),
        reference.type(),
        reference.rawNumber(),
        reference.normalizedNumber(),
        reference.primaryReference()
    );
  }

  private long insertSnapshot(
      long shipmentId,
      NormalizedTrackRequest request,
      JsonNode snapshot,
      String snapshotJson,
      String strategyJson,
      Instant fetchedAt,
      Instant freshUntil,
      Instant now,
      AuthenticatedUser user
  ) {
    long queriedBy = user.id();
    String queriedByUsername = user.username();
    String payloadSha = sha256(snapshotJson);
    String sourceChannel = trim(snapshot.path("channel").asText(request.channel()), 32);

    jdbcTemplate.update(
        """
        INSERT INTO cp_tracking_snapshots (
          shipment_id, query_reference_type, query_reference_no, queried_by, queried_by_username,
          source_channel, snapshot_json, strategy_json, payload_sha256, fetched_at, fresh_until, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          shipment_id = VALUES(shipment_id),
          source_channel = VALUES(source_channel),
          snapshot_json = VALUES(snapshot_json),
          strategy_json = VALUES(strategy_json),
          payload_sha256 = VALUES(payload_sha256),
          fetched_at = VALUES(fetched_at),
          fresh_until = VALUES(fresh_until),
          invalidated_at = NULL,
          invalidated_by = NULL,
          invalidation_reason = NULL
        """,
        shipmentId, request.type(), request.number(), queriedBy, queriedByUsername,
        sourceChannel, snapshotJson, strategyJson, payloadSha,
        timestamp(fetchedAt), timestamp(freshUntil), timestamp(now)
    );
    Long id = jdbcTemplate.queryForObject(
        """
        SELECT id FROM cp_tracking_snapshots
        WHERE queried_by = ? AND query_reference_type = ? AND query_reference_no = ?
        LIMIT 1
        """,
        Long.class,
        queriedBy, request.type(), request.number()
    );
    if (id == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save tracking snapshot");
    }
    return id;
  }

  private List<ShipmentReference> extractReferences(NormalizedTrackRequest request, JsonNode snapshot) {
    Map<String, ShipmentReference> values = new LinkedHashMap<>();
    if (isDurableReferenceType(request.type())) {
      addReference(values, request.carrier(), request.type(), request.number(), true);
    }
    JsonNode summary = snapshot.path("summary");
    addReference(values, request.carrier(), "BILLOFLADING", summary.path("billOfLading").asText(null), false);
    addTextValues(values, request.carrier(), "BOOKING", summary.path("bookingNumbers"));
    JsonNode references = snapshot.path("references");
    addReference(values, request.carrier(), "BILLOFLADING", references.path("masterBill").asText(null), false);
    addTextValues(values, request.carrier(), "BOOKING", references.path("bookingNumbers"));
    return new ArrayList<>(values.values());
  }

  private boolean isDurableReferenceType(String type) {
    return "BOOKING".equals(type) || "BILLOFLADING".equals(type);
  }

  private void addTextValues(
      Map<String, ShipmentReference> values,
      String carrier,
      String type,
      JsonNode node
  ) {
    if (node == null || node.isNull() || node.isMissingNode()) return;
    if (node.isArray()) {
      for (JsonNode item : node) addReference(values, carrier, type, item.asText(null), false);
    } else {
      addReference(values, carrier, type, node.asText(null), false);
    }
  }

  private void addReference(
      Map<String, ShipmentReference> values,
      String carrier,
      String type,
      String number,
      boolean primary
  ) {
    if (number == null || number.isBlank()) return;
    String normalized = normalizeReference(number);
    if (normalized.isBlank() || normalized.length() > 128) return;
    String key = carrier + "|" + type + "|" + normalized;
    ShipmentReference existing = values.get(key);
    if (existing == null || primary) {
      values.put(key, new ShipmentReference(carrier, type, number.trim(), normalized, primary));
    }
  }

  private ObjectNode cachedResponse(CachedShipment cached, AuthenticatedUser user, boolean stale) {
    ObjectNode response = objectMapper.createObjectNode();
    response.set("snapshot", readJson(cached.snapshotJson()));
    if (cached.strategyJson() != null && !cached.strategyJson().isBlank()) {
      response.set("strategy", readJson(cached.strategyJson()));
    }
    response.put("shipmentId", cached.shipmentPublicId());
    response.put("cached", true);
    response.put("cacheSource", stale ? "MYSQL_STALE" : "MYSQL");
    response.put("stale", stale);
    response.put("fetchedAt", cached.fetchedAt() == null ? null : cached.fetchedAt().toString());
    response.put("freshUntil", cached.freshUntil() == null ? null : cached.freshUntil().toString());
    response.put("fileAccess", accessService.hasAccess(cached.shipmentPublicId(), user));
    return response;
  }

  private ObjectNode liveResponse(JsonNode upstream, PersistedShipment persisted, AuthenticatedUser user) {
    ObjectNode response = upstream.isObject()
        ? ((ObjectNode) upstream).deepCopy()
        : objectMapper.createObjectNode().set("snapshot", upstream.path("snapshot"));
    boolean adapterCached = response.path("cached").asBoolean(false);
    response.put("shipmentId", persisted.shipmentPublicId());
    response.put("cacheSource", adapterCached ? "NODE" : "LIVE");
    response.put("stale", false);
    response.put("fetchedAt", persisted.fetchedAt().toString());
    response.put("freshUntil", persisted.freshUntil().toString());
    response.put("persisted", true);
    response.put("fileAccess", accessService.hasAccess(persisted.shipmentPublicId(), user));
    return response;
  }

  private ObjectNode transientLiveResponse(JsonNode upstream) {
    ObjectNode response = upstream.isObject()
        ? ((ObjectNode) upstream).deepCopy()
        : objectMapper.createObjectNode().set("snapshot", upstream.path("snapshot"));
    boolean adapterCached = response.path("cached").asBoolean(false);
    response.remove("shipmentId");
    response.put("cacheSource", adapterCached ? "NODE" : "LIVE");
    response.put("stale", false);
    response.put("persisted", false);
    response.put("fileAccess", false);
    return response;
  }

  private NormalizedTrackRequest normalize(ShipmentTrackRequest input) {
    if (input == null) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REFERENCE", "Tracking request is required");
    String carrier = normalizeCode(input.carrier(), "COSCO");
    if (!List.of("COSCO", "CMA").contains(carrier)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REFERENCE", "Unsupported carrier");
    }
    String channel = normalizeCode(input.channel(), "AUTO");
    if ("CMA".equals(carrier)) channel = "PLAYWRIGHT";
    if (!SUPPORTED_CHANNELS.contains(channel)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REFERENCE", "Unsupported tracking channel");
    }
    String type = normalizeCode(input.type(), "BILLOFLADING");
    if (!SUPPORTED_TYPES.contains(type)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REFERENCE", "Unsupported shipment number type");
    }
    String number = normalizeReference(input.number());
    if ("COSCO".equals(carrier) && "BILLOFLADING".equals(type)) {
      java.util.regex.Matcher prefixed = number.matches("COSU[0-9]{6,20}")
          ? java.util.regex.Pattern.compile("^COSU([0-9]{6,20})$").matcher(number)
          : null;
      if (prefixed != null && prefixed.matches()) number = prefixed.group(1);
    }
    if (!number.matches("[A-Z0-9-]{4,35}")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REFERENCE", "Shipment number format is invalid");
    }
    String batchTaskId = input.batchTaskId() == null ? null : input.batchTaskId().trim();
    if (batchTaskId != null && !batchTaskId.isEmpty()
        && !batchTaskId.matches("[A-Za-z0-9_-]{16,80}")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Batch task id is invalid");
    }
    return new NormalizedTrackRequest(
        carrier,
        channel,
        type,
        number,
        batchTaskId == null || batchTaskId.isEmpty() ? null : batchTaskId
    );
  }

  private ShipmentImportDetails normalizeImportedDetails(
      ShipmentTrackRequest input,
      NormalizedTrackRequest request,
      AuthenticatedUser user
  ) {
    ShipmentImportDetails supplied = input == null ? null : input.importedDetails();
    boolean suppliedValues = hasImportedValues(supplied);
    if (suppliedValues && (user == null || !user.canManageShipmentFiles())) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Business user or administrator permission is required to persist spreadsheet details"
      );
    }

    String rawNumber = normalizeReference(input == null ? null : input.number());
    boolean derivedCosu = "COSCO".equals(request.carrier())
        && "BILLOFLADING".equals(request.type())
        && rawNumber.matches("COSU[0-9]{6,20}");
    String carrierPrefix = cleanImported(
        supplied == null ? null : supplied.carrierPrefix(),
        8
    );
    String originalBill = cleanImported(
        supplied == null ? null : supplied.originalBillOfLading(),
        64
    );
    if (derivedCosu) {
      if (carrierPrefix == null) carrierPrefix = "COSU";
      if (originalBill == null) originalBill = rawNumber;
    }
    if (carrierPrefix != null) {
      carrierPrefix = carrierPrefix.toUpperCase(Locale.ROOT);
      if (!carrierPrefix.matches("[A-Z0-9]{2,8}")) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Carrier prefix format is invalid");
      }
    }
    if (originalBill != null) {
      originalBill = normalizeReference(originalBill);
      if (!originalBill.matches("[A-Z0-9-]{4,64}")) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Original bill of lading format is invalid");
      }
    }
    if (carrierPrefix != null && originalBill == null) {
      originalBill = carrierPrefix + request.number();
    }
    if (carrierPrefix != null && originalBill != null
        && (!originalBill.startsWith(carrierPrefix) || !originalBill.endsWith(request.number()))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Carrier prefix does not match the bill of lading");
    }

    ShipmentImportDetails normalized = new ShipmentImportDetails(
        carrierPrefix,
        originalBill,
        cleanImported(supplied == null ? null : supplied.forwarderJobNumber(), 160),
        cleanImported(supplied == null ? null : supplied.vesselVoyage(), 240),
        cleanImported(supplied == null ? null : supplied.portOfLoading(), 160),
        cleanImported(supplied == null ? null : supplied.portOfDischarge(), 160),
        cleanImported(supplied == null ? null : supplied.clientPoNumber(), 160),
        cleanImported(supplied == null ? null : supplied.estimatedDeparture(), 80),
        cleanImported(supplied == null ? null : supplied.estimatedArrival(), 80),
        cleanImported(supplied == null ? null : supplied.volume(), 80),
        cleanImported(supplied == null ? null : supplied.clientNameCode(), 160)
    );
    return hasImportedValues(normalized) ? normalized : null;
  }

  private boolean hasImportedValues(ShipmentImportDetails details) {
    return details != null && java.util.stream.Stream.of(
        details.carrierPrefix(), details.originalBillOfLading(), details.forwarderJobNumber(),
        details.vesselVoyage(), details.portOfLoading(), details.portOfDischarge(),
        details.clientPoNumber(), details.estimatedDeparture(), details.estimatedArrival(),
        details.volume(), details.clientNameCode()
    ).anyMatch(value -> value != null && !value.isBlank());
  }

  private String cleanImported(String value, int limit) {
    if (value == null) return null;
    String cleaned = value.replaceAll("\\s+", " ").trim();
    if (cleaned.isBlank()) return null;
    return cleaned.length() <= limit ? cleaned : cleaned.substring(0, limit);
  }

  private JsonNode enrichWithImportedDetails(JsonNode upstream, ShipmentImportDetails details) {
    if (details == null || !upstream.isObject() || !upstream.path("snapshot").isObject()) {
      return upstream;
    }
    ObjectNode enriched = ((ObjectNode) upstream).deepCopy();
    ObjectNode snapshot = (ObjectNode) enriched.path("snapshot");
    ObjectNode tracking = childObject(snapshot, "tracking");
    ObjectNode summary = childObject(snapshot, "summary");
    ObjectNode references = childObject(snapshot, "references");
    ObjectNode business = childObject(references, "business");
    ArrayNode extra = snapshot.withArray("extraInformation");

    putIfBlank(tracking, "carrierPrefix", details.carrierPrefix());
    putIfBlank(tracking, "originalNumber", details.originalBillOfLading());
    putIfBlank(references, "carrierPrefix", details.carrierPrefix());
    putIfBlank(references, "originalBillOfLading", details.originalBillOfLading());
    putIfBlank(references, "masterBill", details.originalBillOfLading());
    putIfBlank(summary, "billOfLading", details.originalBillOfLading());
    addExtra(extra, "carrierPrefix", details.carrierPrefix());
    addExtra(extra, "originalBillOfLading", details.originalBillOfLading());

    if (isBlank(business.path("forwarderJobNumber"))) {
      putIfBlank(business, "forwarderJobNumber", details.forwarderJobNumber());
      addExtra(extra, "forwarderJobNumber", details.forwarderJobNumber());
    }
    if (isBlank(business.path("clientPoNumber"))) {
      putIfBlank(business, "clientPoNumber", details.clientPoNumber());
      addExtra(extra, "clientPoNumber", details.clientPoNumber());
    }
    if (isBlank(business.path("clientNameCode"))) {
      putIfBlank(business, "clientNameCode", details.clientNameCode());
      addExtra(extra, "clientNameCode", details.clientNameCode());
    }
    if (!arrayHasText(snapshot.path("routingLegs"), "vesselName", "voyage")
        && !arrayHasText(snapshot.path("sailingSchedule"), "vesselName", "voyage")) {
      addExtra(extra, "vesselVoyage", details.vesselVoyage());
    }
    if (isBlank(summary.path("origin").path("name"))) {
      putIfBlank(childObject(summary, "origin"), "name", details.portOfLoading());
      addExtra(extra, "portOfLoading", details.portOfLoading());
    }
    if (isBlank(summary.path("destination").path("name"))) {
      putIfBlank(childObject(summary, "destination"), "name", details.portOfDischarge());
      addExtra(extra, "portOfDischarge", details.portOfDischarge());
    }
    ObjectNode keyTimes = childObject(snapshot, "keyTimes");
    if (isBlank(keyTimes.path("actualDeparture").path("time"))
        && !arrayHasText(snapshot.path("routingLegs"), "estimatedDeparture", "actualDeparture")) {
      putIfBlank(
          childObject(keyTimes, "estimatedDeparture"),
          "time",
          details.estimatedDeparture()
      );
      addExtra(extra, "estimatedDeparture", details.estimatedDeparture());
    }
    if (isBlank(keyTimes.path("estimatedDelivery").path("time"))
        && isBlank(keyTimes.path("actualArrival").path("time"))
        && !arrayHasText(snapshot.path("routingLegs"), "estimatedArrival", "actualArrival")) {
      putIfBlank(
          childObject(keyTimes, "estimatedFinalArrival"),
          "time",
          details.estimatedArrival()
      );
      addExtra(extra, "estimatedArrival", details.estimatedArrival());
    }
    if (!arrayHasText(snapshot.path("containers"), "sizeType", "type", "isoSizeType")
        && !arrayHasText(summary.path("containers"), "sizeType", "type", "isoSizeType")) {
      addExtra(extra, "volume", details.volume());
    }
    return enriched;
  }

  private ObjectNode childObject(ObjectNode parent, String field) {
    JsonNode current = parent.path(field);
    if (current.isObject()) return (ObjectNode) current;
    ObjectNode created = objectMapper.createObjectNode();
    parent.set(field, created);
    return created;
  }

  private void putIfBlank(ObjectNode target, String field, String value) {
    if (value != null && !value.isBlank() && isBlank(target.path(field))) target.put(field, value);
  }

  private boolean isBlank(JsonNode value) {
    return value == null || value.isMissingNode() || value.isNull() || value.asText("").isBlank();
  }

  private boolean arrayHasText(JsonNode array, String... fields) {
    if (!array.isArray()) return false;
    for (JsonNode item : array) {
      for (String field : fields) {
        if (!isBlank(item.path(field))) return true;
      }
    }
    return false;
  }

  private void addExtra(ArrayNode extra, String key, String value) {
    if (value == null || value.isBlank()) return;
    for (JsonNode item : extra) {
      if (key.equals(item.path("key").asText())) return;
    }
    ObjectNode item = extra.addObject();
    item.put("key", key);
    item.put("value", value);
    item.put("source", "SPREADSHEET");
  }

  private CachedShipment mapCachedShipment(ResultSet rs, int rowNumber) throws SQLException {
    return new CachedShipment(
        rs.getLong("shipment_id"),
        rs.getString("public_id"),
        rs.getString("snapshot_json"),
        rs.getString("strategy_json"),
        instant(rs, "fetched_at"),
        instant(rs, "fresh_until")
    );
  }

  private Duration cacheTtl() {
    Duration configured = properties.getCacheTtl();
    return configured == null || configured.isNegative() || configured.isZero()
        ? Duration.ofMinutes(15)
        : configured;
  }

  private String normalizeCode(String value, String fallback) {
    return value == null || value.isBlank()
        ? fallback
        : value.trim().toUpperCase(Locale.ROOT);
  }

  private String normalizeReference(String value) {
    return value == null
        ? ""
        : value.trim().replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
  }

  private String writeJson(JsonNode node) {
    try {
      return objectMapper.writeValueAsString(node);
    } catch (JsonProcessingException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize shipment data");
    }
  }

  private JsonNode readJson(String value) {
    try {
      return objectMapper.readTree(value);
    } catch (JsonProcessingException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Stored shipment data is invalid");
    }
  }

  private String sha256(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException("SHA-256 is unavailable", impossible);
    }
  }

  private Instant parseInstant(String value, Instant fallback) {
    if (value == null || value.isBlank()) return fallback;
    try {
      return Instant.parse(value);
    } catch (RuntimeException ignored) {
      return fallback;
    }
  }

  private Instant instant(ResultSet rs, String column) throws SQLException {
    Timestamp timestamp = rs.getTimestamp(column);
    return timestamp == null ? null : timestamp.toInstant();
  }

  private Timestamp timestamp(Instant value) {
    return Timestamp.from(value);
  }

  private String trim(String value, int maxLength) {
    if (value == null || value.isBlank()) return null;
    String normalized = value.trim();
    return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
  }

  private record ShipmentIdentity(long id, String publicId) {}

  private record ShipmentReference(
      String carrier,
      String type,
      String rawNumber,
      String normalizedNumber,
      boolean primaryReference
  ) {}

  private record CachedShipment(
      long shipmentId,
      String shipmentPublicId,
      String snapshotJson,
      String strategyJson,
      Instant fetchedAt,
      Instant freshUntil
  ) {}

  private record CustomerAssignedShipment(
      CachedShipment cached,
      String carrier,
      String referenceType,
      String referenceNo,
      String trackingStatus,
      Instant lastTrackedAt
  ) {}

  private record ImportedCustomerMatch(long customerId, String partyRole) {}

  private record PersistedShipment(
      long shipmentId,
      String shipmentPublicId,
      Instant fetchedAt,
      Instant freshUntil
  ) {}
}
