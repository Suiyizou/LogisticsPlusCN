package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomerRelationshipService {
  private static final int MAX_HANDOVER_CUSTOMERS = 200;

  private final JdbcTemplate jdbcTemplate;

  public CustomerRelationshipService(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public Map<String, Object> listRelationships(AuthenticatedUser actor) {
    requireManager(actor);
    Map<Long, PendingHandover> pendingByCustomer = pendingHandoversByCustomer();
    List<RelationshipRow> rows = jdbcTemplate.query(
        """
        SELECT c.id AS internal_customer_id, c.public_id, c.username, c.display_name,
               c.client_code, c.party_role, c.status, c.remark, c.created_at, c.updated_at,
               owner.id AS owner_id, owner.username AS owner_username,
               owner.display_name AS owner_display_name, owner.status AS owner_status,
               linked_agent.public_id AS linked_agent_public_id,
               linked_agent.username AS linked_agent_username,
               linked_agent.display_name AS linked_agent_display_name,
               linked_agent.client_code AS linked_agent_client_code,
               (SELECT COUNT(*) FROM cp_customer_shipment_access access_link
                WHERE access_link.customer_id = c.id) AS shipment_count
        FROM cp_customers c
        LEFT JOIN cp_users owner ON owner.id = c.responsible_agent_id
        LEFT JOIN cp_oversea_agent_customers agent_link ON agent_link.customer_id = c.id
        LEFT JOIN cp_customers linked_agent
          ON linked_agent.id = agent_link.oversea_agent_customer_id
        ORDER BY c.display_name, c.client_code, c.id
        """,
        this::mapRelationship
    );
    List<Map<String, Object>> items = new ArrayList<>();
    for (RelationshipRow row : rows) {
      Map<String, Object> value = new LinkedHashMap<>(row.value());
      PendingHandover pending = pendingByCustomer.get(row.internalCustomerId());
      value.put("pendingHandover", pending == null ? null : pending.value());
      items.add(value);
    }

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", items);
    response.put("total", items.size());
    response.put("owners", listActiveBusinessOwners());
    response.put("currentUserId", actor.id());
    response.put("incomingPending", countPendingForTarget(actor));
    response.put("outgoingPending", countPendingFromOwner(actor));
    return response;
  }

  public Map<String, Object> listHandoverRequests(AuthenticatedUser actor) {
    requireManager(actor);
    String authority = actor.isAdmin()
        ? ""
        : " WHERE (r.from_business_user_id = ? OR r.to_business_user_id = ? "
            + "OR r.requested_by = ?)";
    Object[] parameters = actor.isAdmin()
        ? new Object[0]
        : new Object[] {actor.id(), actor.id(), actor.id()};
    List<HandoverRow> rows = jdbcTemplate.query(
        """
        SELECT r.id AS internal_request_id, r.public_id, r.status, r.reason,
               r.decision_note, r.requested_at, r.decided_at,
               from_user.id AS from_user_id, from_user.username AS from_username,
               from_user.display_name AS from_display_name,
               to_user.id AS to_user_id, to_user.username AS to_username,
               to_user.display_name AS to_display_name,
               requested_by.id AS requested_by_id,
               requested_by.display_name AS requested_by_display_name,
               decided_by.id AS decided_by_id,
               decided_by.display_name AS decided_by_display_name,
               c.public_id AS customer_public_id, c.display_name AS customer_display_name,
               c.username AS customer_username, c.client_code, c.party_role,
               i.previous_owner_id
        FROM cp_customer_handover_requests r
        JOIN cp_customer_handover_items i ON i.request_id = r.id
        JOIN cp_customers c ON c.id = i.customer_id
        JOIN cp_users from_user ON from_user.id = r.from_business_user_id
        JOIN cp_users to_user ON to_user.id = r.to_business_user_id
        JOIN cp_users requested_by ON requested_by.id = r.requested_by
        LEFT JOIN cp_users decided_by ON decided_by.id = r.decided_by
        """ + authority + """
        ORDER BY CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END,
                 r.requested_at DESC, r.id DESC, c.display_name, c.id
        LIMIT 2000
        """,
        this::mapHandoverRow,
        parameters
    );
    LinkedHashMap<Long, Map<String, Object>> requests = new LinkedHashMap<>();
    for (HandoverRow row : rows) {
      Map<String, Object> request = requests.computeIfAbsent(
          row.internalRequestId(),
          ignored -> handoverMetadata(row, actor)
      );
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> customers =
          (List<Map<String, Object>>) request.get("customers");
      customers.add(row.customer());
    }
    return Map.of("items", List.copyOf(requests.values()), "total", requests.size());
  }

  @Transactional
  public Map<String, Object> createHandoverRequest(
      CustomerHandoverCreateRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    List<String> customerIds = normalizeCustomerIds(request == null ? null : request.customerIds());
    if (customerIds.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one customer is required");
    }
    if (customerIds.size() > MAX_HANDOVER_CUSTOMERS) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "A customer handover cannot exceed " + MAX_HANDOVER_CUSTOMERS + " customers"
      );
    }
    Long targetId = request == null ? null : request.targetBusinessUserId();
    if (targetId == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Target business user is required");
    }
    BusinessOwner target = requireActiveBusinessOwner(targetId);
    String reason = requiredText(request == null ? null : request.reason(), "Handover reason", 500);

    List<HandoverCustomer> customers = new ArrayList<>();
    Long fromOwnerId = null;
    for (String customerId : customerIds.stream().sorted().toList()) {
      HandoverCustomer customer = requireCustomerForUpdate(customerId);
      if (!actor.isAdmin() && customer.ownerId() != actor.id()) {
        throw new ApiException(
            HttpStatus.FORBIDDEN,
            "Only the current responsible business user can initiate this handover"
        );
      }
      if (customer.ownerId() == target.id()) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "Customer " + customer.displayName() + " is already assigned to the target business user"
        );
      }
      if (!"ACTIVE".equals(customer.status())) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Only active customers can be handed over");
      }
      if (hasPendingHandover(customer.id())) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "Customer " + customer.displayName() + " already has a pending handover"
        );
      }
      if (fromOwnerId == null) fromOwnerId = customer.ownerId();
      if (!fromOwnerId.equals(customer.ownerId())) {
        throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "Customers in one handover must have the same current responsible business user"
        );
      }
      customers.add(customer);
    }

    String publicId = UUID.randomUUID().toString();
    KeyHolder keyHolder = new GeneratedKeyHolder();
    Long resolvedFromOwnerId = fromOwnerId;
    jdbcTemplate.update(connection -> {
      PreparedStatement statement = connection.prepareStatement(
          """
          INSERT INTO cp_customer_handover_requests (
            public_id, from_business_user_id, to_business_user_id, requested_by,
            status, reason, requested_ip
          ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
          """,
          new String[] {"id"}
      );
      statement.setString(1, publicId);
      statement.setLong(2, resolvedFromOwnerId);
      statement.setLong(3, target.id());
      statement.setLong(4, actor.id());
      statement.setString(5, reason);
      statement.setString(6, ClientInfo.trim(ipAddress, 64));
      return statement;
    }, keyHolder);
    Number generatedKey = keyHolder.getKey();
    if (generatedKey == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create handover request");
    }
    long requestId = generatedKey.longValue();
    for (HandoverCustomer customer : customers) {
      jdbcTemplate.update(
          """
          INSERT INTO cp_customer_handover_items (
            request_id, customer_id, previous_owner_id
          ) VALUES (?, ?, ?)
          """,
          requestId,
          customer.id(),
          customer.ownerId()
      );
      audit(
          actor,
          "REQUEST_CUSTOMER_HANDOVER",
          customer.id(),
          "Requested handover " + publicId + " to " + target.displayName(),
          ipAddress
      );
    }

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("id", publicId);
    response.put("status", "PENDING");
    response.put("customerCount", customers.size());
    response.put("targetBusinessUserId", target.id());
    response.put("targetBusinessDisplayName", target.displayName());
    return response;
  }

  @Transactional
  public Map<String, Object> decideHandoverRequest(
      String requestPublicId,
      CustomerHandoverDecisionRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    String decision = normalizeDecision(request == null ? null : request.decision());
    String note = optionalText(request == null ? null : request.note(), 500);
    DecisionRecord handover = requireRequestForUpdate(requestPublicId);
    if (!actor.isAdmin() && handover.toUserId() != actor.id()) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Only the target business user can decide this handover"
      );
    }
    if (!"PENDING".equals(handover.status())) {
      throw new ApiException(HttpStatus.CONFLICT, "Handover request is no longer pending");
    }

    List<HandoverItem> items = jdbcTemplate.query(
        """
        SELECT i.customer_id, i.previous_owner_id, c.public_id, c.display_name
        FROM cp_customer_handover_items i
        JOIN cp_customers c ON c.id = i.customer_id
        WHERE i.request_id = ?
        ORDER BY i.customer_id
        FOR UPDATE
        """,
        (rs, rowNumber) -> new HandoverItem(
            rs.getLong("customer_id"),
            rs.getLong("previous_owner_id"),
            rs.getString("public_id"),
            rs.getString("display_name")
        ),
        handover.id()
    );
    if (items.isEmpty()) {
      throw new ApiException(HttpStatus.CONFLICT, "Handover request has no customers");
    }

    Set<Long> affectedShipments = new LinkedHashSet<>();
    if ("ACCEPTED".equals(decision)) {
      requireActiveBusinessOwner(handover.toUserId());
      for (HandoverItem item : items) {
        Long currentOwner = jdbcTemplate.queryForObject(
            "SELECT responsible_agent_id FROM cp_customers WHERE id = ? FOR UPDATE",
            Long.class,
            item.customerId()
        );
        if (currentOwner == null || currentOwner != item.previousOwnerId()) {
          throw new ApiException(
              HttpStatus.CONFLICT,
              "Customer " + item.displayName() + " has changed owner; create a new handover request"
          );
        }
        jdbcTemplate.update(
            "UPDATE cp_customers SET responsible_agent_id = ? WHERE id = ?",
            handover.toUserId(),
            item.customerId()
        );
        List<Long> shipmentIds = jdbcTemplate.query(
            "SELECT shipment_id FROM cp_customer_shipment_access WHERE customer_id = ?",
            (rs, rowNumber) -> rs.getLong(1),
            item.customerId()
        );
        for (Long shipmentId : shipmentIds) {
          grantShipmentParticipation(shipmentId, handover.toUserId(), actor.id());
          affectedShipments.add(shipmentId);
        }
        audit(
            actor,
            "ACCEPT_CUSTOMER_HANDOVER",
            item.customerId(),
            "Accepted handover " + handover.publicId()
                + "; previous owner " + item.previousOwnerId()
                + "; new owner " + handover.toUserId(),
            ipAddress
        );
      }
    } else {
      for (HandoverItem item : items) {
        audit(
            actor,
            "REJECT_CUSTOMER_HANDOVER",
            item.customerId(),
            "Rejected handover " + handover.publicId(),
            ipAddress
        );
      }
    }

    jdbcTemplate.update(
        """
        UPDATE cp_customer_handover_requests
        SET status = ?, decision_note = ?, decided_by = ?, decided_at = ?
        WHERE id = ? AND status = 'PENDING'
        """,
        decision,
        note,
        actor.id(),
        Timestamp.from(Instant.now()),
        handover.id()
    );
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("id", handover.publicId());
    response.put("status", decision);
    response.put("customerCount", items.size());
    response.put("relatedShipments", affectedShipments.size());
    response.put("historyRetained", true);
    return response;
  }

  private Map<Long, PendingHandover> pendingHandoversByCustomer() {
    List<PendingHandover> rows = jdbcTemplate.query(
        """
        SELECT i.customer_id, r.public_id, r.from_business_user_id,
               from_user.display_name AS from_display_name,
               r.to_business_user_id, to_user.display_name AS to_display_name,
               r.requested_at
        FROM cp_customer_handover_items i
        JOIN cp_customer_handover_requests r ON r.id = i.request_id
        JOIN cp_users from_user ON from_user.id = r.from_business_user_id
        JOIN cp_users to_user ON to_user.id = r.to_business_user_id
        WHERE r.status = 'PENDING'
        ORDER BY r.requested_at DESC, r.id DESC
        """,
        (rs, rowNumber) -> {
          Map<String, Object> value = new LinkedHashMap<>();
          value.put("requestId", rs.getString("public_id"));
          value.put("fromBusinessUserId", rs.getLong("from_business_user_id"));
          value.put("fromBusinessDisplayName", rs.getString("from_display_name"));
          value.put("toBusinessUserId", rs.getLong("to_business_user_id"));
          value.put("toBusinessDisplayName", rs.getString("to_display_name"));
          value.put("requestedAt", instantString(rs, "requested_at"));
          return new PendingHandover(rs.getLong("customer_id"), value);
        }
    );
    Map<Long, PendingHandover> values = new LinkedHashMap<>();
    for (PendingHandover row : rows) values.putIfAbsent(row.customerId(), row);
    return values;
  }

  private List<Map<String, Object>> listActiveBusinessOwners() {
    return jdbcTemplate.query(
        """
        SELECT id, username, display_name
        FROM cp_users
        WHERE role = 'BUSINESS' AND status = 'ACTIVE'
        ORDER BY display_name, username, id
        """,
        (rs, rowNumber) -> {
          Map<String, Object> value = new LinkedHashMap<>();
          value.put("id", rs.getLong("id"));
          value.put("username", rs.getString("username"));
          value.put("displayName", rs.getString("display_name"));
          return value;
        }
    );
  }

  private RelationshipRow mapRelationship(ResultSet rs, int rowNumber) throws SQLException {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("id", rs.getString("public_id"));
    value.put("username", rs.getString("username"));
    value.put("displayName", rs.getString("display_name"));
    value.put("clientCode", rs.getString("client_code"));
    value.put("partyRole", rs.getString("party_role"));
    value.put("status", rs.getString("status"));
    value.put("remark", rs.getString("remark"));
    value.put("shipmentCount", rs.getLong("shipment_count"));
    value.put("createdAt", instantString(rs, "created_at"));
    value.put("updatedAt", instantString(rs, "updated_at"));
    value.put("responsibleBusinessUserId", nullableLong(rs, "owner_id"));
    value.put("responsibleBusinessUsername", rs.getString("owner_username"));
    value.put("responsibleBusinessDisplayName", rs.getString("owner_display_name"));
    value.put("responsibleBusinessStatus", rs.getString("owner_status"));
    value.put("linkedOverseaAgentId", rs.getString("linked_agent_public_id"));
    value.put("linkedOverseaAgentUsername", rs.getString("linked_agent_username"));
    value.put("linkedOverseaAgentDisplayName", rs.getString("linked_agent_display_name"));
    value.put("linkedOverseaAgentCode", rs.getString("linked_agent_client_code"));
    return new RelationshipRow(rs.getLong("internal_customer_id"), value);
  }

  private HandoverRow mapHandoverRow(ResultSet rs, int rowNumber) throws SQLException {
    Map<String, Object> customer = new LinkedHashMap<>();
    customer.put("id", rs.getString("customer_public_id"));
    customer.put("displayName", rs.getString("customer_display_name"));
    customer.put("username", rs.getString("customer_username"));
    customer.put("clientCode", rs.getString("client_code"));
    customer.put("partyRole", rs.getString("party_role"));
    customer.put("previousOwnerId", rs.getLong("previous_owner_id"));
    return new HandoverRow(
        rs.getLong("internal_request_id"),
        rs.getString("public_id"),
        rs.getString("status"),
        rs.getString("reason"),
        rs.getString("decision_note"),
        instantString(rs, "requested_at"),
        instantString(rs, "decided_at"),
        rs.getLong("from_user_id"),
        rs.getString("from_username"),
        rs.getString("from_display_name"),
        rs.getLong("to_user_id"),
        rs.getString("to_username"),
        rs.getString("to_display_name"),
        rs.getLong("requested_by_id"),
        rs.getString("requested_by_display_name"),
        nullableLong(rs, "decided_by_id"),
        rs.getString("decided_by_display_name"),
        customer
    );
  }

  private Map<String, Object> handoverMetadata(HandoverRow row, AuthenticatedUser actor) {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("id", row.publicId());
    value.put("status", row.status());
    value.put("reason", row.reason());
    value.put("decisionNote", row.decisionNote());
    value.put("requestedAt", row.requestedAt());
    value.put("decidedAt", row.decidedAt());
    value.put("fromBusinessUserId", row.fromUserId());
    value.put("fromBusinessUsername", row.fromUsername());
    value.put("fromBusinessDisplayName", row.fromDisplayName());
    value.put("toBusinessUserId", row.toUserId());
    value.put("toBusinessUsername", row.toUsername());
    value.put("toBusinessDisplayName", row.toDisplayName());
    value.put("requestedById", row.requestedById());
    value.put("requestedByDisplayName", row.requestedByDisplayName());
    value.put("decidedById", row.decidedById());
    value.put("decidedByDisplayName", row.decidedByDisplayName());
    value.put(
        "canDecide",
        "PENDING".equals(row.status()) && (actor.isAdmin() || row.toUserId() == actor.id())
    );
    value.put("customers", new ArrayList<Map<String, Object>>());
    return value;
  }

  private HandoverCustomer requireCustomerForUpdate(String publicId) {
    List<HandoverCustomer> rows = jdbcTemplate.query(
        """
        SELECT id, public_id, display_name, status, responsible_agent_id
        FROM cp_customers
        WHERE public_id = ?
        FOR UPDATE
        """,
        (rs, rowNumber) -> new HandoverCustomer(
            rs.getLong("id"),
            rs.getString("public_id"),
            rs.getString("display_name"),
            rs.getString("status"),
            rs.getLong("responsible_agent_id")
        ),
        publicId
    );
    if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Customer not found");
    return rows.get(0);
  }

  private BusinessOwner requireActiveBusinessOwner(long userId) {
    List<BusinessOwner> rows = jdbcTemplate.query(
        """
        SELECT id, username, display_name
        FROM cp_users
        WHERE id = ? AND role = 'BUSINESS' AND status = 'ACTIVE'
        FOR UPDATE
        """,
        (rs, rowNumber) -> new BusinessOwner(
            rs.getLong("id"),
            rs.getString("username"),
            rs.getString("display_name")
        ),
        userId
    );
    if (rows.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Target business user is not active");
    }
    return rows.get(0);
  }

  private DecisionRecord requireRequestForUpdate(String publicId) {
    List<DecisionRecord> rows = jdbcTemplate.query(
        """
        SELECT id, public_id, from_business_user_id, to_business_user_id, status
        FROM cp_customer_handover_requests
        WHERE public_id = ?
        FOR UPDATE
        """,
        (rs, rowNumber) -> new DecisionRecord(
            rs.getLong("id"),
            rs.getString("public_id"),
            rs.getLong("from_business_user_id"),
            rs.getLong("to_business_user_id"),
            rs.getString("status")
        ),
        publicId == null ? "" : publicId.trim()
    );
    if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Handover request not found");
    return rows.get(0);
  }

  private boolean hasPendingHandover(long customerId) {
    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*)
        FROM cp_customer_handover_items i
        JOIN cp_customer_handover_requests r ON r.id = i.request_id
        WHERE i.customer_id = ? AND r.status = 'PENDING'
        """,
        Integer.class,
        customerId
    );
    return count != null && count > 0;
  }

  private long countPendingForTarget(AuthenticatedUser actor) {
    if (actor.isAdmin()) {
      Long count = jdbcTemplate.queryForObject(
          "SELECT COUNT(*) FROM cp_customer_handover_requests WHERE status = 'PENDING'",
          Long.class
      );
      return count == null ? 0 : count;
    }
    Long count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) FROM cp_customer_handover_requests
        WHERE status = 'PENDING' AND to_business_user_id = ?
        """,
        Long.class,
        actor.id()
    );
    return count == null ? 0 : count;
  }

  private long countPendingFromOwner(AuthenticatedUser actor) {
    Long count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) FROM cp_customer_handover_requests
        WHERE status = 'PENDING' AND from_business_user_id = ?
        """,
        Long.class,
        actor.id()
    );
    return count == null ? 0 : count;
  }

  private void grantShipmentParticipation(long shipmentId, long userId, long grantedBy) {
    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) FROM cp_shipment_participants
        WHERE shipment_id = ? AND user_id = ?
        """,
        Integer.class,
        shipmentId,
        userId
    );
    if (count != null && count > 0) return;
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_participants (
          shipment_id, user_id, participant_role, granted_by
        ) VALUES (?, ?, 'CUSTOMER_OWNER', ?)
        """,
        shipmentId,
        userId,
        grantedBy
    );
  }

  private void audit(
      AuthenticatedUser actor,
      String action,
      long customerId,
      String detail,
      String ipAddress
  ) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (
          admin_user_id, action, target_type, target_id, detail, ip_address
        ) VALUES (?, ?, 'CUSTOMER', ?, ?, ?)
        """,
        actor.id(),
        action,
        customerId,
        ClientInfo.trim(detail, 512),
        ClientInfo.trim(ipAddress, 64)
    );
  }

  private List<String> normalizeCustomerIds(List<String> rawIds) {
    LinkedHashSet<String> ids = new LinkedHashSet<>();
    if (rawIds == null) return List.of();
    for (String rawId : rawIds) {
      if (rawId != null && !rawId.isBlank()) ids.add(rawId.trim());
    }
    return List.copyOf(ids);
  }

  private String normalizeDecision(String value) {
    String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    if (!"ACCEPTED".equals(normalized) && !"REJECTED".equals(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Decision must be ACCEPTED or REJECTED");
    }
    return normalized;
  }

  private String requiredText(String value, String field, int maxLength) {
    String normalized = optionalText(value, maxLength);
    if (normalized == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, field + " is required");
    }
    return normalized;
  }

  private String optionalText(String value, int maxLength) {
    if (value == null || value.isBlank()) return null;
    String normalized = value.trim();
    return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
  }

  private void requireManager(AuthenticatedUser actor) {
    if (actor == null || (!actor.isBusiness() && !actor.isAdmin())) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Business or administrator permission is required"
      );
    }
  }

  private Long nullableLong(ResultSet rs, String column) throws SQLException {
    long value = rs.getLong(column);
    return rs.wasNull() ? null : value;
  }

  private String instantString(ResultSet rs, String column) throws SQLException {
    Timestamp timestamp = rs.getTimestamp(column);
    return timestamp == null ? null : timestamp.toInstant().toString();
  }

  private record RelationshipRow(long internalCustomerId, Map<String, Object> value) {}

  private record PendingHandover(long customerId, Map<String, Object> value) {}

  private record BusinessOwner(long id, String username, String displayName) {}

  private record HandoverCustomer(
      long id,
      String publicId,
      String displayName,
      String status,
      long ownerId
  ) {}

  private record HandoverItem(
      long customerId,
      long previousOwnerId,
      String publicId,
      String displayName
  ) {}

  private record DecisionRecord(
      long id,
      String publicId,
      long fromUserId,
      long toUserId,
      String status
  ) {}

  private record HandoverRow(
      long internalRequestId,
      String publicId,
      String status,
      String reason,
      String decisionNote,
      String requestedAt,
      String decidedAt,
      long fromUserId,
      String fromUsername,
      String fromDisplayName,
      long toUserId,
      String toUsername,
      String toDisplayName,
      long requestedById,
      String requestedByDisplayName,
      Long decidedById,
      String decidedByDisplayName,
      Map<String, Object> customer
  ) {}
}
