package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import com.cargoplanner.backend.customer.CustomerTokenCodec.GeneratedCustomerCode;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
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
import org.springframework.transaction.annotation.Transactional;

@Service
public class BusinessCustomerService {
  // Customer access and related documents must be bound to a shipment-level reference.
  // Container numbers are reusable across voyages and therefore cannot be an authority key.
  private static final List<String> REFERENCE_TYPES = List.of("BOOKING", "BILLOFLADING");

  private final JdbcTemplate jdbcTemplate;
  private final CustomerTokenCodec tokenCodec;

  public BusinessCustomerService(JdbcTemplate jdbcTemplate, CustomerTokenCodec tokenCodec) {
    this.jdbcTemplate = jdbcTemplate;
    this.tokenCodec = tokenCodec;
  }

  public Map<String, Object> list(AuthenticatedUser actor) {
    requireManager(actor);
    List<CustomerRecord> records = actor.isAdmin()
        ? jdbcTemplate.query(baseCustomerSelect() + " ORDER BY c.created_at DESC, c.id DESC", this::mapCustomer)
        : jdbcTemplate.query(
            baseCustomerSelect() + " WHERE c.created_by = ? ORDER BY c.created_at DESC, c.id DESC",
            this::mapCustomer,
            actor.id()
        );
    return Map.of("items", records.stream().map(this::customerMetadata).toList(), "total", records.size());
  }

  public Map<String, Object> get(String customerPublicId, AuthenticatedUser actor) {
    return customerMetadata(requireManaged(customerPublicId, actor));
  }

  @Transactional
  public Map<String, Object> create(
      CreateCustomerRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    String username = normalizeUsername(request == null ? null : request.username());
    String displayName = normalizeDisplayName(request == null ? null : request.displayName());
    String partyRole = normalizePartyRole(request == null ? null : request.partyRole(), null);
    GeneratedCustomerCode code = tokenCodec.newCustomerCode();
    String publicId = UUID.randomUUID().toString();
    KeyHolder keyHolder = new GeneratedKeyHolder();
    try {
      jdbcTemplate.update(connection -> {
        PreparedStatement statement = connection.prepareStatement(
            """
            INSERT INTO cp_customers (
              public_id, username, display_name, party_role, customer_code_hash,
              customer_code_prefix, status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
            """,
            Statement.RETURN_GENERATED_KEYS
        );
        statement.setString(1, publicId);
        statement.setString(2, username);
        statement.setString(3, displayName);
        statement.setString(4, partyRole);
        statement.setString(5, code.hash());
        statement.setString(6, code.prefix());
        statement.setLong(7, actor.id());
        return statement;
      }, keyHolder);
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Customer username already exists");
    }
    CustomerRecord customer = requireManaged(publicId, actor);
    audit(actor, "CREATE_CUSTOMER", customer.id(), "Created customer " + username, ipAddress);
    Map<String, Object> response = new LinkedHashMap<>(customerMetadata(customer));
    response.put("customerCode", code.plainText());
    return response;
  }

  @Transactional
  public Map<String, Object> update(
      String customerPublicId,
      UpdateCustomerRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord existing = requireManaged(customerPublicId, actor);
    String username = request == null || request.username() == null || request.username().isBlank()
        ? existing.username()
        : normalizeUsername(request.username());
    String displayName = request == null || request.displayName() == null || request.displayName().isBlank()
        ? existing.displayName()
        : normalizeDisplayName(request.displayName());
    String partyRole = normalizePartyRole(
        request == null ? null : request.partyRole(), existing.partyRole()
    );
    String status = normalizeStatus(request == null ? null : request.status(), existing.status());
    try {
      jdbcTemplate.update(
          "UPDATE cp_customers SET username = ?, display_name = ?, party_role = ?, status = ? WHERE id = ?",
          username,
          displayName,
          partyRole,
          status,
          existing.id()
      );
      // The logistics role is a customer identity attribute in this model. Keep all existing
      // shipment relationships consistent when the business user changes that identity.
      if (!partyRole.equals(existing.partyRole())) {
        jdbcTemplate.update(
            "UPDATE cp_customer_shipment_access SET relationship_role = ? WHERE customer_id = ?",
            partyRole,
            existing.id()
        );
      }
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Customer username already exists");
    }
    if (!"ACTIVE".equals(status)) revokeSessions(existing.id());
    audit(actor, "UPDATE_CUSTOMER", existing.id(), "Updated customer " + username, ipAddress);
    return customerMetadata(requireManaged(customerPublicId, actor));
  }

