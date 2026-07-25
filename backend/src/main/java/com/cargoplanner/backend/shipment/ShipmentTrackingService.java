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
  private static final List<String> SUPPORTED_CHANNELS = List.of(
      "AUTO", "NETWORK", "PLAYWRIGHT", "PROXY"
  );

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
   * Persists a non-COSU spreadsheet row as a manual placeholder without calling a carrier.
   * Imported business fields remain available to the operator, while customer views keep the
   * tracking payload unavailable until an operator saves confirmed tracking information.
   */
  public synchronized ObjectNode recordImportedPlaceholder(
      ShipmentBatchItemRequest input,
      AuthenticatedUser user
  ) {
    try {
      return transactionTemplate.execute(
          status -> recordImportedPlaceholderInTransaction(input, user)
      );
    } catch (DuplicateKeyException race) {
      // Another application instance may have created the same durable reference first.
      return transactionTemplate.execute(
          status -> recordImportedPlaceholderInTransaction(input, user)
      );
    }
  }

  private ObjectNode recordImportedPlaceholderInTransaction(
      ShipmentBatchItemRequest input,
      AuthenticatedUser user
  ) {
    if (user == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Sign in is required");
    if (!user.canManageShipmentFiles()) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Business user or administrator permission is required"
      );
    }
    if (input == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment row is required");

    ShipmentImportDetails details = input.importedDetails();
    String type = normalizeCode(input.type(), "BILLOFLADING");
    if (!isDurableReferenceType(type)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only booking or bill-of-lading rows can be imported");
    }
    String originalBill = cleanImported(details == null ? null : details.originalBillOfLading(), 64);
    String displayNumber = cleanImported(input.displayNumber(), 128);
    String suppliedNumber = cleanImported(input.number(), 128);
    String referenceNo = normalizeReference(
        originalBill != null ? originalBill : displayNumber != null ? displayNumber : suppliedNumber
    );
    if (!referenceNo.matches("[A-Z0-9./-]{4,128}")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment number format is invalid");
    }
    String prefix = cleanImported(details == null ? null : details.carrierPrefix(), 8);
    if (prefix == null && "BILLOFLADING".equals(type)
        && referenceNo.matches("[A-Z]{4}[A-Z0-9./-]{4,124}")) {
      prefix = referenceNo.substring(0, 4);
    }
    String requestedCarrier = cleanImported(input.carrier(), 32);
    String carrier = normalizeCode(prefix != null ? prefix : requestedCarrier, "UNSUPPORTED");
    if (!carrier.matches("[A-Z0-9_-]{2,32}")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Carrier code format is invalid");
    }
    details = sanitizeImportedDetails(details, prefix, originalBill);

    ShipmentReference reference = new ShipmentReference(
        carrier,
        type,
        referenceNo,
        referenceNo,
        true
    );
    ShipmentIdentity shipment = findShipmentByAnyReference(List.of(reference));
    Instant now = clock.instant();
    boolean created = false;
    if (shipment == null) {
      shipment = createShipment(carrier, user, now);
      // Insert without a pre-check so the durable-reference unique key is the
      // cross-instance ownership arbiter. A conflict rolls this transaction
      // back (including the new shipment); the outer retry reloads the winner.
      insertReference(shipment.id(), reference);
      created = true;
    } else if (!accessService.hasAccess(shipment.publicId(), user)) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Shipment import access has not been granted"
      );
    }

    jdbcTemplate.queryForObject(
        "SELECT id FROM cp_shipments WHERE id = ? FOR UPDATE",
        Long.class,
        shipment.id()
    );

    boolean importedDetailsChanged = persistImportedBusinessFields(shipment.id(), details, now);
    if (created || !hasCurrentSnapshot(shipment.id())) {
      ObjectNode snapshot = objectMapper.createObjectNode();
      snapshot.putObject("provider").put("code", carrier);
      snapshot.put("channel", "IMPORTED_MANUAL");
      snapshot.put("fetchedAt", now.toString());
      ObjectNode tracking = snapshot.putObject("tracking");
      tracking.put("type", type);
      tracking.put("number", referenceNo);
      tracking.put("status", "PENDING_MANUAL");
      ArrayNode extra = snapshot.putArray("extraInformation");
      addExtra(extra, "vesselVoyage",
          cleanImported(details == null ? null : details.vesselVoyage(), 240));
      addExtra(extra, "portOfLoading",
          cleanImported(details == null ? null : details.portOfLoading(), 160));
      addExtra(extra, "portOfDischarge",
          cleanImported(details == null ? null : details.portOfDischarge(), 160));
      addExtra(extra, "estimatedDeparture",
          cleanImported(details == null ? null : details.estimatedDeparture(), 80));
      addExtra(extra, "estimatedArrival",
          cleanImported(details == null ? null : details.estimatedArrival(), 80));
      addExtra(extra, "volume",
          cleanImported(details == null ? null : details.volume(), 80));

      ObjectNode envelope = objectMapper.createObjectNode();
      envelope.set("snapshot", snapshot);
      JsonNode routed = ensureRouteFallback(envelope, details).path("snapshot");
      if (routed.isObject()) snapshot = (ObjectNode) routed;

      String snapshotJson = writeJson(snapshot);
      long snapshotId = insertSnapshot(
          shipment.id(),
          new NormalizedTrackRequest(carrier, "AUTO", type, referenceNo, null),
          snapshot,
          snapshotJson,
          null,
          now,
          now,
          now,
          user
      );
      jdbcTemplate.update(
          "UPDATE cp_shipments SET current_snapshot_id = ?, tracking_status = 'Pending manual update', updated_at = ? WHERE id = ?",
          snapshotId,
          timestamp(now),
          shipment.id()
      );
    } else {
      importedDetailsChanged = mergeImportedDetailsIntoCurrentSnapshot(shipment.id(), details, now)
          || importedDetailsChanged;
    }

    PersistedShipment persisted = new PersistedShipment(shipment.id(), shipment.publicId(), now, now);
    matchImportedClientCode(persisted, details, user, now);
    ObjectNode response = objectMapper.createObjectNode();
    response.put("shipmentId", shipment.publicId());
    response.put("persisted", true);
    response.put("manualEntry", true);
    response.put("created", created);
    response.put("updated", created || importedDetailsChanged);
    response.put("unchanged", !created && !importedDetailsChanged);
    response.put("cacheSource", "IMPORTED_PLACEHOLDER");
    return response;
  }

  private boolean hasCurrentSnapshot(long shipmentId) {
    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*)
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE s.id = ? AND t.invalidated_at IS NULL
        """,
        Integer.class,
        shipmentId
    );
    return count != null && count > 0;
  }

  private boolean mergeImportedDetailsIntoCurrentSnapshot(
      long shipmentId,
      ShipmentImportDetails details,
      Instant now
  ) {
    if (details == null) return false;
    List<CurrentSnapshot> current = jdbcTemplate.query(
        """
        SELECT t.id, t.snapshot_json
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE s.id = ? AND t.invalidated_at IS NULL
        LIMIT 1
        """,
        (rs, rowNumber) -> new CurrentSnapshot(
            rs.getLong("id"), rs.getString("snapshot_json")
        ),
        shipmentId
    );
    if (current.isEmpty()) return false;
    ObjectNode envelope = objectMapper.createObjectNode();
    envelope.set("snapshot", readJson(current.get(0).snapshotJson()));
    JsonNode enriched = ensureRouteFallback(
        enrichWithImportedDetails(envelope, details),
        details
    ).path("snapshot");
    String snapshotJson = writeJson(enriched);
    if (snapshotJson.equals(current.get(0).snapshotJson())) return false;
    jdbcTemplate.update(
        "UPDATE cp_tracking_snapshots SET snapshot_json = ?, payload_sha256 = ? WHERE id = ?",
        snapshotJson,
        sha256(snapshotJson),
        current.get(0).id()
    );
    jdbcTemplate.update(
        "UPDATE cp_shipments SET updated_at = ? WHERE id = ?",
        timestamp(now),
        shipmentId
    );
    return true;
  }

  private boolean persistImportedBusinessFields(
      long shipmentId,
      ShipmentImportDetails details,
      Instant now
  ) {
    if (details == null) return false;
    ImportedBusinessFields current = jdbcTemplate.queryForObject(
        """
        SELECT job_number, client_po_number, client_name_code, original_bill_of_lading
        FROM cp_shipments WHERE id = ?
        """,
        (rs, rowNumber) -> new ImportedBusinessFields(
            rs.getString("job_number"),
            rs.getString("client_po_number"),
            rs.getString("client_name_code"),
            rs.getString("original_bill_of_lading")
        ),
        shipmentId
    );
    ImportedBusinessFields updated = new ImportedBusinessFields(
        firstNonNull(details.forwarderJobNumber(), current.jobNumber()),
        firstNonNull(details.clientPoNumber(), current.clientPoNumber()),
        firstNonNull(details.clientNameCode(), current.clientNameCode()),
        firstNonNull(details.originalBillOfLading(), current.originalBillOfLading())
    );
    if (updated.equals(current)) return false;
    jdbcTemplate.update(
        """
        UPDATE cp_shipments
        SET job_number = ?, client_po_number = ?, client_name_code = ?,
            original_bill_of_lading = ?, updated_at = ?
        WHERE id = ?
        """,
        updated.jobNumber(), updated.clientPoNumber(), updated.clientNameCode(),
        updated.originalBillOfLading(), timestamp(now), shipmentId
    );
    return true;
  }

  private String firstNonNull(String preferred, String fallback) {
    return preferred == null ? fallback : preferred;
  }

  private ShipmentImportDetails sanitizeImportedDetails(
      ShipmentImportDetails details,
      String carrierPrefix,
      String originalBillOfLading
  ) {
    if (details == null && carrierPrefix == null && originalBillOfLading == null) return null;
    return new ShipmentImportDetails(
        carrierPrefix == null ? null : carrierPrefix.toUpperCase(Locale.ROOT),
        originalBillOfLading,
        cleanImported(details == null ? null : details.forwarderJobNumber(), 160),
        cleanImported(details == null ? null : details.vesselVoyage(), 240),
        cleanImported(details == null ? null : details.portOfLoading(), 160),
        cleanImported(details == null ? null : details.portOfDischarge(), 160),
        cleanImported(details == null ? null : details.clientPoNumber(), 160),
        cleanImported(details == null ? null : details.estimatedDeparture(), 80),
        cleanImported(details == null ? null : details.estimatedArrival(), 80),
        cleanImported(details == null ? null : details.volume(), 80),
        cleanImported(details == null ? null : details.clientNameCode(), 160)
    );
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
    CustomerAccessQuery accessQuery = customerAccessQuery(
        customer, "a", customer.scopeCustomerId()
    );
    String publicationFilter = isOverseaAgent(customer)
        ? ""
        : " AND a.publication_status = 'PUBLISHED'";
    List<Object> parameters = new ArrayList<>(accessQuery.parameters());
    parameters.add(request.carrier());
    parameters.add(request.type());
    parameters.add(normalizeReference(request.number()));
    List<CachedShipment> records = jdbcTemplate.query(
        ("""
        SELECT s.id AS shipment_id, s.public_id, t.snapshot_json, t.strategy_json,
               t.fetched_at, t.fresh_until
        FROM cp_customer_shipment_access a
        JOIN cp_shipments s ON s.id = a.shipment_id
        JOIN cp_shipment_references r ON r.shipment_id = s.id
        LEFT JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        WHERE %s
          %s
          AND r.carrier_code = ?
          AND r.reference_type = ?
          AND r.reference_no_normalized = ?
        LIMIT 1
        """).formatted(accessQuery.predicate(), publicationFilter),
        this::mapCachedShipment,
        parameters.toArray()
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

  /** Returns one assigned shipment by its durable public id. */
  public ObjectNode readAssignedSnapshotByShipmentId(
      String shipmentPublicId,
      CustomerPrincipal customer
  ) {
    if (customer == null) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Customer sign in is required");
    }
    CustomerAccessQuery accessQuery = customerAccessQuery(
        customer, "a", customer.scopeCustomerId()
    );
    String publicationFilter = isOverseaAgent(customer)
        ? ""
        : " AND a.publication_status = 'PUBLISHED'";
    List<Object> parameters = new ArrayList<>(accessQuery.parameters());
    parameters.add(shipmentPublicId == null ? "" : shipmentPublicId.trim());
    List<CachedShipment> records = jdbcTemplate.query(
        ("""
        SELECT s.id AS shipment_id, s.public_id, t.snapshot_json, t.strategy_json,
               t.fetched_at, t.fresh_until
        FROM cp_customer_shipment_access a
        JOIN cp_shipments s ON s.id = a.shipment_id
        LEFT JOIN cp_tracking_snapshots t
          ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        WHERE %s
          %s
          AND s.public_id = ?
        LIMIT 1
        """).formatted(accessQuery.predicate(), publicationFilter),
        this::mapCachedShipment,
        parameters.toArray()
    );
    if (records.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Assigned shipment was not found");
    }
    CachedShipment cached = records.get(0);
    if (cached.snapshotJson() == null || !isUsableCachedSnapshot(cached.snapshotJson())) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "Assigned shipment has no confirmed tracking data; contact your business representative"
      );
    }
    ObjectNode response = cachedResponse(cached, null, false);
    response.set(
        "snapshot",
        overlayStoredBusinessFields(
            response.path("snapshot").deepCopy(),
            shipmentBusinessFields(cached.shipmentId())
        )
    );
    response.put("cacheSource", "MYSQL_ASSIGNED");
    response.put("fileAccess", true);
    response.put("customerReadOnly", true);
    return response;
  }

  /** Lists the database-backed shipment records visible to a customer session. */
  public ObjectNode listAssignedSnapshots(CustomerPrincipal customer) {
    return listAssignedSnapshots(customer, 1, 20);
  }

  /** Lists one page of shipments visible to the signed-in customer. */
  public ObjectNode listAssignedSnapshots(
      CustomerPrincipal customer,
      int requestedPage,
      int requestedPageSize
  ) {
    return listAssignedSnapshots(customer, requestedPage, requestedPageSize, false);
  }

  public ObjectNode listAssignedSnapshots(
      CustomerPrincipal customer,
      int requestedPage,
      int requestedPageSize,
      boolean requestedFollowingOnly
  ) {
    return listAssignedSnapshots(
        customer, requestedPage, requestedPageSize, requestedFollowingOnly, null
    );
  }

  public ObjectNode listAssignedSnapshots(
      CustomerPrincipal customer,
      int requestedPage,
      int requestedPageSize,
      boolean requestedFollowingOnly,
      String requestedCustomerPublicId
  ) {
    if (customer == null) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Customer sign in is required");
    }
    Long selectedCustomerId = resolveRequestedCustomerScope(
        customer, requestedCustomerPublicId
    );
    int page = Math.max(1, requestedPage);
    int pageSize = Math.max(5, Math.min(100, requestedPageSize));
    boolean overseaAgent = isOverseaAgent(customer);
    long followAgentId = overseaAgent ? customer.id() : -1L;
    boolean followingOnly = requestedFollowingOnly && overseaAgent;
    CustomerAccessQuery accessQuery = customerAccessQuery(
        customer, "a", selectedCustomerId
    );
    String publicationFilter = overseaAgent
        ? ""
        : " AND a.publication_status = 'PUBLISHED'";
    List<Object> totalParameters = new ArrayList<>(accessQuery.parameters());
    totalParameters.add(followingOnly);
    totalParameters.add(followAgentId);
    Long totalValue = jdbcTemplate.queryForObject(
        ("""
        SELECT COUNT(DISTINCT a.shipment_id)
        FROM cp_customer_shipment_access a
        WHERE %s
          %s
          AND (? = FALSE OR EXISTS (
            SELECT 1 FROM cp_oversea_agent_shipment_follows follow
            WHERE follow.oversea_agent_customer_id = ?
              AND follow.shipment_id = a.shipment_id
          ))
        """).formatted(accessQuery.predicate(), publicationFilter),
        Long.class,
        totalParameters.toArray()
    );
    long total = totalValue == null ? 0 : totalValue;
    int totalPages = total == 0 ? 0 : (int) ((total + pageSize - 1) / pageSize);
    if (totalPages == 0) page = 1;
    else if (page > totalPages) page = totalPages;
    int offset = (page - 1) * pageSize;
    List<Object> listParameters = new ArrayList<>();
    listParameters.add(followAgentId);
    listParameters.add(followAgentId);
    listParameters.addAll(accessQuery.parameters());
    listParameters.add(followingOnly);
    listParameters.add(followAgentId);
    listParameters.add(pageSize);
    listParameters.add(offset);
    List<CustomerAssignedShipment> records = jdbcTemplate.query(
        """
        SELECT s.id AS shipment_id, s.public_id, s.carrier_code, s.tracking_status,
               s.last_tracked_at, s.job_number, s.client_po_number, s.client_name_code,
               s.original_bill_of_lading, s.business_note,
               assigned.assigned_at, assigned.publication_status,
               r.reference_type, r.reference_no_raw,
               t.snapshot_json, t.strategy_json, t.fetched_at, t.fresh_until,
               EXISTS (
                 SELECT 1 FROM cp_oversea_agent_shipment_follows follow
                 WHERE follow.oversea_agent_customer_id = ?
                   AND follow.shipment_id = s.id
               ) AS agent_followed,
               (
                 SELECT follow.last_refreshed_at
                 FROM cp_oversea_agent_shipment_follows follow
                 WHERE follow.oversea_agent_customer_id = ?
                   AND follow.shipment_id = s.id
               ) AS agent_last_refreshed_at
        FROM cp_shipments s
        JOIN (
          SELECT a.shipment_id, MAX(a.assigned_at) AS assigned_at,
                 MAX(a.publication_status) AS publication_status
          FROM cp_customer_shipment_access a
          WHERE %s
            %s
            AND (? = FALSE OR EXISTS (
              SELECT 1 FROM cp_oversea_agent_shipment_follows follow
              WHERE follow.oversea_agent_customer_id = ?
                AND follow.shipment_id = a.shipment_id
            ))
          GROUP BY a.shipment_id
        ) assigned ON assigned.shipment_id = s.id
        LEFT JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id FROM cp_shipment_references r2
          WHERE r2.shipment_id = s.id
          ORDER BY CASE WHEN r2.reference_type = 'BOOKING' THEN 0 ELSE 1 END,
                   r2.primary_reference DESC, r2.id ASC LIMIT 1
        )
        LEFT JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        ORDER BY assigned.assigned_at DESC, s.updated_at DESC
        LIMIT ? OFFSET ?
        """.formatted(accessQuery.predicate(), publicationFilter),
        (rs, rowNumber) -> new CustomerAssignedShipment(
            new CachedShipment(
                rs.getLong("shipment_id"), rs.getString("public_id"),
                rs.getString("snapshot_json"), rs.getString("strategy_json"),
                instant(rs, "fetched_at"), instant(rs, "fresh_until")
            ),
            rs.getString("carrier_code"), rs.getString("reference_type"),
            rs.getString("reference_no_raw"), rs.getString("tracking_status"),
            instant(rs, "last_tracked_at"),
            new ImportedBusinessFields(
                rs.getString("job_number"),
                rs.getString("client_po_number"),
                rs.getString("client_name_code"),
                rs.getString("original_bill_of_lading")
            ),
            rs.getString("business_note"),
            instant(rs, "assigned_at"),
            rs.getString("publication_status"),
            rs.getBoolean("agent_followed"),
            instant(rs, "agent_last_refreshed_at")
        ),
        listParameters.toArray()
    );
    Map<Long, List<AssignedCustomer>> assignedCustomers =
        assignedCustomersByShipment(customer, records, selectedCustomerId);
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
      item.put("note", record.note());
      item.put("assignedAt", record.assignedAt() == null ? null : record.assignedAt().toString());
      item.put("publicationStatus", record.publicationStatus());
      item.put("forwarderJobNumber", record.businessFields().jobNumber());
      item.put("clientPoNumber", record.businessFields().clientPoNumber());
      item.put("clientNameCode", record.businessFields().clientNameCode());
      item.put(
          "lastTrackedAt",
          record.lastTrackedAt() == null ? null : record.lastTrackedAt().toString()
      );
      item.put("followed", record.followed());
      item.put(
          "agentLastRefreshedAt",
          record.agentLastRefreshedAt() == null
              ? null
              : record.agentLastRefreshedAt().toString()
      );
      ArrayNode boundCustomers = item.putArray("boundCustomers");
      for (AssignedCustomer assignedCustomer :
          assignedCustomers.getOrDefault(cached.shipmentId(), List.of())) {
        ObjectNode customerItem = boundCustomers.addObject();
        customerItem.put("id", assignedCustomer.publicId());
        customerItem.put("displayName", assignedCustomer.displayName());
        customerItem.put("clientCode", assignedCustomer.clientCode());
        customerItem.put("partyRole", assignedCustomer.partyRole());
      }
      boolean available = cached.snapshotJson() != null
          && isUsableCachedSnapshot(cached.snapshotJson());
      item.put("dataAvailable", available);
      if (available) {
        item.set(
            "snapshot",
            overlayStoredBusinessFields(readJson(cached.snapshotJson()), record.businessFields())
        );
      }
    }
    response.put("total", total);
    response.put("page", page);
    response.put("pageSize", pageSize);
    response.put("totalPages", totalPages);
    response.put("customerReadOnly", true);
    response.put("followingOnly", followingOnly);
    response.put("overseaAgentManagement", overseaAgent);
    if (overseaAgent) {
      List<AssignedCustomer> agentCustomers = overseaAgentCustomers(customer);
      ArrayNode availableCustomers = response.putArray("availableCustomers");
      for (AssignedCustomer assignedCustomer : agentCustomers) {
        ObjectNode customerItem = availableCustomers.addObject();
        customerItem.put("id", assignedCustomer.publicId());
        customerItem.put("displayName", assignedCustomer.displayName());
        customerItem.put("clientCode", assignedCustomer.clientCode());
        customerItem.put("partyRole", assignedCustomer.partyRole());
        customerItem.put("shipmentCount", assignedCustomer.shipmentCount());
      }
      if (selectedCustomerId != null) {
        agentCustomers.stream()
            .filter(item -> item.customerId() == selectedCustomerId)
            .findFirst()
            .ifPresent(selected -> {
              ObjectNode scope = response.putObject("scopeCustomer");
              scope.put("id", selected.publicId());
              scope.put("displayName", selected.displayName());
              scope.put("clientCode", selected.clientCode());
              scope.put("partyRole", selected.partyRole());
            });
      }
    }
    ObjectNode capabilities = response.putObject("capabilities");
    capabilities.put("editShipmentMasterData", false);
    capabilities.put("refreshTracking", overseaAgent);
    capabilities.put("manageFollowing", overseaAgent);
    return response;
  }

  public ObjectNode updateOverseaAgentAssignedShipment(
      String shipmentPublicId,
      CustomerShipmentUpdateRequest request,
      CustomerPrincipal customer
  ) {
    if (customer == null) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Customer sign in is required");
    }
    throw new ApiException(
        HttpStatus.FORBIDDEN,
        "Shipment master data can only be changed by the responsible business operator"
    );
  }

  public ObjectNode setOverseaAgentShipmentFollow(
      String shipmentPublicId,
      boolean following,
      CustomerPrincipal customer
  ) {
    AgentShipmentTarget shipment = requireOverseaAgentShipment(
        shipmentPublicId, customer
    );
    if (following) {
      jdbcTemplate.update(
          """
          INSERT INTO cp_oversea_agent_shipment_follows (
            oversea_agent_customer_id, shipment_id, followed_at
          ) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON DUPLICATE KEY UPDATE followed_at = VALUES(followed_at)
          """,
          customer.id(), shipment.shipmentId()
      );
    } else {
      jdbcTemplate.update(
          """
          DELETE FROM cp_oversea_agent_shipment_follows
          WHERE oversea_agent_customer_id = ? AND shipment_id = ?
          """,
          customer.id(), shipment.shipmentId()
      );
    }
    ObjectNode response = objectMapper.createObjectNode();
    response.put("shipmentId", shipment.shipmentPublicId());
    response.put("following", following);
    return response;
  }

  public ObjectNode refreshOverseaAgentAssignedShipment(
      String shipmentPublicId,
      CustomerPrincipal customer
  ) {
    return refreshOverseaAgentAssignedShipment(shipmentPublicId, null, customer);
  }

  public ObjectNode refreshOverseaAgentAssignedShipment(
      String shipmentPublicId,
      String requestedCustomerPublicId,
      CustomerPrincipal customer
  ) {
    AgentShipmentTarget shipment = requireOverseaAgentShipment(
        shipmentPublicId, customer
    );
    if (requestedCustomerPublicId != null
        && !requestedCustomerPublicId.isBlank()) {
      Long selectedCustomerId = resolveRequestedCustomerScope(
          customer, requestedCustomerPublicId
      );
      requireOverseaAgentShipmentScope(
          shipment.shipmentId(), customer.id(), selectedCustomerId
      );
    }
    if (shipment.referenceType() == null || shipment.referenceNumber() == null) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "Shipment has no booking or bill-of-lading reference to refresh"
      );
    }
    if (!List.of("COSCO", "CMA").contains(
        String.valueOf(shipment.carrier()).toUpperCase(Locale.ROOT)
    )) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Shipment carrier does not support live tracking refresh"
      );
    }
    refreshAutomatically(
        shipment.carrier(),
        shipment.referenceType(),
        shipment.referenceNumber()
    );
    jdbcTemplate.update(
        """
        UPDATE cp_oversea_agent_shipment_follows
        SET last_refreshed_at = CURRENT_TIMESTAMP
        WHERE oversea_agent_customer_id = ? AND shipment_id = ?
        """,
        customer.id(), shipment.shipmentId()
    );
    ObjectNode response = readAssignedSnapshotByShipmentId(
        shipment.shipmentPublicId(), customer
    );
    response.put("overseaAgentManaged", true);
    return response;
  }

  private Map<Long, List<AssignedCustomer>> assignedCustomersByShipment(
      CustomerPrincipal customer,
      List<CustomerAssignedShipment> records,
      Long selectedCustomerId
  ) {
    Map<Long, List<AssignedCustomer>> result = new LinkedHashMap<>();
    if (records.isEmpty()) return result;
    boolean overseaAgent = isOverseaAgent(customer);
    String placeholders = String.join(
        ",", records.stream().map(record -> "?").toList()
    );
    List<Object> parameters = new ArrayList<>();
    records.forEach(record -> parameters.add(record.cached().shipmentId()));
    String customerFilter;
    if (overseaAgent) {
      customerFilter = """
           AND EXISTS (
             SELECT 1
             FROM cp_oversea_agent_shipment_scopes agent_scope
             JOIN cp_oversea_agent_customers agent_customer
               ON agent_customer.oversea_agent_customer_id =
                    agent_scope.oversea_agent_customer_id
              AND agent_customer.customer_id = agent_scope.represented_customer_id
             WHERE agent_scope.shipment_id = a.shipment_id
               AND agent_scope.oversea_agent_customer_id = ?
               AND agent_scope.represented_customer_id = a.customer_id
               AND agent_scope.status = 'ACTIVE'
           )
          """;
      parameters.add(customer.id());
      if (selectedCustomerId != null) {
        customerFilter += " AND a.customer_id = ?";
        parameters.add(selectedCustomerId);
      }
    } else {
      customerFilter = " AND a.customer_id = ?";
      parameters.add(customer.id());
    }
    jdbcTemplate.query(
        ("""
        SELECT DISTINCT a.shipment_id, c.id AS customer_id, c.public_id,
               c.display_name, c.client_code, c.party_role
        FROM cp_customer_shipment_access a
        JOIN cp_customers c ON c.id = a.customer_id AND c.status = 'ACTIVE'
        WHERE a.shipment_id IN (%s)
          %s
        ORDER BY c.display_name, c.username, c.id
        """).formatted(placeholders, customerFilter),
        rs -> {
          long shipmentId = rs.getLong("shipment_id");
          result.computeIfAbsent(shipmentId, ignored -> new ArrayList<>())
              .add(new AssignedCustomer(
                  rs.getLong("customer_id"),
                  rs.getString("public_id"),
                  rs.getString("display_name"),
                  rs.getString("client_code"),
                  rs.getString("party_role"),
                  0
              ));
        },
        parameters.toArray()
    );
    return result;
  }

  private AgentShipmentTarget requireOverseaAgentShipment(
      String shipmentPublicId,
      CustomerPrincipal customer
  ) {
    if (customer == null) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Customer sign in is required");
    }
    if (!"OVERSEA_AGENT".equalsIgnoreCase(customer.partyRole())) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Only an overseas agent may manage shipment follow-up"
      );
    }
    String publicId = shipmentPublicId == null ? "" : shipmentPublicId.trim();
    accessService.requireCustomerAccess(publicId, customer);
    List<AgentShipmentTarget> records = jdbcTemplate.query(
        """
        SELECT s.id, s.public_id, r.carrier_code, r.reference_type, r.reference_no_raw,
               s.business_note, s.job_number, s.client_po_number, s.client_name_code
        FROM cp_shipments s
        LEFT JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id
          FROM cp_shipment_references r2
          WHERE r2.shipment_id = s.id
            AND r2.reference_type IN ('BOOKING', 'BILLOFLADING')
          ORDER BY CASE WHEN r2.reference_type = 'BOOKING' THEN 0 ELSE 1 END,
                   r2.primary_reference DESC, r2.id ASC
          LIMIT 1
        )
        WHERE s.public_id = ?
        LIMIT 1
        """,
        (rs, rowNumber) -> new AgentShipmentTarget(
            rs.getLong("id"),
            rs.getString("public_id"),
            rs.getString("carrier_code"),
            rs.getString("reference_type"),
            rs.getString("reference_no_raw"),
            rs.getString("business_note"),
            rs.getString("job_number"),
            rs.getString("client_po_number"),
            rs.getString("client_name_code")
        ),
        publicId
    );
    if (records.isEmpty()) {
      throw new ApiException(
          HttpStatus.NOT_FOUND,
          "Shipment is not assigned to this overseas agent"
      );
    }
    return records.get(0);
  }

  private boolean isOverseaAgent(CustomerPrincipal customer) {
    return customer != null && customer.isOverseaAgent();
  }

  private Long resolveRequestedCustomerScope(
      CustomerPrincipal customer,
      String requestedCustomerPublicId
  ) {
    String requested = requestedCustomerPublicId == null
        ? ""
        : requestedCustomerPublicId.trim();
    if (!isOverseaAgent(customer)) {
      if (!requested.isBlank() && !customer.publicId().equals(requested)) {
        throw new ApiException(
            HttpStatus.FORBIDDEN,
            "The requested customer is outside the signed-in customer scope"
        );
      }
      return customer.id();
    }
    if (requested.isBlank() && customer.hasCustomerScope()) {
      return customer.scopeCustomerId();
    }
    if (requested.isBlank()) return null;
    List<Long> customerIds = jdbcTemplate.query(
        """
        SELECT represented.id
        FROM cp_oversea_agent_customers agent_customer
        JOIN cp_customers represented
          ON represented.id = agent_customer.customer_id
         AND represented.status = 'ACTIVE'
        WHERE agent_customer.oversea_agent_customer_id = ?
          AND represented.public_id = ?
          AND UPPER(represented.party_role) IN ('SHIPPER', 'CONSIGNEE')
        """,
        (rs, rowNumber) -> rs.getLong("id"),
        customer.id(),
        requested
    );
    if (customerIds.isEmpty()) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "The requested customer is outside the signed-in customer scope"
      );
    }
    return customerIds.get(0);
  }

  private CustomerAccessQuery customerAccessQuery(
      CustomerPrincipal customer,
      String accessAlias,
      Long selectedCustomerId
  ) {
    if (!isOverseaAgent(customer)) {
      return new CustomerAccessQuery(accessAlias + ".customer_id = ?", List.of(customer.id()));
    }
    List<Object> parameters = new ArrayList<>();
    parameters.add(customer.id());
    String selectedCustomerFilter = "";
    if (selectedCustomerId != null) {
      selectedCustomerFilter = " AND " + accessAlias + ".customer_id = ?";
      parameters.add(selectedCustomerId);
    }
    return new CustomerAccessQuery(
        ("""
        EXISTS (
          SELECT 1
          FROM cp_oversea_agent_shipment_scopes agent_scope
          JOIN cp_oversea_agent_customers agent_customer
            ON agent_customer.oversea_agent_customer_id =
                 agent_scope.oversea_agent_customer_id
           AND agent_customer.customer_id = agent_scope.represented_customer_id
          WHERE agent_scope.shipment_id = %s.shipment_id
            AND agent_scope.oversea_agent_customer_id = ?
            AND agent_scope.represented_customer_id = %s.customer_id
            AND agent_scope.status = 'ACTIVE'
        )
        %s
        """).formatted(accessAlias, accessAlias, selectedCustomerFilter),
        parameters
    );
  }

  private List<AssignedCustomer> overseaAgentCustomers(CustomerPrincipal customer) {
    if (!isOverseaAgent(customer)) return List.of();
    return jdbcTemplate.query(
        """
        SELECT represented.id AS customer_id, represented.public_id,
               represented.display_name, represented.client_code,
               represented.party_role,
               (
                 SELECT COUNT(DISTINCT agent_scope.shipment_id)
                 FROM cp_oversea_agent_shipment_scopes agent_scope
                 JOIN cp_customer_shipment_access customer_access
                   ON customer_access.shipment_id = agent_scope.shipment_id
                  AND customer_access.customer_id = agent_scope.represented_customer_id
                 WHERE agent_scope.oversea_agent_customer_id =
                       agent_customer.oversea_agent_customer_id
                   AND agent_scope.represented_customer_id = represented.id
                   AND agent_scope.status = 'ACTIVE'
               ) AS shipment_count
        FROM cp_oversea_agent_customers agent_customer
        JOIN cp_customers represented
          ON represented.id = agent_customer.customer_id
         AND represented.status = 'ACTIVE'
        WHERE agent_customer.oversea_agent_customer_id = ?
          AND UPPER(represented.party_role) IN ('SHIPPER', 'CONSIGNEE')
        ORDER BY represented.display_name, represented.client_code, represented.id
        """,
        (rs, rowNumber) -> new AssignedCustomer(
            rs.getLong("customer_id"),
            rs.getString("public_id"),
            rs.getString("display_name"),
            rs.getString("client_code"),
            rs.getString("party_role"),
            rs.getLong("shipment_count")
        ),
        customer.id()
    );
  }

  private void requireOverseaAgentShipmentScope(
      long shipmentId,
      long overseaAgentCustomerId,
      long representedCustomerId
  ) {
    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*)
        FROM cp_oversea_agent_shipment_scopes agent_scope
        JOIN cp_oversea_agent_customers agent_customer
          ON agent_customer.oversea_agent_customer_id =
               agent_scope.oversea_agent_customer_id
         AND agent_customer.customer_id = agent_scope.represented_customer_id
        JOIN cp_customer_shipment_access customer_access
          ON customer_access.shipment_id = agent_scope.shipment_id
         AND customer_access.customer_id = agent_scope.represented_customer_id
        WHERE agent_scope.shipment_id = ?
          AND agent_scope.oversea_agent_customer_id = ?
          AND agent_scope.represented_customer_id = ?
          AND agent_scope.status = 'ACTIVE'
        """,
        Integer.class,
        shipmentId,
        overseaAgentCustomerId,
        representedCustomerId
    );
    if (count == null || count == 0) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Shipment is outside the selected customer scope"
      );
    }
  }

  private ImportedBusinessFields shipmentBusinessFields(long shipmentId) {
    List<ImportedBusinessFields> values = jdbcTemplate.query(
        """
        SELECT job_number, client_po_number, client_name_code, original_bill_of_lading
        FROM cp_shipments WHERE id = ?
        """,
        (rs, rowNumber) -> new ImportedBusinessFields(
            rs.getString("job_number"),
            rs.getString("client_po_number"),
            rs.getString("client_name_code"),
            rs.getString("original_bill_of_lading")
        ),
        shipmentId
    );
    return values.isEmpty() ? new ImportedBusinessFields(null, null, null, null) : values.get(0);
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
    boolean proxyChannel = "PROXY".equals(request.channel());
    if (proxyChannel && (user == null || !user.canManageShipmentFiles())) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Only business users or administrators may use the proxy tracking channel"
      );
    }
    boolean forceRefresh = proxyChannel
        || Boolean.TRUE.equals(input == null ? null : input.forceRefresh());
    if (forceRefresh && !trustedAutomaticRefresh
        && (user == null || !user.canManageShipmentFiles())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Only business users or administrators may force a refresh");
    }

    // Container numbers are reusable transport equipment identifiers, not durable shipment
    // identities. Never resolve a long-lived shipment aggregate from a container-only alias.
    CachedShipment cached = (user != null || trustedAutomaticRefresh)
        && isDurableReferenceType(request.type()) ? findCached(request) : null;
    Instant now = clock.instant();
    if (!forceRefresh && cached != null) {
      boolean importedDetailsChanged = false;
      if (importedDetails != null) {
        importedDetailsChanged = persistImportedBusinessFields(
            cached.shipmentId(), importedDetails, now
        );
        importedDetailsChanged = mergeImportedDetailsIntoCurrentSnapshot(
            cached.shipmentId(), importedDetails, now
        ) || importedDetailsChanged;
        matchImportedClientCode(
            new PersistedShipment(
                cached.shipmentId(),
                cached.shipmentPublicId(),
                cached.fetchedAt(),
                cached.freshUntil()
            ),
            importedDetails,
            user,
            now
        );
        CachedShipment updated = findCached(request);
        if (updated != null) cached = updated;
      }
      boolean stale = cached.freshUntil() == null || cached.freshUntil().isBefore(now);
      ObjectNode response = cachedResponse(cached, user, stale);
      if (stale) {
        response.put("cacheStale", true);
      }
      if (importedDetails != null) {
        response.put("importedDetailsUpdated", importedDetailsChanged);
        response.put("importedDetailsUnchanged", !importedDetailsChanged);
      }
      return response;
    }

    JsonNode upstream;
    try {
      if ("CMA".equals(request.carrier())) {
        CmaTrackingSessionService.CmaSessionCredentials credentials =
            cmaTrackingSessionService.requireCredentials();
        upstream = forceRefresh
            ? adapterClient.track(request, credentials, true)
            : adapterClient.track(request, credentials);
      } else {
        upstream = forceRefresh
            ? adapterClient.track(request, true)
            : adapterClient.track(request);
      }
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
      throw new ApiException(
          error.status(), failureCode, error.getMessage(), error.retryAfterMs()
      );
    }

    JsonNode snapshot = upstream.path("snapshot");
    if (!snapshot.isObject()) {
      throw new ApiException(
          HttpStatus.BAD_GATEWAY, "UPSTREAM_EMPTY",
          "Tracking adapter returned an incomplete snapshot"
      );
    }
    upstream = enrichWithImportedDetails(upstream, importedDetails);
    upstream = ensureRouteFallback(upstream, importedDetails);
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

    if (user == null && !trustedAutomaticRefresh) {
      return transientLiveResponse(upstream);
    }

    PersistedShipment persisted = persistAtomically(
        request, upstream, cached, importedDetails, user, now
    );
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
            "SELECT id, party_role FROM cp_customers WHERE client_code = ? AND status = 'ACTIVE' AND responsible_agent_id = ?",
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
      syncOverseaAgentScopeForShipment(match.customerId(), shipment.shipmentId());
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

  private void syncOverseaAgentScopeForShipment(long customerId, long shipmentId) {
    jdbcTemplate.update(
        """
        DELETE FROM cp_oversea_agent_shipment_scopes
        WHERE represented_customer_id = ? AND shipment_id = ?
        """,
        customerId,
        shipmentId
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_oversea_agent_shipment_scopes (
          shipment_id, oversea_agent_customer_id, represented_customer_id,
          status, assigned_by, assigned_at, updated_at
        )
        SELECT shipment_access.shipment_id,
               link.oversea_agent_customer_id, link.customer_id,
               'ACTIVE', link.assigned_by, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6)
        FROM cp_oversea_agent_customers link
        JOIN cp_customer_shipment_access shipment_access
          ON shipment_access.customer_id = link.customer_id
         AND shipment_access.shipment_id = ?
        WHERE link.customer_id = ?
        """,
        shipmentId,
        customerId
    );
  }

  public JsonNode cancelBatchTask(String taskId) {
    String normalized = taskId == null ? "" : taskId.trim();
    if (!normalized.matches("[A-Za-z0-9_-]{16,80}")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Batch task id is invalid");
    }
    return adapterClient.cancelBatchTask(normalized);
  }

  ObjectNode loadSupplementalDetails(
      String shipmentPublicId,
      ShipmentTrackRequest input,
      AuthenticatedUser user
  ) {
    requireBatchShipmentAccess(shipmentPublicId, user);
    NormalizedTrackRequest request = normalize(input);
    if (!"COSCO".equals(request.carrier()) || "CONTAINER".equals(request.type())) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Supplemental details are available for COSCO bill or booking queries only"
      );
    }
    Integer referenceMatches = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*)
        FROM cp_shipments s
        JOIN cp_shipment_references r ON r.shipment_id = s.id
        WHERE s.public_id = ? AND r.carrier_code = ? AND r.reference_type = ?
          AND r.reference_no_normalized = ?
        """,
        Integer.class,
        shipmentPublicId.trim(),
        request.carrier(),
        request.type(),
        normalizeReference(request.number())
    );
    if (referenceMatches == null || referenceMatches == 0) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "The requested carrier reference does not belong to this shipment"
      );
    }

    JsonNode details = adapterClient.loadSupplementalDetails(request);
    ObjectNode snapshot = mergeSupplementalDetailsIntoCurrentSnapshot(
        shipmentPublicId,
        details,
        user
    );
    ObjectNode response = details.isObject()
        ? ((ObjectNode) details).deepCopy()
        : objectMapper.createObjectNode();
    response.put("shipmentId", shipmentPublicId.trim());
    response.put("databaseStored", true);
    response.put("databaseStoredAt", clock.instant().toString());
    response.set("snapshot", snapshot);
    return response;
  }

  void recordRefreshOutcome(
      String shipmentPublicId,
      String result,
      String errorCode,
      String errorMessage,
      int attempts,
      int proxyAttempts
  ) {
    if (shipmentPublicId == null || shipmentPublicId.isBlank()) return;
    String normalizedResult = trim(result, 16);
    boolean succeeded = "SUCCEEDED".equals(normalizedResult);
    jdbcTemplate.update(
        """
        UPDATE cp_shipments
        SET last_refresh_result = ?, last_refresh_error_code = ?, last_refresh_error = ?,
            last_refresh_attempts = ?, last_refresh_proxy_attempts = ?,
            last_refresh_at = ?, updated_at = updated_at
        WHERE public_id = ?
        """,
        normalizedResult,
        succeeded ? null : trim(errorCode, 120),
        succeeded ? null : trim(errorMessage, 1000),
        Math.max(0, attempts),
        Math.max(0, proxyAttempts),
        timestamp(clock.instant()),
        shipmentPublicId.trim()
    );
  }

  ObjectNode discoverBatchContainers(
      String shipmentPublicId,
      String billNumber,
      String batchTaskId,
      AuthenticatedUser user
  ) {
    requireBatchShipmentAccess(shipmentPublicId, user);
    NormalizedTrackRequest request = normalize(new ShipmentTrackRequest(
        "COSCO", "AUTO", "BILLOFLADING", billNumber, false, null, batchTaskId
    ));
    JsonNode discovered = adapterClient.discoverContainers(request);
    mergeContainersIntoCurrentSnapshot(
        shipmentPublicId,
        discovered.path("containers"),
        false,
        user
    );
    return discovered.isObject()
        ? ((ObjectNode) discovered).deepCopy()
        : objectMapper.createObjectNode();
  }

  ObjectNode enrichBatchContainer(
      String shipmentPublicId,
      String containerNumber,
      String batchTaskId,
      AuthenticatedUser user
  ) {
    requireBatchShipmentAccess(shipmentPublicId, user);
    ObjectNode response = track(
        new ShipmentTrackRequest(
            "COSCO", "AUTO", "CONTAINER", containerNumber, false, null, batchTaskId
        ),
        user
    );
    mergeContainersIntoCurrentSnapshot(
        shipmentPublicId,
        response.path("snapshot").path("containers"),
        true,
        user
    );
    return response;
  }

  private void requireBatchShipmentAccess(String shipmentPublicId, AuthenticatedUser user) {
    if (user == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Sign in is required");
    if (!user.canManageShipmentFiles()) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Business user or administrator permission is required"
      );
    }
    if (shipmentPublicId == null || shipmentPublicId.isBlank()
        || !accessService.hasAccess(shipmentPublicId, user)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Shipment access has not been granted");
    }
  }

  private synchronized void mergeContainersIntoCurrentSnapshot(
      String shipmentPublicId,
      JsonNode incomingContainers,
      boolean detailed,
      AuthenticatedUser user
  ) {
    requireBatchShipmentAccess(shipmentPublicId, user);
    if (!incomingContainers.isArray()) {
      throw new ApiException(HttpStatus.BAD_GATEWAY, "Container enrichment response is invalid");
    }
    List<MutableSnapshot> matches = jdbcTemplate.query(
        """
        SELECT s.id AS shipment_id, t.id AS snapshot_id, t.snapshot_json
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE s.public_id = ? AND t.invalidated_at IS NULL
        LIMIT 1
        """,
        (rs, rowNumber) -> new MutableSnapshot(
            rs.getLong("shipment_id"),
            rs.getLong("snapshot_id"),
            rs.getString("snapshot_json")
        ),
        shipmentPublicId.trim()
    );
    if (matches.isEmpty()) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment has no current tracking snapshot");
    }

    MutableSnapshot stored = matches.get(0);
    JsonNode parsed = readJson(stored.snapshotJson());
    if (!parsed.isObject()) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment tracking snapshot is invalid");
    }
    ObjectNode snapshot = (ObjectNode) parsed;
    Map<String, ObjectNode> mergedByNumber = new LinkedHashMap<>();
    JsonNode currentContainers = snapshot.path("containers");
    if (currentContainers.isArray()) {
      for (JsonNode current : currentContainers) {
        String number = normalizedContainerNumber(current);
        if (number != null && current.isObject()) {
          mergedByNumber.put(number, ((ObjectNode) current).deepCopy());
        }
      }
    }
    for (JsonNode incoming : incomingContainers) {
      String number = normalizedContainerNumber(incoming);
      if (number == null || !incoming.isObject()) continue;
      ObjectNode target = mergedByNumber.computeIfAbsent(
          number,
          ignored -> objectMapper.createObjectNode().put("number", number)
      );
      mergeUsefulContainerFields(target, (ObjectNode) incoming);
      if (detailed) target.put("detailSource", "CONTAINER_SUBQUERY");
    }

    ArrayNode merged = objectMapper.createArrayNode();
    mergedByNumber.values().forEach(merged::add);
    snapshot.set("containers", merged);
    Instant now = clock.instant();
    ObjectNode enrichment = childObject(snapshot, "containerEnrichment");
    enrichment.put("discovered", merged.size());
    enrichment.put(
        "completed",
        mergedByNumber.values().stream()
            .filter(container -> "CONTAINER_SUBQUERY".equals(
                container.path("detailSource").asText()
            ))
            .count()
    );
    enrichment.put("updatedAt", now.toString());

    String snapshotJson = writeJson(snapshot);
    jdbcTemplate.update(
        "UPDATE cp_tracking_snapshots SET snapshot_json = ?, payload_sha256 = ? WHERE id = ?",
        snapshotJson,
        sha256(snapshotJson),
        stored.snapshotId()
    );
    jdbcTemplate.update(
        "UPDATE cp_shipments SET updated_at = ? WHERE id = ?",
        timestamp(now),
        stored.shipmentId()
    );
    eventPublisher.publishEvent(new TrackingSnapshotPersistedEvent(
        stored.shipmentId(), shipmentPublicId, snapshot.deepCopy(), now
    ));
  }

  private synchronized ObjectNode mergeSupplementalDetailsIntoCurrentSnapshot(
      String shipmentPublicId,
      JsonNode details,
      AuthenticatedUser user
  ) {
    requireBatchShipmentAccess(shipmentPublicId, user);
    if (!details.path("containers").isArray() || !details.path("references").isObject()) {
      throw new ApiException(HttpStatus.BAD_GATEWAY, "Supplemental detail response is invalid");
    }
    List<MutableSnapshot> matches = jdbcTemplate.query(
        """
        SELECT s.id AS shipment_id, t.id AS snapshot_id, t.snapshot_json
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE s.public_id = ? AND t.invalidated_at IS NULL
        LIMIT 1
        """,
        (rs, rowNumber) -> new MutableSnapshot(
            rs.getLong("shipment_id"),
            rs.getLong("snapshot_id"),
            rs.getString("snapshot_json")
        ),
        shipmentPublicId.trim()
    );
    if (matches.isEmpty()) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment has no current tracking snapshot");
    }

    MutableSnapshot stored = matches.get(0);
    JsonNode parsed = readJson(stored.snapshotJson());
    if (!parsed.isObject()) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment tracking snapshot is invalid");
    }
    ObjectNode snapshot = (ObjectNode) parsed;

    Map<String, ObjectNode> containersByNumber = new LinkedHashMap<>();
    JsonNode currentContainers = snapshot.path("containers");
    if (currentContainers.isArray()) {
      for (JsonNode current : currentContainers) {
        String number = normalizedContainerNumber(current);
        if (number != null && current.isObject()) {
          containersByNumber.put(number, ((ObjectNode) current).deepCopy());
        }
      }
    }
    for (JsonNode incoming : details.path("containers")) {
      String number = normalizedContainerNumber(incoming);
      if (number == null || !incoming.isObject()) continue;
      ObjectNode target = containersByNumber.computeIfAbsent(
          number,
          ignored -> objectMapper.createObjectNode().put("number", number)
      );
      mergeUsefulContainerFields(target, (ObjectNode) incoming);
    }
    ArrayNode mergedContainers = objectMapper.createArrayNode();
    containersByNumber.values().forEach(mergedContainers::add);
    snapshot.set("containers", mergedContainers);

    ObjectNode references = childObject(snapshot, "references");
    ObjectNode incomingReferences = (ObjectNode) details.path("references");
    mergeReferenceArray(references, incomingReferences, "external");
    JsonNode incomingBusiness = incomingReferences.path("business");
    if (incomingBusiness.isObject()) {
      mergeUsefulContainerFields(
          childObject(references, "business"),
          (ObjectNode) incomingBusiness
      );
    }
    mergeReferenceInformation(references, incomingReferences.path("information"));

    Instant now = clock.instant();
    ObjectNode enrichment = childObject(snapshot, "supplementalDetails");
    enrichment.put("updatedAt", now.toString());
    enrichment.put("containerCount", mergedContainers.size());
    enrichment.put("partial", details.path("partial").asBoolean(false));

    String snapshotJson = writeJson(snapshot);
    jdbcTemplate.update(
        "UPDATE cp_tracking_snapshots SET snapshot_json = ?, payload_sha256 = ? WHERE id = ?",
        snapshotJson,
        sha256(snapshotJson),
        stored.snapshotId()
    );
    jdbcTemplate.update(
        "UPDATE cp_shipments SET updated_at = ? WHERE id = ?",
        timestamp(now),
        stored.shipmentId()
    );
    eventPublisher.publishEvent(new TrackingSnapshotPersistedEvent(
        stored.shipmentId(), shipmentPublicId, snapshot.deepCopy(), now
    ));
    return snapshot.deepCopy();
  }

  private void mergeReferenceArray(
      ObjectNode target,
      ObjectNode incoming,
      String field
  ) {
    Map<String, String> values = new LinkedHashMap<>();
    JsonNode currentValues = target.path(field);
    if (currentValues.isArray()) {
      for (JsonNode value : currentValues) {
        String text = value.asText("").trim();
        if (!text.isBlank()) values.putIfAbsent(normalizeReference(text), text);
      }
    }
    JsonNode incomingValues = incoming.path(field);
    if (incomingValues.isArray()) {
      for (JsonNode value : incomingValues) {
        String text = value.asText("").trim();
        if (!text.isBlank()) values.putIfAbsent(normalizeReference(text), text);
      }
    }
    ArrayNode merged = target.putArray(field);
    values.values().forEach(merged::add);
  }

  private void mergeReferenceInformation(ObjectNode references, JsonNode incoming) {
    Map<String, JsonNode> informationByName = new LinkedHashMap<>();
    JsonNode current = references.path("information");
    if (current.isArray()) {
      for (JsonNode item : current) {
        String key = referenceInformationKey(item);
        if (key != null) informationByName.putIfAbsent(key, item.deepCopy());
      }
    }
    if (incoming.isArray()) {
      for (JsonNode item : incoming) {
        String key = referenceInformationKey(item);
        if (key != null) informationByName.put(key, item.deepCopy());
      }
    }
    ArrayNode merged = references.putArray("information");
    informationByName.values().forEach(merged::add);
  }

  private String referenceInformationKey(JsonNode item) {
    String name = item.path("name").asText("").trim();
    String value = item.path("value").asText("").trim();
    if (name.isBlank() || value.isBlank()) return null;
    return name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9\\p{IsHan}]+", "");
  }

  private String normalizedContainerNumber(JsonNode container) {
    String value = container == null ? null : container.path("number").asText(null);
    if (value == null || value.isBlank()) return null;
    String normalized = normalizeReference(value);
    return normalized.matches("[A-Z]{4}[0-9]{7}") ? normalized : null;
  }

  private void mergeUsefulContainerFields(ObjectNode target, ObjectNode incoming) {
    incoming.fields().forEachRemaining(entry -> {
      JsonNode value = entry.getValue();
      if (value == null || value.isNull() || value.isMissingNode()) return;
      if (value.isTextual() && value.asText().isBlank()) return;
      if ((value.isArray() || value.isObject()) && value.isEmpty()) return;
      target.set(entry.getKey(), value.deepCopy());
    });
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
      ShipmentImportDetails importedDetails,
      AuthenticatedUser user,
      Instant now
  ) {
    try {
      return transactionTemplate.execute(
          status -> persist(request, upstream, existingQuery, importedDetails, user, now)
      );
    } catch (DuplicateKeyException race) {
      CachedShipment winner = findCached(request);
      if (winner == null) throw race;
      return transactionTemplate.execute(
          status -> persist(request, upstream, winner, importedDetails, user, now)
      );
    }
  }

  private PersistedShipment persist(
      NormalizedTrackRequest request,
      JsonNode upstream,
      CachedShipment existingQuery,
      ShipmentImportDetails importedDetails,
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
    jdbcTemplate.queryForObject(
        "SELECT id FROM cp_shipments WHERE id = ? FOR UPDATE",
        Long.class,
        shipment.id()
    );
    for (ShipmentReference reference : references) {
      attachReference(shipment.id(), reference);
    }
    persistImportedBusinessFields(shipment.id(), importedDetails, now);
    invalidateUnusableCurrentSnapshot(shipment.id(), user, now);

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
    for (String referenceType : compatibleReferenceTypes(
        request.carrier(), request.type(), normalizeReference(request.number())
    )) {
      CachedShipment cached = findCachedByReferenceType(request, referenceType);
      if (cached != null) return cached;
    }
    return null;
  }

  private CachedShipment findCachedByReferenceType(
      NormalizedTrackRequest request,
      String referenceType
  ) {
    String normalizedNumber = canonicalIdentityNumber(
        request.carrier(), request.type(), normalizeReference(request.number())
    );
    String alternateNumber = alternateCosuReference(
        request.carrier(), referenceType, normalizedNumber
    );
    List<CachedShipment> records = jdbcTemplate.query(
        """
        SELECT s.id AS shipment_id, s.public_id, t.snapshot_json, t.strategy_json,
               t.fetched_at, t.fresh_until
        FROM cp_shipment_references r
        JOIN cp_shipments s ON s.id = r.shipment_id
        LEFT JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        WHERE r.carrier_code = ? AND r.reference_type = ?
          AND r.reference_no_normalized IN (?, ?)
        ORDER BY CASE WHEN r.reference_no_normalized = ? THEN 0 ELSE 1 END
        LIMIT 1
        """,
        this::mapCachedShipment,
        request.carrier(),
        referenceType,
        normalizedNumber,
        alternateNumber,
        normalizedNumber
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
      String normalizedNumber = canonicalIdentityNumber(
          reference.carrier(), reference.type(), reference.normalizedNumber()
      );
      for (String referenceType : compatibleReferenceTypes(
          reference.carrier(), reference.type(), reference.normalizedNumber()
      )) {
        String alternateNumber = alternateCosuReference(
            reference.carrier(), referenceType, normalizedNumber
        );
        List<ShipmentIdentity> shipments = jdbcTemplate.query(
            """
            SELECT s.id, s.public_id
            FROM cp_shipment_references r
            JOIN cp_shipments s ON s.id = r.shipment_id
            WHERE r.carrier_code = ? AND r.reference_type = ?
              AND r.reference_no_normalized IN (?, ?)
            ORDER BY CASE WHEN r.reference_no_normalized = ? THEN 0 ELSE 1 END
            LIMIT 1
            """,
            (rs, rowNumber) -> new ShipmentIdentity(rs.getLong("id"), rs.getString("public_id")),
            reference.carrier(),
            referenceType,
            normalizedNumber,
            alternateNumber,
            normalizedNumber
        );
        if (!shipments.isEmpty()) return shipments.get(0);
      }
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
            public_id, carrier_code, created_by, responsible_agent_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          """,
          Statement.RETURN_GENERATED_KEYS
      );
      statement.setString(1, publicId);
      statement.setString(2, carrier);
      if (creator == null) statement.setNull(3, java.sql.Types.BIGINT);
      else statement.setLong(3, creator.id());
      if (creator == null) statement.setNull(4, java.sql.Types.BIGINT);
      else statement.setLong(4, creator.id());
      statement.setTimestamp(5, timestamp(now));
      statement.setTimestamp(6, timestamp(now));
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
    insertReference(shipmentId, reference);
  }

  private void insertReference(long shipmentId, ShipmentReference reference) {
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
    SnapshotOwner snapshotOwner = resolveSnapshotOwner(shipmentId, user);
    long queriedBy = snapshotOwner.userId();
    String queriedByUsername = snapshotOwner.username();
    String payloadSha = sha256(snapshotJson);
    String sourceChannel = trim(snapshot.path("channel").asText(request.channel()), 32);

    List<Long> currentIds = jdbcTemplate.query(
        """
        SELECT id FROM cp_tracking_snapshots
        WHERE queried_by = ? AND query_reference_type = ? AND query_reference_no = ?
          AND invalidated_at IS NULL
        ORDER BY id DESC
        LIMIT 1 FOR UPDATE
        """,
        (rs, rowNumber) -> rs.getLong("id"),
        queriedBy, request.type(), request.number()
    );
    if (!currentIds.isEmpty()) {
      long id = currentIds.get(0);
      jdbcTemplate.update(
          """
          UPDATE cp_tracking_snapshots
          SET shipment_id = ?, queried_by_username = ?, source_channel = ?, snapshot_json = ?,
              strategy_json = ?, payload_sha256 = ?, fetched_at = ?, fresh_until = ?
          WHERE id = ?
          """,
          shipmentId, queriedByUsername, sourceChannel, snapshotJson, strategyJson, payloadSha,
          timestamp(fetchedAt), timestamp(freshUntil), id
      );
      return id;
    }
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbcTemplate.update(connection -> {
      PreparedStatement statement = connection.prepareStatement(
          """
          INSERT INTO cp_tracking_snapshots (
            shipment_id, query_reference_type, query_reference_no, queried_by, queried_by_username,
            source_channel, snapshot_json, strategy_json, payload_sha256,
            fetched_at, fresh_until, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          Statement.RETURN_GENERATED_KEYS
      );
      statement.setLong(1, shipmentId);
      statement.setString(2, request.type());
      statement.setString(3, request.number());
      statement.setLong(4, queriedBy);
      statement.setString(5, queriedByUsername);
      statement.setString(6, sourceChannel);
      statement.setString(7, snapshotJson);
      statement.setString(8, strategyJson);
      statement.setString(9, payloadSha);
      statement.setTimestamp(10, timestamp(fetchedAt));
      statement.setTimestamp(11, timestamp(freshUntil));
      statement.setTimestamp(12, timestamp(now));
      return statement;
    }, keyHolder);
    Number key = keyHolder.getKey();
    if (key == null) throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save tracking snapshot"
    );
    return key.longValue();
  }

  private void invalidateUnusableCurrentSnapshot(
      long shipmentId,
      AuthenticatedUser user,
      Instant now
  ) {
    List<CurrentSnapshot> current = jdbcTemplate.query(
        """
        SELECT t.id, t.snapshot_json
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE s.id = ? AND t.invalidated_at IS NULL
        LIMIT 1
        """,
        (rs, rowNumber) -> new CurrentSnapshot(
            rs.getLong("id"), rs.getString("snapshot_json")
        ),
        shipmentId
    );
    if (current.isEmpty() || isUsableCachedSnapshot(current.get(0).snapshotJson())) return;
    jdbcTemplate.update(
        """
        UPDATE cp_tracking_snapshots
        SET invalidated_at = ?, invalidated_by = ?, invalidation_reason = ?
        WHERE id = ?
        """,
        timestamp(now), user == null ? null : user.id(),
        "Replaced empty or unusable snapshot during forced live refresh",
        current.get(0).id()
    );
  }

  private SnapshotOwner resolveSnapshotOwner(long shipmentId, AuthenticatedUser user) {
    if (user != null) return new SnapshotOwner(user.id(), user.username());
    List<SnapshotOwner> owners = jdbcTemplate.query(
        """
        SELECT
          COALESCE(
            t.queried_by,
            s.responsible_agent_id,
            (SELECT MIN(p.user_id) FROM cp_shipment_participants p WHERE p.shipment_id = s.id)
          ) AS owner_id,
          COALESCE(
            t.queried_by_username,
            CONCAT('user-', COALESCE(
              s.responsible_agent_id,
              (SELECT MIN(p.user_id) FROM cp_shipment_participants p WHERE p.shipment_id = s.id)
            ))
          ) AS owner_username
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE s.id = ?
          AND COALESCE(
            t.queried_by,
            s.responsible_agent_id,
            (SELECT MIN(p.user_id) FROM cp_shipment_participants p WHERE p.shipment_id = s.id)
          ) IS NOT NULL
        LIMIT 1
        """,
        (rs, rowNumber) -> new SnapshotOwner(
            rs.getLong("owner_id"), rs.getString("owner_username")
        ),
        shipmentId
    );
    if (owners.isEmpty()) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "MISSING_SNAPSHOT_OWNER",
          "Automatic refresh requires an existing user-owned tracking snapshot"
      );
    }
    return owners.get(0);
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
    if (!primary && !isValidDiscoveredReference(carrier, type, normalized)) return;
    String key = carrier + "|" + type + "|" + normalized;
    ShipmentReference existing = values.get(key);
    if (existing == null || primary) {
      values.put(key, new ShipmentReference(carrier, type, number.trim(), normalized, primary));
    }
  }

  private boolean isValidDiscoveredReference(String carrier, String type, String normalized) {
    if (normalized.matches(".*(?:NOTREADY|NOTAVAILABLE|NORECORD|UNKNOWN|PENDING).*$")) {
      return false;
    }
    if ("COSCO".equals(carrier) && "BILLOFLADING".equals(type)) {
      return normalized.matches("(?:COSU)?[0-9]{6,20}|[A-Z0-9-]{4,35}");
    }
    return normalized.matches("[A-Z0-9./-]{4,128}");
  }

  private ObjectNode overlayStoredBusinessFields(JsonNode source, long shipmentId) {
    ImportedBusinessFields fields = jdbcTemplate.queryForObject(
        """
        SELECT job_number, client_po_number, client_name_code, original_bill_of_lading
        FROM cp_shipments WHERE id = ?
        """,
        (rs, rowNumber) -> new ImportedBusinessFields(
            rs.getString("job_number"),
            rs.getString("client_po_number"),
            rs.getString("client_name_code"),
            rs.getString("original_bill_of_lading")
        ),
        shipmentId
    );
    return overlayStoredBusinessFields(source, fields);
  }

  private ObjectNode overlayStoredBusinessFields(
      JsonNode source,
      ImportedBusinessFields fields
  ) {
    ObjectNode snapshot = source != null && source.isObject()
        ? ((ObjectNode) source).deepCopy()
        : objectMapper.createObjectNode();
    if (fields == null) return snapshot;
    ObjectNode business = childObject(childObject(snapshot, "references"), "business");
    putStoredBusinessField(business, "forwarderJobNumber", fields.jobNumber());
    putStoredBusinessField(business, "clientPoNumber", fields.clientPoNumber());
    putStoredBusinessField(business, "clientNameCode", fields.clientNameCode());
    putStoredBusinessField(business, "originalBillOfLading", fields.originalBillOfLading());
    return snapshot;
  }

  private void putStoredBusinessField(ObjectNode target, String field, String value) {
    if (value != null && !value.isBlank()) target.put(field, value);
  }

  private ObjectNode cachedResponse(CachedShipment cached, AuthenticatedUser user, boolean stale) {
    ObjectNode response = objectMapper.createObjectNode();
    response.set("snapshot", readJson(cached.snapshotJson()));
    JsonNode routed = ensureRouteFallback(response, null);
    if (routed.path("snapshot").isObject()) {
      response.set("snapshot", routed.path("snapshot").deepCopy());
    }
    response.set(
        "snapshot",
        overlayStoredBusinessFields(response.path("snapshot"), cached.shipmentId())
    );
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
    response.set(
        "snapshot",
        overlayStoredBusinessFields(response.path("snapshot"), persisted.shipmentId())
    );
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
    ObjectNode summary = childObject(snapshot, "summary");
    ArrayNode extra = snapshot.withArray("extraInformation");
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

  private JsonNode ensureRouteFallback(JsonNode upstream, ShipmentImportDetails details) {
    if (!upstream.isObject() || !upstream.path("snapshot").isObject()
        || arrayHasItems(upstream.path("snapshot").path("route"))) {
      return upstream;
    }
    ObjectNode enriched = ((ObjectNode) upstream).deepCopy();
    ObjectNode snapshot = (ObjectNode) enriched.path("snapshot");
    JsonNode summary = snapshot.path("summary");
    JsonNode routingLegs = snapshot.path("routingLegs");
    JsonNode firstLeg = routingLegs.isArray() && !routingLegs.isEmpty()
        ? routingLegs.get(0)
        : objectMapper.createObjectNode();
    JsonNode lastLeg = routingLegs.isArray() && !routingLegs.isEmpty()
        ? routingLegs.get(routingLegs.size() - 1)
        : objectMapper.createObjectNode();

    String plannedLoadPort = cleanImported(
        details == null ? null : details.portOfLoading(), 160
    );
    String plannedDischargePort = cleanImported(
        details == null ? null : details.portOfDischarge(), 160
    );
    String origin = firstNonBlank(
        firstLeg.path("loadPort").asText(null),
        plannedLoadPort,
        summary.path("origin").path("name").asText(null)
    );
    String destination = firstNonBlank(
        lastLeg.path("dischargePort").asText(null),
        plannedDischargePort,
        summary.path("destination").path("name").asText(null)
    );
    if (origin == null && destination == null) return upstream;

    String departure = firstNonBlank(
        firstLeg.path("actualDeparture").asText(null),
        firstLeg.path("estimatedDeparture").asText(null),
        snapshot.path("keyTimes").path("estimatedDeparture").path("time").asText(null),
        details == null ? null : details.estimatedDeparture()
    );
    String arrival = firstNonBlank(
        lastLeg.path("actualArrival").asText(null),
        lastLeg.path("estimatedArrival").asText(null),
        snapshot.path("keyTimes").path("estimatedFinalArrival").path("time").asText(null),
        snapshot.path("keyTimes").path("estimatedDelivery").path("time").asText(null),
        details == null ? null : details.estimatedArrival()
    );

    ArrayNode route = snapshot.putArray("route");
    if (origin != null) {
      ObjectNode node = route.addObject();
      node.put("sequence", route.size());
      node.put("locationType", plannedLoadPort != null ? "FPOL" : "POR");
      node.put("city", origin);
      putIfBlank(
          node,
          "countryCode",
          summary.path("origin").path("countryCode").asText(null)
      );
      putIfBlank(node, "estimatedTime", departure);
      node.put("active", false);
    }
    if (destination != null) {
      ObjectNode node = route.addObject();
      node.put("sequence", route.size());
      node.put("locationType", plannedDischargePort != null ? "LPOD" : "FND");
      node.put("city", destination);
      putIfBlank(
          node,
          "countryCode",
          summary.path("destination").path("countryCode").asText(null)
      );
      putIfBlank(node, "estimatedTime", arrival);
      node.put("active", false);
    }
    snapshot.put("routeSource", "SYNTHESIZED_FROM_PLAN");
    return enriched;
  }

  private String firstNonBlank(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) return value.trim();
    }
    return null;
  }

  private String alternateCosuReference(String carrier, String type, String normalizedNumber) {
    if ("COSCO".equals(carrier) && "BILLOFLADING".equals(type)
        && normalizedNumber != null && normalizedNumber.matches("[0-9]{6,20}")) {
      return "COSU" + normalizedNumber;
    }
    return normalizedNumber;
  }

  /**
   * COSCO commonly exposes the same numeric transport identity first as a booking number and
   * later as a bill-of-lading number. Treating those two labels as unrelated creates a second
   * shipment when the detail page tracks a previously imported shell. The alias is deliberately
   * limited to COSCO's 8-12 digit identifiers so other carriers and textual booking references
   * keep their strict type-specific identity.
   */
  private List<String> compatibleReferenceTypes(
      String carrier,
      String requestedType,
      String normalizedNumber
  ) {
    if (!isSharedCoscoNumericIdentity(carrier, requestedType, normalizedNumber)) {
      return List.of(requestedType);
    }
    return "BOOKING".equals(requestedType)
        ? List.of("BOOKING", "BILLOFLADING")
        : List.of("BILLOFLADING", "BOOKING");
  }

  private String canonicalIdentityNumber(String carrier, String type, String normalizedNumber) {
    String normalized = normalizeReference(normalizedNumber);
    if (isSharedCoscoNumericIdentity(carrier, type, normalized) && normalized.startsWith("COSU")) {
      return normalized.substring(4);
    }
    return normalized;
  }

  private boolean isSharedCoscoNumericIdentity(
      String carrier,
      String type,
      String normalizedNumber
  ) {
    if (!"COSCO".equals(carrier) || !isDurableReferenceType(type)) return false;
    return normalizeReference(normalizedNumber).matches("(?:COSU)?[0-9]{8,12}");
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

  private record CustomerAccessQuery(String predicate, List<Object> parameters) {}

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
      Instant lastTrackedAt,
      ImportedBusinessFields businessFields,
      String note,
      Instant assignedAt,
      String publicationStatus,
      boolean followed,
      Instant agentLastRefreshedAt
  ) {}

  private record AssignedCustomer(
      long customerId,
      String publicId,
      String displayName,
      String clientCode,
      String partyRole,
      long shipmentCount
  ) {}

  private record AgentShipmentTarget(
      long shipmentId,
      String shipmentPublicId,
      String carrier,
      String referenceType,
      String referenceNumber,
      String note,
      String forwarderJobNumber,
      String clientPoNumber,
      String clientNameCode
  ) {}

  private record ImportedCustomerMatch(long customerId, String partyRole) {}

  private record SnapshotOwner(long userId, String username) {}

  private record CurrentSnapshot(long id, String snapshotJson) {}

  private record ImportedBusinessFields(
      String jobNumber,
      String clientPoNumber,
      String clientNameCode,
      String originalBillOfLading
  ) {}

  private record MutableSnapshot(long shipmentId, long snapshotId, String snapshotJson) {}

  private record PersistedShipment(
      long shipmentId,
      String shipmentPublicId,
      Instant fetchedAt,
      Instant freshUntil
  ) {}
}
