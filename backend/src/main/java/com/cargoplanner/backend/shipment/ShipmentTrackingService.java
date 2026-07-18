package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.shipment.TrackingAdapterClient.NormalizedTrackRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
  private final ShipmentAccessService accessService;
  private final ShipmentTrackingProperties properties;
  private final TransactionTemplate transactionTemplate;
  private final Clock clock;

  public ShipmentTrackingService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      TrackingAdapterClient adapterClient,
      ShipmentAccessService accessService,
      ShipmentTrackingProperties properties,
      PlatformTransactionManager transactionManager
  ) {
    this(
        jdbcTemplate,
        objectMapper,
        adapterClient,
        accessService,
        properties,
        new TransactionTemplate(transactionManager),
        Clock.systemUTC()
    );
  }

  ShipmentTrackingService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      TrackingAdapterClient adapterClient,
      ShipmentAccessService accessService,
      ShipmentTrackingProperties properties,
      TransactionTemplate transactionTemplate,
      Clock clock
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.adapterClient = adapterClient;
    this.accessService = accessService;
    this.properties = properties;
    this.transactionTemplate = transactionTemplate;
    this.clock = clock;
  }

  public ObjectNode track(ShipmentTrackRequest input, AuthenticatedUser user) {
    NormalizedTrackRequest request = normalize(input);
    boolean forceRefresh = Boolean.TRUE.equals(input == null ? null : input.forceRefresh());
    if (forceRefresh && (user == null || !user.canManageShipmentFiles())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Only business users or administrators may force a refresh");
    }

    // Container numbers are reusable transport equipment identifiers, not durable shipment
    // identities. Never resolve a long-lived shipment aggregate from a container-only alias.
    CachedShipment cached = isDurableReferenceType(request.type()) ? findCached(request) : null;
    Instant now = clock.instant();
    if (!forceRefresh && cached != null && cached.freshUntil() != null && cached.freshUntil().isAfter(now)) {
      return cachedResponse(cached, user, false);
    }

    JsonNode upstream;
    try {
      upstream = adapterClient.track(request);
    } catch (ApiException error) {
      if (cached != null && (error.status().is5xxServerError() || error.status() == HttpStatus.TOO_MANY_REQUESTS)) {
        ObjectNode response = cachedResponse(cached, user, true);
        response.put("warning", error.getMessage());
        return response;
      }
      throw error;
    }

    JsonNode snapshot = upstream.path("snapshot");
    if (!snapshot.isObject()) {
      throw new ApiException(HttpStatus.BAD_GATEWAY, "Tracking adapter returned an incomplete snapshot");
    }
    if (extractReferences(request, snapshot).isEmpty()) {
      return transientLiveResponse(upstream);
    }

    PersistedShipment persisted = persistAtomically(request, upstream, cached, user, now);
    if (persisted == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to persist tracking result");
    }
    return liveResponse(upstream, persisted, user);
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
        now
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
    return new PersistedShipment(shipment.id(), shipment.publicId(), fetchedAt, freshUntil);
  }

  private CachedShipment findCached(NormalizedTrackRequest request) {
    List<CachedShipment> records = jdbcTemplate.query(
        """
        SELECT s.id AS shipment_id, s.public_id, t.snapshot_json, t.strategy_json,
               t.fetched_at, t.fresh_until
        FROM cp_shipment_references r
        JOIN cp_shipments s ON s.id = r.shipment_id
        LEFT JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE r.carrier_code = ? AND r.reference_type = ? AND r.reference_no_normalized = ?
        LIMIT 1
        """,
        this::mapCachedShipment,
        request.carrier(),
        request.type(),
        normalizeReference(request.number())
    );
    CachedShipment record = records.isEmpty() ? null : records.get(0);
    return record == null || record.snapshotJson() == null ? null : record;
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
      Instant now
  ) {
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbcTemplate.update((connection) -> {
      PreparedStatement statement = connection.prepareStatement(
          """
          INSERT INTO cp_tracking_snapshots (
            shipment_id, query_reference_type, query_reference_no, source_channel,
            snapshot_json, strategy_json, payload_sha256, fetched_at, fresh_until, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          Statement.RETURN_GENERATED_KEYS
      );
      statement.setLong(1, shipmentId);
      statement.setString(2, request.type());
      statement.setString(3, request.number());
      statement.setString(4, trim(snapshot.path("channel").asText(request.channel()), 32));
      statement.setString(5, snapshotJson);
      statement.setString(6, strategyJson);
      statement.setString(7, sha256(snapshotJson));
      statement.setTimestamp(8, timestamp(fetchedAt));
      statement.setTimestamp(9, timestamp(freshUntil));
      statement.setTimestamp(10, timestamp(now));
      return statement;
    }, keyHolder);
    Number key = keyHolder.getKey();
    if (key == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save tracking snapshot");
    }
    return key.longValue();
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
    if (input == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Tracking request is required");
    String carrier = normalizeCode(input.carrier(), "COSCO");
    if (!"COSCO".equals(carrier)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported carrier");
    }
    String channel = normalizeCode(input.channel(), "AUTO");
    if (!SUPPORTED_CHANNELS.contains(channel)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported tracking channel");
    }
    String type = normalizeCode(input.type(), "BILLOFLADING");
    if (!SUPPORTED_TYPES.contains(type)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported shipment number type");
    }
    String number = normalizeReference(input.number());
    if (!number.matches("[A-Z0-9-]{4,35}")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment number format is invalid");
    }
    return new NormalizedTrackRequest(carrier, channel, type, number);
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

  private record PersistedShipment(
      long shipmentId,
      String shipmentPublicId,
      Instant fetchedAt,
      Instant freshUntil
  ) {}
}