  @Transactional
  public Map<String, Object> disable(
      String customerPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = requireManaged(customerPublicId, actor);
    jdbcTemplate.update("UPDATE cp_customers SET status = 'DISABLED' WHERE id = ?", customer.id());
    revokeSessions(customer.id());
    audit(actor, "DISABLE_CUSTOMER", customer.id(), "Disabled customer " + customer.username(), ipAddress);
    return Map.of("deleted", true, "id", customer.publicId());
  }

  @Transactional
  public Map<String, Object> resetCode(
      String customerPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = requireManaged(customerPublicId, actor);
    GeneratedCustomerCode code = tokenCodec.newCustomerCode();
    jdbcTemplate.update(
        "UPDATE cp_customers SET customer_code_hash = ?, customer_code_prefix = ? WHERE id = ?",
        code.hash(),
        code.prefix(),
        customer.id()
    );
    revokeSessions(customer.id());
    audit(actor, "RESET_CUSTOMER_CODE", customer.id(), "Reset customer code", ipAddress);
    Map<String, Object> response = new LinkedHashMap<>(
        customerMetadata(requireManaged(customerPublicId, actor))
    );
    response.put("customerCode", code.plainText());
    return response;
  }

  public Map<String, Object> listShipments(String customerPublicId, AuthenticatedUser actor) {
    CustomerRecord customer = requireManaged(customerPublicId, actor);
    List<Map<String, Object>> items = jdbcTemplate.query(
        shipmentBindingSelect() + " WHERE a.customer_id = ? ORDER BY a.assigned_at DESC, s.id DESC",
        this::mapBinding,
        customer.id()
    );
    return Map.of("items", items, "total", items.size());
  }

  @Transactional
  public Map<String, Object> bindShipment(
      String customerPublicId,
      CustomerShipmentBindingRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = requireManaged(customerPublicId, actor);
    ShipmentRecord shipment = resolveShipment(request);
    requireShipmentAssignmentAuthority(shipment, actor);
    jdbcTemplate.update(
        """
        INSERT INTO cp_customer_shipment_access (
          customer_id, shipment_id, relationship_role, assigned_by
        ) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          relationship_role = VALUES(relationship_role),
          assigned_by = VALUES(assigned_by),
          assigned_at = CURRENT_TIMESTAMP(6)
        """,
        customer.id(),
        shipment.id(),
        customer.partyRole(),
        actor.id()
    );
    audit(
        actor,
        "BIND_CUSTOMER_SHIPMENT",
        customer.id(),
        "Bound shipment " + shipment.publicId(),
        ipAddress
    );
    return requireBinding(customer.id(), shipment.publicId());
  }

  @Transactional
  public Map<String, Object> unbindShipment(
      String customerPublicId,
      String shipmentPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = requireManaged(customerPublicId, actor);
    ShipmentRecord shipment = requireShipment(shipmentPublicId);
    int affected = jdbcTemplate.update(
        "DELETE FROM cp_customer_shipment_access WHERE customer_id = ? AND shipment_id = ?",
        customer.id(),
        shipment.id()
    );
    if (affected == 0) throw new ApiException(HttpStatus.NOT_FOUND, "Customer shipment binding not found");
    audit(
        actor,
        "UNBIND_CUSTOMER_SHIPMENT",
        customer.id(),
        "Unbound shipment " + shipment.publicId(),
        ipAddress
    );
    return Map.of("unbound", true, "shipmentId", shipment.publicId());
  }

