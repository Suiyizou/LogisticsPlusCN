package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.shipment.ShipmentBatchItemRequest;
import com.cargoplanner.backend.shipment.ShipmentTrackingProperties;
import com.cargoplanner.backend.shipment.TrackingCarriers;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 票单快照与追踪的只读查询。
 *
 * <p>从 {@code BusinessCustomerService} 拆出：业务端票单列表/快照、批量追踪候选、
 * 单票快照查询，以及排序、计数、ETA、JSON 映射等只读逻辑。全部为只读，不写数据、
 * 不改变事务；参考号与文本规范化统一走 {@link ShipmentReferences}。
 */
@Service
public class CustomerShipmentQueryService {
  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;
  private final CustomerAccessGuard accessGuard;
  private ShipmentTrackingProperties trackingProperties = new ShipmentTrackingProperties();

  public CustomerShipmentQueryService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      CustomerAccessGuard accessGuard
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.accessGuard = accessGuard;
  }

  @Autowired
  public void setTrackingProperties(ShipmentTrackingProperties properties) {
    this.trackingProperties = properties;
  }

  public Map<String, Object> listAvailableShipments(AuthenticatedUser actor) {
    return listShipmentSnapshots(actor);
  }

  /**
   * Returns one read model per shipment that the current business user owns or participates in.
   * Snapshot provenance ({@code queried_by}) is deliberately not an authorization boundary.
   */
  public Map<String, Object> listShipmentSnapshots(AuthenticatedUser actor) {
    accessGuard.requireOperationsReader(actor);
    String baseSql = snapshotShipmentSelect();
    String orderBy = shipmentSnapshotOrderBy();
    List<Map<String, Object>> items = actor.isAdmin()
        ? jdbcTemplate.query(
            baseSql + orderBy,
            this::mapSnapshotShipment
        )
        : jdbcTemplate.query(
            baseSql + " WHERE (s.responsible_agent_id = ? OR EXISTS ("
                + "SELECT 1 FROM cp_shipment_participants p "
                + "WHERE p.shipment_id = s.id AND p.user_id = ?)) "
                + orderBy,
            this::mapSnapshotShipment,
            actor.id(),
            actor.id()
        );
    enrichShipmentRelations(items);
    items = deduplicateShipmentSnapshots(items);
    return Map.of("items", items, "total", items.size());
  }

  public Map<String, Object> listShipmentSnapshots(
      AuthenticatedUser actor,
      int requestedPage,
      int requestedPageSize,
      String customerPublicId,
      boolean refreshIssuesOnly
  ) {
    return listShipmentSnapshots(
        actor, requestedPage, requestedPageSize, customerPublicId, refreshIssuesOnly, null
    );
  }

  public Map<String, Object> listShipmentSnapshots(
      AuthenticatedUser actor,
      int requestedPage,
      int requestedPageSize,
      String customerPublicId,
      boolean refreshIssuesOnly,
      String businessFilter
  ) {
    return listShipmentSnapshots(
        actor, requestedPage, requestedPageSize, customerPublicId, refreshIssuesOnly,
        businessFilter, null, false
    );
  }

  public Map<String, Object> listShipmentSnapshots(
      AuthenticatedUser actor,
      int requestedPage,
      int requestedPageSize,
      String customerPublicId,
      boolean refreshIssuesOnly,
      String businessFilter,
      String requestedEtaSort,
      boolean requestedUnfinishedOnly
  ) {
    accessGuard.requireOperationsReader(actor);
    int page = Math.max(1, requestedPage);
    int pageSize = Math.max(5, Math.min(100, requestedPageSize));
    List<String> filters = new ArrayList<>();
    List<Object> parameters = new ArrayList<>();
    if (!actor.isAdmin()) {
      filters.add("(s.responsible_agent_id = ? OR EXISTS ("
          + "SELECT 1 FROM cp_shipment_participants p "
          + "WHERE p.shipment_id = s.id AND p.user_id = ?))");
      parameters.add(actor.id());
      parameters.add(actor.id());
    }
    String normalizedCustomerId = customerPublicId == null ? "" : customerPublicId.trim();
    if (!normalizedCustomerId.isBlank()) {
      filters.add("EXISTS (SELECT 1 FROM cp_customer_shipment_access a "
          + "JOIN cp_customers c ON c.id = a.customer_id "
          + "WHERE a.shipment_id = s.id AND c.public_id = ?)");
      parameters.add(normalizedCustomerId);
    }
    String normalizedBusinessFilter = businessFilter == null
        ? ""
        : businessFilter.trim().toUpperCase(Locale.ROOT);
    switch (normalizedBusinessFilter) {
      case "TODAY_CREATED" -> filters.add("s.created_at >= CURRENT_DATE");
      case "TODAY_UPDATED" -> filters.add(
          businessStateSql("TODAY_UPDATED")
      );
      case "PENDING" -> filters.add(
          "(" + businessStateSql("MANUAL_REQUIRED") + " OR "
              + businessStateSql("TODAY_PENDING") + ")"
      );
      case "COMPLETED" -> filters.add(businessStateSql("COMPLETED"));
      case "UPDATE_FAILED" -> filters.add(businessStateSql("UPDATE_FAILED"));
      case "MANUAL_REQUIRED" -> filters.add(businessStateSql("MANUAL_REQUIRED"));
      case "TODAY_PENDING" -> filters.add(businessStateSql("TODAY_PENDING"));
      default -> {
        // Empty and unknown values deliberately mean no business-state filter.
      }
    }
    String baseWhere = filters.isEmpty() ? "" : " WHERE " + String.join(" AND ", filters);
    ShipmentCounts baseCounts = shipmentCounts(baseWhere, parameters);
    if (requestedUnfinishedOnly) {
      filters.add("NOT (" + terminalShipmentSql("s") + ")");
    }
    String scopeWhere = filters.isEmpty() ? "" : " WHERE " + String.join(" AND ", filters);
    ShipmentCounts scopeCounts = requestedUnfinishedOnly
        ? shipmentCounts(scopeWhere, parameters)
        : baseCounts;
    long refreshIssueTotal = scopeCounts.refreshIssues();
    if (refreshIssuesOnly) {
      filters.add("UPPER(COALESCE(s.last_refresh_result, '')) IN ('FAILED', 'PARTIAL')");
    }
    String where = filters.isEmpty() ? "" : " WHERE " + String.join(" AND ", filters);
    long total = refreshIssuesOnly ? refreshIssueTotal : scopeCounts.total();
    int totalPages = total == 0 ? 0 : (int) ((total + pageSize - 1) / pageSize);
    if (totalPages == 0) page = 1;
    else if (page > totalPages) page = totalPages;
    int offset = (page - 1) * pageSize;

    String etaSort = normalizeEtaSort(requestedEtaSort);
    List<Object> queryParameters = new ArrayList<>(parameters);
    if (etaSort == null) {
      queryParameters.add(pageSize);
      queryParameters.add(offset);
    }
    String listSql = snapshotShipmentSelect() + where + shipmentSnapshotOrderBy();
    if (etaSort == null) listSql += " LIMIT ? OFFSET ?";
    List<Map<String, Object>> items = jdbcTemplate.query(
        listSql,
        this::mapSnapshotShipment,
        queryParameters.toArray()
    );
    if (etaSort != null) {
      sortShipmentSnapshotsByArrival(items, etaSort);
      int fromIndex = Math.min(offset, items.size());
      int toIndex = Math.min(fromIndex + pageSize, items.size());
      items = new ArrayList<>(items.subList(fromIndex, toIndex));
    }
    enrichShipmentRelations(items);

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", items);
    response.put("total", total);
    response.put("allTotal", baseCounts.total());
    response.put("unfinishedTotal", baseCounts.unfinished());
    response.put("page", page);
    response.put("pageSize", pageSize);
    response.put("totalPages", totalPages);
    response.put("refreshIssueTotal", refreshIssueTotal);
    response.put("etaSort", etaSort == null ? "" : etaSort);
    response.put("unfinishedOnly", requestedUnfinishedOnly);
    return response;
  }

  private ShipmentCounts shipmentCounts(String where, List<Object> parameters) {
    return jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) AS total_count,
               COALESCE(SUM(
                 CASE WHEN NOT (%s) THEN 1 ELSE 0 END
               ), 0) AS unfinished_count,
               COALESCE(SUM(
                 CASE WHEN UPPER(COALESCE(s.last_refresh_result, ''))
                           IN ('FAILED', 'PARTIAL')
                      THEN 1 ELSE 0 END
               ), 0) AS refresh_issue_count
        FROM cp_shipments s
        LEFT JOIN cp_tracking_snapshots t
          ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        """.formatted(terminalShipmentSql("s")) + where,
        (rs, rowNumber) -> new ShipmentCounts(
            rs.getLong("total_count"),
            rs.getLong("unfinished_count"),
            rs.getLong("refresh_issue_count")
        ),
        parameters.toArray()
    );
  }

  private String businessStateSql(String state) {
    String completed = terminalShipmentSql("s");
    String failed =
        "UPPER(COALESCE(s.last_refresh_result, '')) IN ('FAILED', 'PARTIAL')";
    String manualRequired =
        "(t.id IS NULL OR UPPER(COALESCE(t.source_channel, '')) = 'IMPORTED_MANUAL' "
            + "OR s.last_tracked_at IS NULL)";
    return switch (state) {
      case "COMPLETED" -> "(" + completed + ")";
      case "UPDATE_FAILED" -> "(NOT (" + completed + ") AND " + failed + ")";
      case "MANUAL_REQUIRED" -> "(NOT (" + completed + ") AND NOT (" + failed + ") AND "
          + manualRequired + ")";
      case "TODAY_UPDATED" -> "(NOT (" + completed + ") AND NOT (" + failed + ") "
          + "AND NOT (" + manualRequired + ") AND s.last_tracked_at >= CURRENT_DATE)";
      case "TODAY_PENDING" -> "(NOT (" + completed + ") AND NOT (" + failed + ") "
          + "AND NOT (" + manualRequired + ") AND s.last_tracked_at < CURRENT_DATE)";
      default -> "1 = 1";
    };
  }

  private String terminalShipmentSql(String shipmentAlias) {
    String status = "UPPER(REPLACE(REPLACE(COALESCE(" + shipmentAlias
        + ".tracking_status, ''), '_', ' '), '-', ' '))";
    String emptyEquipment = "(" + status + " LIKE '%EMPTY%' OR "
        + status + " LIKE '%MTY%')";
    return "(" + status + " IN ('EMPTY RETURN', 'MTY RETURN')"
        + " OR " + status + " LIKE '%RETURN OF EMPTY%'"
        + " OR " + status + " LIKE '%EMPTY DROP OFF%'"
        + " OR (" + emptyEquipment + " AND ("
        + status + " LIKE '%RETURNED%'"
        + " OR " + status + " LIKE '%RETURN COMPLETE%'"
        + " OR " + status + " LIKE '%RETURN CONFIRMED%'"
        + " OR " + status + " LIKE '%RECEIVED AT DEPOT%'"
        + " OR " + status + " LIKE '%RECEIVED IN DEPOT%'"
        + " OR " + status + " LIKE '%IN DEPOT%'"
        + " OR " + status + " LIKE '%AT DEPOT%')))";
  }

  private String normalizeEtaSort(String requestedEtaSort) {
    if (requestedEtaSort == null || requestedEtaSort.isBlank()) return null;
    String normalized = requestedEtaSort.trim().toLowerCase(Locale.ROOT);
    return "asc".equals(normalized) || "desc".equals(normalized) ? normalized : null;
  }

  private void sortShipmentSnapshotsByArrival(
      List<Map<String, Object>> items,
      String direction
  ) {
    int multiplier = "desc".equals(direction) ? -1 : 1;
    items.sort((left, right) -> {
      Long leftTime = shipmentArrivalTimestamp(left);
      Long rightTime = shipmentArrivalTimestamp(right);
      if (leftTime == null && rightTime == null) {
        return String.valueOf(left.get("referenceNo"))
            .compareToIgnoreCase(String.valueOf(right.get("referenceNo")));
      }
      if (leftTime == null) return 1;
      if (rightTime == null) return -1;
      int timeComparison = Long.compare(leftTime, rightTime);
      if (timeComparison != 0) return timeComparison * multiplier;
      return String.valueOf(left.get("referenceNo"))
          .compareToIgnoreCase(String.valueOf(right.get("referenceNo")));
    });
  }

  private Long shipmentArrivalTimestamp(Map<String, Object> item) {
    if (!(item.get("snapshot") instanceof JsonNode snapshot)) return null;
    JsonNode keyTimes = snapshot.path("keyTimes");
    JsonNode lastLeg = null;
    JsonNode lastOceanLeg = null;
    JsonNode legs = snapshot.path("routingLegs");
    if (legs.isArray()) {
      for (JsonNode leg : legs) {
        lastLeg = leg;
        if ("SEA".equalsIgnoreCase(leg.path("mode").asText())) lastOceanLeg = leg;
      }
    }
    JsonNode arrivalLeg = lastOceanLeg == null ? lastLeg : lastOceanLeg;
    String displayedArrival = firstNonBlankText(
        arrivalLeg == null ? null : arrivalLeg.path("actualArrival").asText(null),
        keyTimes.path("actualArrival").path("time").asText(null),
        keyTimes.path("estimatedDelivery").path("actualTime").asText(null),
        arrivalLeg == null ? null : arrivalLeg.path("estimatedArrival").asText(null),
        keyTimes.path("estimatedFinalArrival").path("time").asText(null),
        keyTimes.path("estimatedArrival").path("time").asText(null),
        keyTimes.path("estimatedDelivery").path("time").asText(null)
    );
    return parseShipmentTimestamp(displayedArrival);
  }

  private String firstNonBlankText(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) return value.trim();
    }
    return null;
  }

  private Long parseShipmentTimestamp(String value) {
    if (value == null || value.isBlank()) return null;
    try {
      return Instant.parse(value).toEpochMilli();
    } catch (RuntimeException ignored) {
      // Try the date formats used by imported/manual tracking snapshots.
    }
    try {
      return OffsetDateTime.parse(value).toInstant().toEpochMilli();
    } catch (RuntimeException ignored) {
      // Continue with local date-time and date-only values.
    }
    try {
      return LocalDateTime.parse(value).toInstant(ZoneOffset.UTC).toEpochMilli();
    } catch (RuntimeException ignored) {
      // Continue with date-only values.
    }
    try {
      return LocalDate.parse(value).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli();
    } catch (RuntimeException ignored) {
      return null;
    }
  }

  /**
   * Builds a refresh queue from shipments the current user owns or participates in. The shipment's
   * durable reference is always used; stale snapshot query identities must never
   * steer a refresh back to an obsolete or empty query.
   * Shipments whose empty equipment has already been returned are terminal and are deliberately
   * excluded.
   */
  public List<ShipmentBatchItemRequest> listUnfinishedTrackingItems(AuthenticatedUser actor) {
    accessGuard.requireManager(actor);
    String baseSql = """
        SELECT s.public_id AS shipment_public_id, s.carrier_code,
               r.reference_type,
               r.reference_no_normalized,
               r.reference_no_raw
        FROM cp_shipments s
        LEFT JOIN cp_tracking_snapshots t
          ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id FROM cp_shipment_references r2
          WHERE r2.shipment_id = s.id
            AND %s
          ORDER BY r2.primary_reference DESC, r2.id ASC
          LIMIT 1
        )
        WHERE s.carrier_code IN (%s)
          AND REPLACE(UPPER(COALESCE(s.tracking_status, '')), '_', ' ')
                NOT LIKE '%%EMPTY RETURNED%%'
        """.formatted(refreshReferencePredicate(), refreshCarrierCodes());
    List<RefreshableShipment> candidates = actor.isAdmin()
        ? jdbcTemplate.query(
            baseSql + " ORDER BY COALESCE(t.fetched_at, s.updated_at) DESC, s.id DESC",
            this::mapRefreshableShipment
        )
        : jdbcTemplate.query(
            baseSql + " AND (s.responsible_agent_id = ? OR EXISTS ("
                + "SELECT 1 FROM cp_shipment_participants p "
                + "WHERE p.shipment_id = s.id AND p.user_id = ?)) "
                + "ORDER BY COALESCE(t.fetched_at, s.updated_at) DESC, s.id DESC",
            this::mapRefreshableShipment,
            actor.id(), actor.id()
        );
    return toTrackingItems(candidates);
  }

  public List<ShipmentBatchItemRequest> listSelectedTrackingItems(
      AuthenticatedUser actor,
      List<String> rawShipmentIds
  ) {
    accessGuard.requireManager(actor);
    List<String> shipmentIds = ShipmentReferences.normalizeShipmentIds(rawShipmentIds);
    String placeholders = String.join(", ", shipmentIds.stream().map(id -> "?").toList());
    String sql = """
        SELECT s.public_id AS shipment_public_id, s.carrier_code,
               r.reference_type,
               r.reference_no_normalized,
               r.reference_no_raw
        FROM cp_shipments s
        JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id FROM cp_shipment_references r2
          WHERE r2.shipment_id = s.id
            AND %s
          ORDER BY r2.primary_reference DESC, r2.id ASC
          LIMIT 1
        )
        WHERE s.carrier_code IN (%s)
          AND s.public_id IN (%s)
        """.formatted(refreshReferencePredicate(), refreshCarrierCodes(), placeholders);
    List<Object> parameters = new ArrayList<>(shipmentIds);
    if (!actor.isAdmin()) {
      sql += " AND (s.responsible_agent_id = ? OR EXISTS ("
          + "SELECT 1 FROM cp_shipment_participants p "
          + "WHERE p.shipment_id = s.id AND p.user_id = ?))";
      parameters.add(actor.id());
      parameters.add(actor.id());
    }
    List<RefreshableShipment> candidates = jdbcTemplate.query(
        sql,
        this::mapRefreshableShipment,
        parameters.toArray()
    );
    Map<String, RefreshableShipment> candidatesById = new LinkedHashMap<>();
    candidates.forEach(candidate -> candidatesById.put(candidate.shipmentPublicId(), candidate));
    if (candidatesById.size() != shipmentIds.size()) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "One or more selected shipments are unavailable or cannot be refreshed"
      );
    }
    return toTrackingItems(
        shipmentIds.stream().map(candidatesById::get).toList()
    );
  }

  private List<ShipmentBatchItemRequest> toTrackingItems(
      List<RefreshableShipment> candidates
  ) {
    List<ShipmentBatchItemRequest> items = new ArrayList<>();
    Set<String> queuedIdentities = new LinkedHashSet<>();
    for (RefreshableShipment candidate : candidates) {
      if (candidate.referenceNo() == null || candidate.referenceNo().isBlank()) continue;
      String identity = ShipmentReferences.durableReferenceIdentity(
          candidate.carrier(), candidate.referenceType(), candidate.referenceNo()
      );
      if (!queuedIdentities.add(identity)) continue;
      items.add(new ShipmentBatchItemRequest(
          "refresh-" + candidate.shipmentPublicId(),
          candidate.carrier(),
          candidate.referenceType(),
          candidate.referenceNo(),
          candidate.displayReferenceNo(),
          false,
          null
      ));
    }
    return items;
  }

  private String refreshReferencePredicate() {
    return trackingProperties.usesLocalQueue()
        ? "(r2.reference_type = 'BOOKING' OR (s.carrier_code <> 'CMA' AND r2.reference_type = 'BILLOFLADING'))"
        : "r2.reference_type = 'BOOKING'";
  }

  private String refreshCarrierCodes() {
    return trackingProperties.usesLocalQueue()
        ? "'" + String.join("', '", TrackingCarriers.CODES) + "'"
        : "'COSCO', 'CMA', 'MAERSK', 'HAPAG_LLOYD', 'MSC', 'OOCL'";
  }

  private RefreshableShipment mapRefreshableShipment(ResultSet rs, int rowNumber)
      throws SQLException {
    String normalized = rs.getString("reference_no_normalized");
    String raw = rs.getString("reference_no_raw");
    String carrier = rs.getString("carrier_code");
    String referenceType = rs.getString("reference_type");
    if (!trackingProperties.usesLocalQueue()
        && ShipmentReferences.isSharedCoscoNumericIdentity(carrier, referenceType, normalized)) {
      normalized = ShipmentReferences.normalizeReference(normalized);
      if (normalized.startsWith("COSU")) normalized = normalized.substring(4);
      referenceType = "BOOKING";
    }
    return new RefreshableShipment(
        rs.getString("shipment_public_id"),
        carrier,
        referenceType,
        normalized,
        raw == null || raw.isBlank() ? normalized : raw
    );
  }

  private void enrichShipmentRelations(List<Map<String, Object>> items) {
    if (items.isEmpty()) return;
    List<String> publicIds = items.stream()
        .map(item -> (String) item.get("shipmentId"))
        .filter(id -> id != null && !id.isBlank())
        .distinct()
        .toList();
    if (publicIds.isEmpty()) return;

    String placeholders = String.join(", ", publicIds.stream().map(id -> "?").toList());
    String customerSql =
        """
        SELECT s.public_id AS shipment_public_id, c.public_id AS customer_public_id,
               c.username, c.display_name, c.client_code, c.party_role,
               a.relationship_role, a.publication_status
        FROM cp_customer_shipment_access a
        JOIN cp_shipments s ON s.id = a.shipment_id
        JOIN cp_customers c ON c.id = a.customer_id
        WHERE s.public_id IN (
        """
        + placeholders + ") AND c.status = 'ACTIVE' ORDER BY a.assigned_at, c.id";
    Map<String, List<Map<String, Object>>> customersByShipment = new LinkedHashMap<>();
    jdbcTemplate.query(
        customerSql,
        (rs, rowNum) -> {
          String shipmentPublicId = rs.getString("shipment_public_id");
          Map<String, Object> customer = new LinkedHashMap<>();
          customer.put("id", rs.getString("customer_public_id"));
          customer.put("clientCode", rs.getString("client_code"));
          customer.put("displayName", rs.getString("display_name"));
          customer.put("partyRole", rs.getString("party_role"));
          customer.put("publicationStatus", rs.getString("publication_status"));
          customer.put("username", rs.getString("username"));
          customer.put("relationshipRole", rs.getString("relationship_role"));
          customersByShipment
              .computeIfAbsent(shipmentPublicId, key -> new ArrayList<>())
              .add(customer);
          return null;
        },
        publicIds.toArray()
    );

    Map<String, LinkedHashMap<String, Map<String, Object>>> internalByShipment =
        new LinkedHashMap<>();
    String responsibleAgentSql = """
        SELECT s.public_id AS shipment_public_id, u.id AS user_id, u.username,
               u.display_name, u.role AS account_role, u.party_role
        FROM cp_shipments s
        JOIN cp_users u ON u.id = s.responsible_agent_id
        WHERE s.public_id IN (
        """ + placeholders + ") AND u.status <> 'DELETED' ORDER BY s.id";
    jdbcTemplate.query(
        responsibleAgentSql,
        (rs, rowNum) -> {
          addInternalBoundUser(internalByShipment, rs, "RESPONSIBLE_AGENT");
          return null;
        },
        publicIds.toArray()
    );
    String participantSql = """
        SELECT s.public_id AS shipment_public_id, u.id AS user_id, u.username,
               u.display_name, u.role AS account_role, u.party_role, p.participant_role
        FROM cp_shipment_participants p
        JOIN cp_shipments s ON s.id = p.shipment_id
        JOIN cp_users u ON u.id = p.user_id
        WHERE s.public_id IN (
        """ + placeholders + ") AND u.status <> 'DELETED' ORDER BY s.id, p.user_id";
    jdbcTemplate.query(
        participantSql,
        (rs, rowNum) -> {
          addInternalBoundUser(internalByShipment, rs, rs.getString("participant_role"));
          return null;
        },
        publicIds.toArray()
    );

    for (Map<String, Object> item : items) {
      String shipmentId = (String) item.get("shipmentId");
      List<Map<String, Object>> customers = customersByShipment.getOrDefault(
          shipmentId, List.of()
      );
      List<Map<String, Object>> internalUsers = new ArrayList<>(
          internalByShipment.getOrDefault(shipmentId, new LinkedHashMap<>()).values()
      );
      List<Map<String, Object>> boundUsers = new ArrayList<>(internalUsers);
      for (Map<String, Object> customer : customers) {
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("id", customer.get("id"));
        user.put("username", customer.get("username"));
        user.put("displayName", customer.get("displayName"));
        user.put("kind", "CUSTOMER");
        user.put("role", customer.get("partyRole"));
        user.put("relationshipRole", customer.get("relationshipRole"));
        user.put("clientCode", customer.get("clientCode"));
        boundUsers.add(user);
      }
      item.put("boundCustomers", customers);
      item.put("participants", internalUsers);
      item.put("boundUsers", boundUsers);
      item.put("customerCount", customers.size());
      item.put(
          "boundRoles",
          customers.stream().map(customer -> (String) customer.get("relationshipRole"))
              .filter(role -> role != null && !role.isBlank()).distinct().toList()
      );

      String snapshotClientCode = (String) item.get("clientNameCode");
      Map<String, Object> matchedCustomer = customers.stream()
          .filter(customer -> snapshotClientCode != null
              && (snapshotClientCode.equalsIgnoreCase((String) customer.get("clientCode"))
                  || snapshotClientCode.equalsIgnoreCase((String) customer.get("displayName"))))
          .findFirst()
          .orElse(null);
      Map<String, Object> fallbackCustomer = customers.isEmpty() ? null : customers.get(0);
      item.put(
          "clientNo",
          snapshotClientCode != null
              ? snapshotClientCode
              : fallbackCustomer == null ? null : fallbackCustomer.get("clientCode")
      );
      item.put(
          "clientName",
          snapshotClientCode != null
              ? matchedCustomer == null ? null : matchedCustomer.get("displayName")
              : fallbackCustomer == null ? null : fallbackCustomer.get("displayName")
      );
    }
  }

  private void addInternalBoundUser(
      Map<String, LinkedHashMap<String, Map<String, Object>>> usersByShipment,
      ResultSet rs,
      String bindingRole
  ) throws SQLException {
    String shipmentId = rs.getString("shipment_public_id");
    String userId = Long.toString(rs.getLong("user_id"));
    Map<String, Object> user = new LinkedHashMap<>();
    user.put("id", rs.getLong("user_id"));
    user.put("username", rs.getString("username"));
    user.put("displayName", rs.getString("display_name"));
    user.put("kind", "INTERNAL");
    String partyRole = rs.getString("party_role");
    String accountRole = rs.getString("account_role");
    user.put("role", accountRole);
    user.put("partyRole", partyRole);
    user.put("bindingRole", bindingRole);
    user.put("accountRole", accountRole);
    user.put("clientCode", null);
    usersByShipment.computeIfAbsent(shipmentId, key -> new LinkedHashMap<>())
        .putIfAbsent(userId, user);
  }

  public Map<String, Object> getShipmentSnapshot(AuthenticatedUser actor, String shipmentPublicId) {
    accessGuard.requireOperationsReader(actor);
    String baseSql = snapshotShipmentSelect();
    List<Map<String, Object>> items = actor.isAdmin()
        ? jdbcTemplate.query(
            baseSql + " WHERE s.public_id = ? LIMIT 1",
            this::mapSnapshotShipment,
            shipmentPublicId
        )
        : jdbcTemplate.query(
            baseSql + " WHERE s.public_id = ? AND (s.responsible_agent_id = ? OR EXISTS ("
                + "SELECT 1 FROM cp_shipment_participants p "
                + "WHERE p.shipment_id = s.id AND p.user_id = ?)) LIMIT 1",
            this::mapSnapshotShipment,
            shipmentPublicId, actor.id(), actor.id()
        );
    if (items.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Shipment snapshot not found");
    }
    enrichShipmentRelations(items);
    return items.get(0);
  }

  private String snapshotShipmentSelect() {
    return """
        SELECT t.id, s.id AS shipment_id,
               COALESCE(r.reference_type, t.query_reference_type) AS query_reference_type,
               COALESCE(r.reference_no_raw, t.query_reference_no) AS query_reference_no,
               t.source_channel, t.snapshot_json, t.fetched_at, t.fresh_until, t.created_at,
               s.public_id AS shipment_public_id, s.carrier_code, s.tracking_status,
               s.business_note, s.job_number, s.client_po_number, s.client_name_code,
               s.original_bill_of_lading, s.last_refresh_result,
               s.last_refresh_error_code, s.last_refresh_error,
               s.last_refresh_attempts, s.last_refresh_proxy_attempts,
               s.last_refresh_at, s.last_tracked_at,
               s.created_at AS shipment_created_at, s.updated_at,
               CASE
                 WHEN %s
                   THEN 'COMPLETED'
                 WHEN UPPER(COALESCE(s.last_refresh_result, '')) IN ('FAILED', 'PARTIAL')
                   THEN 'UPDATE_FAILED'
                 WHEN t.id IS NULL OR UPPER(COALESCE(t.source_channel, '')) = 'IMPORTED_MANUAL'
                      OR s.last_tracked_at IS NULL
                   THEN 'MANUAL_REQUIRED'
                 WHEN s.last_tracked_at >= CURRENT_DATE
                   THEN 'TODAY_UPDATED'
                 ELSE 'TODAY_PENDING'
               END AS business_state,
               CASE
                 WHEN t.id IS NOT NULL
                      AND UPPER(COALESCE(t.source_channel, '')) <> 'IMPORTED_MANUAL'
                      AND s.last_tracked_at IS NOT NULL
                   THEN TRUE ELSE FALSE
               END AS has_valid_tracking
        FROM cp_shipments s
        LEFT JOIN cp_tracking_snapshots t
          ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        LEFT JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id FROM cp_shipment_references r2
          WHERE r2.shipment_id = s.id
          ORDER BY CASE WHEN r2.reference_type = 'BOOKING' THEN 0 ELSE 1 END,
                   r2.primary_reference DESC, r2.id ASC LIMIT 1
        )
        """.formatted(terminalShipmentSql("s"));
  }

  private String shipmentSnapshotOrderBy() {
    // This is also the timestamp rendered by the overview tables. Keep the ordering in
    // SQL so LIMIT/OFFSET is applied only after the complete result set is sorted.
    return " ORDER BY COALESCE(s.last_tracked_at, s.updated_at, t.fetched_at, s.created_at) DESC, "
        + "s.id DESC";
  }

  private Map<String, Object> mapSnapshotShipment(ResultSet rs, int rowNumber) throws SQLException {
    Map<String, Object> value = new LinkedHashMap<>();
    String shipmentPublicId = rs.getString("shipment_public_id");
    String carrier = rs.getString("carrier_code");
    String referenceType = rs.getString("query_reference_type");
    String referenceNo = rs.getString("query_reference_no");
    String trackingStatus = rs.getString("tracking_status");
    String fetchedAt = ShipmentRowMappers.instantString(rs, "fetched_at");
    String lastTrackedAt = ShipmentRowMappers.instantString(rs, "last_tracked_at");
    String updatedAt = ShipmentRowMappers.instantString(rs, "updated_at");
    String snapshotJson = rs.getString("snapshot_json");

    value.put("shipmentId", shipmentPublicId);
    value.put("carrier", carrier != null ? carrier : "COSCO");
    value.put("referenceType", referenceType);
    value.put("referenceNo", referenceNo);
    value.put("trackingStatus", trackingStatus);
    value.put("note", rs.getString("business_note"));
    value.put("lastTrackedAt", lastTrackedAt);
    value.put("snapshotFetchedAt", fetchedAt);
    value.put("createdAt", ShipmentRowMappers.instantString(rs, "shipment_created_at"));
    value.put("updatedAt", updatedAt != null ? updatedAt : fetchedAt);
    value.put("customerCount", 0L);
    value.put("boundRoles", List.of());
    value.put("snapshotJson", snapshotJson);
    value.put("sourceChannel", rs.getString("source_channel"));
    value.put("businessState", rs.getString("business_state"));
    value.put("hasValidTracking", rs.getBoolean("has_valid_tracking"));
    value.put("forwarderJobNumber", rs.getString("job_number"));
    value.put("clientPoNumber", rs.getString("client_po_number"));
    value.put("clientNameCode", rs.getString("client_name_code"));
    value.put("originalBillOfLading", rs.getString("original_bill_of_lading"));
    ShipmentRowMappers.putRefreshOutcome(value, rs);
    value.put("dataAvailable", false);
    value.put("snapshot", null);

    if (snapshotJson != null && !snapshotJson.isBlank()) {
      try {
        JsonNode parsedSnapshot = objectMapper.readTree(snapshotJson);
        if (parsedSnapshot == null || !parsedSnapshot.isObject()) return value;
        ObjectNode snap = (ObjectNode) parsedSnapshot;
        value.put("dataAvailable", true);
        JsonNode summary = snap.path("summary");
        JsonNode keyTimes = snap.path("keyTimes");
        ObjectNode references = objectField(snap, "references");
        ObjectNode businessRef = objectField(references, "business");
        JsonNode tracking = snap.path("tracking");

        if (value.get("forwarderJobNumber") == null) {
          value.put("forwarderJobNumber", ShipmentReferences.textOrNull(businessRef.path("forwarderJobNumber")));
        }
        if (value.get("clientPoNumber") == null) {
          value.put("clientPoNumber", ShipmentReferences.textOrNull(businessRef.path("clientPoNumber")));
        }
        if (value.get("clientNameCode") == null) {
          value.put("clientNameCode", ShipmentReferences.textOrNull(businessRef.path("clientNameCode")));
        }
        putManualField(
            businessRef,
            "forwarderJobNumber",
            (String) value.get("forwarderJobNumber")
        );
        putManualField(businessRef, "clientPoNumber", (String) value.get("clientPoNumber"));
        putManualField(businessRef, "clientNameCode", (String) value.get("clientNameCode"));
        value.put("snapshot", snap);

        JsonNode origin = summary.path("origin");
        JsonNode destination = summary.path("destination");
        value.put("portOfLoading", ShipmentReferences.textOrNull(origin.path("name")));
        value.put("portOfDischarge", ShipmentReferences.textOrNull(destination.path("name")));

        value.put("vesselVoyage", ShipmentReferences.textOrNull(summary.path("vesselVoyage")));
        value.put("volume", ShipmentReferences.textOrNull(summary.path("volume")));
        value.put("containerType", ShipmentReferences.textOrNull(summary.path("containerType")));
        value.put("trafficTerm", ShipmentReferences.textOrNull(summary.path("trafficTerm")));

        value.put("estimatedDeparture", ShipmentReferences.textOrNull(keyTimes.path("estimatedDeparture").path("time")));
        String estimatedArrival = ShipmentReferences.textOrNull(
            keyTimes.path("estimatedFinalArrival").path("time")
        );
        if (estimatedArrival == null) {
          estimatedArrival = ShipmentReferences.textOrNull(keyTimes.path("estimatedArrival").path("time"));
        }
        value.put("estimatedArrival", estimatedArrival);
        value.put("actualDeparture", ShipmentReferences.textOrNull(keyTimes.path("actualDeparture").path("time")));
        value.put("actualArrival", ShipmentReferences.textOrNull(keyTimes.path("actualArrival").path("time")));
        value.put("actualDelivery", ShipmentReferences.textOrNull(keyTimes.path("actualDelivery").path("time")));
        value.put("estimatedDelivery", ShipmentReferences.textOrNull(keyTimes.path("estimatedDelivery").path("time")));

        JsonNode latestEvent = summary.path("latestEvent");
        value.put("currentLocation", ShipmentReferences.textOrNull(latestEvent.path("location")));

        value.put("masterBill", ShipmentReferences.textOrNull(references.path("masterBill")));
        value.put("bookingNumber", ShipmentReferences.firstTextValue(
            references.path("bookingNumbers"),
            summary.path("bookingNumbers"),
            references.path("booking")
        ));

        JsonNode containers = snap.path("containers");
        if (containers.isArray() && containers.size() > 0) {
          value.put("containerCount", containers.size());
          JsonNode firstContainer = containers.get(0);
          value.put("containerNumber", ShipmentReferences.textOrNull(firstContainer.path("number")));
          value.put("containerType", firstContainer.has("type") ? firstContainer.path("type").asText(null) : (String) value.get("containerType"));
        } else {
          JsonNode summaryContainers = summary.path("containers");
          if (summaryContainers.isArray() && summaryContainers.size() > 0) {
            value.put("containerCount", summaryContainers.size());
          }
        }

        JsonNode routingLegs = snap.path("routingLegs");
        if (routingLegs.isArray() && routingLegs.size() > 0) {
          JsonNode firstLeg = routingLegs.get(0);
          if (!value.containsKey("vesselVoyage") || value.get("vesselVoyage") == null) {
            String vessel = ShipmentReferences.textOrNull(firstLeg.path("vessel"));
            String voyage = ShipmentReferences.textOrNull(firstLeg.path("voyage"));
            if (vessel != null || voyage != null) {
              value.put("vesselVoyage", (vessel != null ? vessel : "") + (voyage != null ? " / " + voyage : ""));
            }
          }
        }
      } catch (Exception ignored) {
      }
    }
    return value;
  }

  private record ShipmentCounts(long total, long unfinished, long refreshIssues) {}

  private record RefreshableShipment(
      String shipmentPublicId,
      String carrier,
      String referenceType,
      String referenceNo,
      String displayReferenceNo
  ) {}


  private List<Map<String, Object>> deduplicateShipmentSnapshots(
      List<Map<String, Object>> shipments
  ) {
    Map<String, Map<String, Object>> unique = new LinkedHashMap<>();
    for (Map<String, Object> shipment : shipments) {
      String key = ShipmentReferences.durableReferenceIdentity(
          String.valueOf(shipment.getOrDefault("carrier", "")),
          String.valueOf(shipment.getOrDefault("referenceType", "")),
          String.valueOf(shipment.getOrDefault("referenceNo", ""))
      );
      Map<String, Object> current = unique.get(key);
      if (current == null || preferShipmentSnapshot(shipment, current)) {
        unique.put(key, shipment);
      }
    }
    return new ArrayList<>(unique.values());
  }

  private boolean preferShipmentSnapshot(
      Map<String, Object> candidate,
      Map<String, Object> current
  ) {
    long candidateBindings = ((Number) candidate.getOrDefault("customerCount", 0L)).longValue();
    long currentBindings = ((Number) current.getOrDefault("customerCount", 0L)).longValue();
    if ((candidateBindings > 0) != (currentBindings > 0)) return candidateBindings > 0;
    boolean candidateData = Boolean.TRUE.equals(candidate.get("dataAvailable"));
    boolean currentData = Boolean.TRUE.equals(current.get("dataAvailable"));
    if (candidateData != currentData) return candidateData;
    boolean candidateBooking = "BOOKING".equals(candidate.get("referenceType"));
    boolean currentBooking = "BOOKING".equals(current.get("referenceType"));
    return candidateBooking && !currentBooking;
  }


  private ObjectNode objectField(ObjectNode parent, String field) {
    JsonNode current = parent.get(field);
    if (current != null && current.isObject()) return (ObjectNode) current;
    ObjectNode created = objectMapper.createObjectNode();
    parent.set(field, created);
    return created;
  }

  private void putManualField(ObjectNode node, String name, String value) {
    if (value != null) node.put(name, value);
  }
}