  private CustomerRecord requireManaged(String publicId, AuthenticatedUser actor) {
    requireManager(actor);
    List<CustomerRecord> records = actor.isAdmin()
        ? jdbcTemplate.query(baseCustomerSelect() + " WHERE c.public_id = ?", this::mapCustomer, publicId)
        : jdbcTemplate.query(
            baseCustomerSelect() + " WHERE c.public_id = ? AND c.created_by = ?",
            this::mapCustomer,
            publicId,
            actor.id()
        );
    if (records.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Customer not found");
    return records.get(0);
  }

  private ShipmentRecord resolveShipment(CustomerShipmentBindingRequest request) {
    if (request == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment binding is required");
    if (request.shipmentId() != null && !request.shipmentId().isBlank()) {
      return requireShipment(request.shipmentId());
    }
    String carrier = normalizeCode(request.carrier(), "COSCO");
    String type = normalizeCode(request.referenceType(), "BOOKING");
    if (!REFERENCE_TYPES.contains(type)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported shipment reference type");
    }
    String reference = normalizeReference(request.referenceNo());
    if (reference.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment id or reference number is required");
    }
    List<ShipmentRecord> shipments = jdbcTemplate.query(
        """
        SELECT s.id, s.public_id, s.carrier_code, s.created_by
        FROM cp_shipment_references r
        JOIN cp_shipments s ON s.id = r.shipment_id
        WHERE r.carrier_code = ? AND r.reference_type = ? AND r.reference_no_normalized = ?
        """,
        this::mapShipment,
        carrier,
        type,
        reference
    );
    if (shipments.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Tracked shipment not found");
    return shipments.get(0);
  }

  private ShipmentRecord requireShipment(String publicId) {
    List<ShipmentRecord> shipments = jdbcTemplate.query(
        "SELECT id, public_id, carrier_code, created_by FROM cp_shipments WHERE public_id = ?",
        this::mapShipment,
        publicId == null ? null : publicId.trim()
    );
    if (shipments.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Shipment not found");
    return shipments.get(0);
  }

  private Map<String, Object> requireBinding(long customerId, String shipmentPublicId) {
    List<Map<String, Object>> values = jdbcTemplate.query(
        shipmentBindingSelect() + " WHERE a.customer_id = ? AND s.public_id = ?",
        this::mapBinding,
        customerId,
        shipmentPublicId
    );
    if (values.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Customer shipment binding not found");
    return values.get(0);
  }

  private String baseCustomerSelect() {
    return """
        SELECT c.id, c.public_id, c.username, c.display_name, c.party_role, c.customer_code_prefix,
               c.status, c.created_by, c.created_at, c.updated_at,
               u.display_name AS created_by_display_name,
               (SELECT COUNT(*) FROM cp_customer_shipment_access a WHERE a.customer_id = c.id) AS shipment_count
        FROM cp_customers c
        LEFT JOIN cp_users u ON u.id = c.created_by
        """;
  }

  private String shipmentBindingSelect() {
    return """
        SELECT s.public_id AS shipment_public_id, s.carrier_code, s.tracking_status,
               a.relationship_role,
               a.assigned_at, a.assigned_by, u.display_name AS assigned_by_display_name,
               r.reference_type, r.reference_no_raw
        FROM cp_customer_shipment_access a
        JOIN cp_shipments s ON s.id = a.shipment_id
        LEFT JOIN cp_users u ON u.id = a.assigned_by
        LEFT JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id FROM cp_shipment_references r2
          WHERE r2.shipment_id = s.id
          ORDER BY r2.primary_reference DESC, r2.id ASC LIMIT 1
        )
        """;
  }

  private CustomerRecord mapCustomer(ResultSet rs, int rowNumber) throws SQLException {
    return new CustomerRecord(
        rs.getLong("id"),
        rs.getString("public_id"),
        rs.getString("username"),
        rs.getString("display_name"),
        rs.getString("party_role"),
        rs.getString("customer_code_prefix"),
        rs.getString("status"),
        nullableLong(rs, "created_by"),
        rs.getString("created_by_display_name"),
        instantString(rs, "created_at"),
        instantString(rs, "updated_at"),
        rs.getLong("shipment_count")
    );
  }

  private ShipmentRecord mapShipment(ResultSet rs, int rowNumber) throws SQLException {
    return new ShipmentRecord(
        rs.getLong("id"),
        rs.getString("public_id"),
        rs.getString("carrier_code"),
        nullableLong(rs, "created_by")
    );
  }

  private void requireShipmentAssignmentAuthority(
      ShipmentRecord shipment,
      AuthenticatedUser actor
  ) {
    if (actor.isAdmin()) return;
    if (shipment.createdBy() != null && shipment.createdBy() == actor.id()) return;
    Integer participantCount = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_participants WHERE shipment_id = ? AND user_id = ?",
        Integer.class,
        shipment.id(),
        actor.id()
    );
    if (participantCount == null || participantCount == 0) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Shipment assignment requires explicit operator access"
      );
    }
  }

  private Map<String, Object> mapBinding(ResultSet rs, int rowNumber) throws SQLException {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("shipmentId", rs.getString("shipment_public_id"));
    value.put("carrier", rs.getString("carrier_code"));
    value.put("referenceType", rs.getString("reference_type"));
    value.put("referenceNo", rs.getString("reference_no_raw"));
    value.put("trackingStatus", rs.getString("tracking_status"));
    value.put("relationshipRole", rs.getString("relationship_role"));
    value.put("assignedAt", instantString(rs, "assigned_at"));
    value.put("assignedBy", nullableLong(rs, "assigned_by"));
    value.put("assignedByDisplayName", rs.getString("assigned_by_display_name"));
    return value;
  }

  private Map<String, Object> customerMetadata(CustomerRecord record) {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("id", record.publicId());
    value.put("username", record.username());
    value.put("displayName", record.displayName());
    value.put("partyRole", record.partyRole());
    value.put("customerCodePrefix", record.codePrefix());
    value.put("status", record.status());
    value.put("createdBy", record.createdBy());
    value.put("createdByDisplayName", record.createdByDisplayName());
    value.put("createdAt", record.createdAt());
    value.put("updatedAt", record.updatedAt());
    value.put("shipmentCount", record.shipmentCount());
    return value;
  }

  private void revokeSessions(long customerId) {
    jdbcTemplate.update(
        "UPDATE cp_customer_sessions SET revoked_at = ? WHERE customer_id = ? AND revoked_at IS NULL",
        Timestamp.from(Instant.now()),
        customerId
    );
  }

  private void requireManager(AuthenticatedUser actor) {
    if (actor == null || (!actor.isBusiness() && !actor.isAdmin())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Business or administrator permission is required");
    }
  }

  private void audit(AuthenticatedUser actor, String action, long targetId, String detail, String ip) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (admin_user_id, action, target_type, target_id, detail, ip_address)
        VALUES (?, ?, 'CUSTOMER', ?, ?, ?)
        """,
        actor.id(),
        action,
        targetId,
        ClientInfo.trim(detail, 512),
        ClientInfo.trim(ip, 64)
    );
  }

  private String normalizeUsername(String value) {
    String normalized = value == null ? "" : value.trim();
    if (!normalized.matches("[A-Za-z0-9._-]{3,64}")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Customer username must contain 3-64 letters, numbers, dots, underscores, or hyphens");
    }
    return normalized;
  }

  private String normalizeDisplayName(String value) {
    String normalized = value == null ? "" : value.trim();
    if (normalized.length() < 2 || normalized.length() > 80) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Customer display name must contain 2-80 characters");
    }
    return normalized;
  }

  private String normalizeStatus(String value, String fallback) {
    String normalized = normalizeCode(value, fallback);
    if (!"ACTIVE".equals(normalized) && !"DISABLED".equals(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Customer status must be ACTIVE or DISABLED");
    }
    return normalized;
  }

  private String normalizePartyRole(String value, String fallback) {
    String normalized = normalizeCode(value, fallback);
    if (normalized == null
        || (!"AGENT".equals(normalized)
        && !"SHIPPER".equals(normalized)
        && !"CONSIGNEE".equals(normalized))) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Customer party role must be AGENT, SHIPPER, or CONSIGNEE"
      );
    }
    return normalized;
  }

  private String normalizeCode(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim().toUpperCase(Locale.ROOT);
  }

  private String normalizeReference(String value) {
    return value == null ? "" : value.trim().replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
  }

  private Long nullableLong(ResultSet rs, String column) throws SQLException {
    long value = rs.getLong(column);
    return rs.wasNull() ? null : value;
  }

  private String instantString(ResultSet rs, String column) throws SQLException {
    Timestamp value = rs.getTimestamp(column);
    return value == null ? null : value.toInstant().toString();
  }

  private record CustomerRecord(
      long id,
      String publicId,
      String username,
      String displayName,
      String partyRole,
      String codePrefix,
      String status,
      Long createdBy,
      String createdByDisplayName,
      String createdAt,
      String updatedAt,
      long shipmentCount
  ) {}

  private record ShipmentRecord(long id, String publicId, String carrier, Long createdBy) {}
}
