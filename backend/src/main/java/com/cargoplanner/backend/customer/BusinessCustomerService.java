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
  private static final List<String> CARRIERS = List.of("COSCO", "CMA");
  private static final List<String> UNIQUE_PARTY_ROLES = List.of("SHIPPER", "CONSIGNEE");

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
        ensureRoleAvailableForExistingBindings(existing.id(), partyRole);
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

  public Map<String, Object> listAvailableShipments(AuthenticatedUser actor) {
    requireManager(actor);
    String sql = availableShipmentSelect();
    List<Map<String, Object>> items = actor.isAdmin()
        ? jdbcTemplate.query(sql + " ORDER BY s.last_tracked_at DESC, s.updated_at DESC LIMIT 200", this::mapAvailableShipment)
        : jdbcTemplate.query(
            sql + " WHERE s.created_by = ? OR EXISTS ("
                + "SELECT 1 FROM cp_shipment_participants p WHERE p.shipment_id = s.id AND p.user_id = ?"
                + ") ORDER BY s.last_tracked_at DESC, s.updated_at DESC LIMIT 200",
            this::mapAvailableShipment,
            actor.id(),
            actor.id()
        );
    return Map.of("items", items, "total", items.size());
  }

  @Transactional
  public Map<String, Object> createShipment(
      CreateBusinessShipmentRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    if (request == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment is required");
    String carrier = normalizeCarrier(request.carrier());
    String referenceType = normalizeReferenceType(request.referenceType());
    String referenceNo = normalizeShipmentReference(carrier, referenceType, request.referenceNo());
    String trackingStatus = normalizeTrackingStatus(request.trackingStatus(), null);
    String note = normalizeShipmentNote(request.note(), null);
    String publicId = UUID.randomUUID().toString();
    Instant now = Instant.now();
    KeyHolder keyHolder = new GeneratedKeyHolder();
    try {
      jdbcTemplate.update(connection -> {
        PreparedStatement statement = connection.prepareStatement(
            """
            INSERT INTO cp_shipments (
              public_id, carrier_code, tracking_status, business_note, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            Statement.RETURN_GENERATED_KEYS
        );
        statement.setString(1, publicId);
        statement.setString(2, carrier);
        statement.setString(3, trackingStatus);
        statement.setString(4, note);
        statement.setLong(5, actor.id());
        statement.setTimestamp(6, Timestamp.from(now));
        statement.setTimestamp(7, Timestamp.from(now));
        return statement;
      }, keyHolder);
      Number generatedId = keyHolder.getKey();
      if (generatedId == null) throw new IllegalStateException("Shipment id was not generated");
      jdbcTemplate.update(
          """
          INSERT INTO cp_shipment_references (
            shipment_id, carrier_code, reference_type, reference_no_raw,
            reference_no_normalized, primary_reference
          ) VALUES (?, ?, ?, ?, ?, TRUE)
          """,
          generatedId.longValue(),
          carrier,
          referenceType,
          referenceNo,
          referenceNo
      );
      auditShipment(actor, "CREATE_BUSINESS_SHIPMENT", generatedId.longValue(),
          "Created shipment " + referenceNo, ipAddress);
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment reference already exists");
    }
    return requireAvailableShipment(publicId, actor);
  }

  @Transactional
  public Map<String, Object> updateShipment(
      String shipmentPublicId,
      UpdateBusinessShipmentRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    ShipmentRecord shipment = requireShipment(shipmentPublicId);
    requireShipmentAssignmentAuthority(shipment, actor);
    BusinessShipmentRecord existing = requireBusinessShipment(shipment.id());
    if (request == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment update is required");

    String referenceType = request.referenceType() == null
        ? existing.referenceType()
        : normalizeReferenceType(request.referenceType());
    String referenceNo = request.referenceNo() == null
        ? existing.referenceNo()
        : normalizeShipmentReference(shipment.carrier(), referenceType, request.referenceNo());
    boolean referenceChanged = !referenceType.equals(existing.referenceType())
        || !referenceNo.equals(normalizeReference(existing.referenceNo()));
    String trackingStatus = request.trackingStatus() == null
        ? existing.trackingStatus()
        : normalizeTrackingStatus(request.trackingStatus(), null);
    String note = request.note() == null
        ? existing.note()
        : normalizeShipmentNote(request.note(), null);
    Instant now = Instant.now();
    try {
      jdbcTemplate.update(
          """
          UPDATE cp_shipment_references
          SET reference_type = ?, reference_no_raw = ?, reference_no_normalized = ?
          WHERE id = ?
          """,
          referenceType,
          referenceNo,
          referenceNo,
          existing.referenceId()
      );
      if (referenceChanged) {
        jdbcTemplate.update(
            """
            UPDATE cp_shipments
            SET current_snapshot_id = NULL, tracking_status = ?, business_note = ?,
                last_tracked_at = NULL, fresh_until = NULL, updated_at = ?
            WHERE id = ?
            """,
            trackingStatus,
            note,
            Timestamp.from(now),
            shipment.id()
        );
      } else {
        jdbcTemplate.update(
            "UPDATE cp_shipments SET tracking_status = ?, business_note = ?, updated_at = ? WHERE id = ?",
            trackingStatus,
            note,
            Timestamp.from(now),
            shipment.id()
        );
      }
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment reference already exists");
    }
    auditShipment(actor, "UPDATE_BUSINESS_SHIPMENT", shipment.id(),
        "Updated shipment " + referenceNo, ipAddress);
    return requireAvailableShipment(shipment.publicId(), actor);
  }

  @Transactional
  public Map<String, Object> deleteShipment(
      String shipmentPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    ShipmentRecord shipment = requireShipment(shipmentPublicId);
    requireShipmentAssignmentAuthority(shipment, actor);
    Integer fileCount = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_files WHERE shipment_id = ?",
        Integer.class,
        shipment.id()
    );
    if (fileCount != null && fileCount > 0) {
      throw new ApiException(HttpStatus.CONFLICT, "Remove shipment files before deleting this shipment");
    }
    auditShipment(actor, "DELETE_BUSINESS_SHIPMENT", shipment.id(),
        "Deleted shipment " + shipment.publicId(), ipAddress);
    jdbcTemplate.update("DELETE FROM cp_shipments WHERE id = ?", shipment.id());
    return Map.of("deleted", true, "shipmentId", shipment.publicId());
  }

  @Transactional
  public Map<String, Object> updateShipmentNote(
      String shipmentPublicId,
      String note,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    ShipmentRecord shipment = requireShipment(shipmentPublicId);
    requireShipmentAssignmentAuthority(shipment, actor);
    String normalized = note == null ? "" : note.trim();
    if (normalized.length() > 2000) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment note must not exceed 2000 characters");
    }
    Instant updatedAt = Instant.now();
    jdbcTemplate.update(
        "UPDATE cp_shipments SET business_note = ?, updated_at = ? WHERE id = ?",
        normalized.isBlank() ? null : normalized,
        Timestamp.from(updatedAt),
        shipment.id()
    );
    auditShipment(actor, "UPDATE_SHIPMENT_NOTE", shipment.id(), "Updated shipment note", ipAddress);
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("shipmentId", shipment.publicId());
    value.put("note", normalized);
    value.put("updatedAt", updatedAt.toString());
    return value;
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
    lockShipment(shipment.id());
    ensureShipmentRoleAvailable(shipment.id(), customer.id(), customer.partyRole());
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

  private Map<String, Object> requireAvailableShipment(
      String shipmentPublicId,
      AuthenticatedUser actor
  ) {
    String authority = actor.isAdmin()
        ? " WHERE s.public_id = ?"
        : " WHERE s.public_id = ? AND (s.created_by = ? OR EXISTS ("
            + "SELECT 1 FROM cp_shipment_participants p WHERE p.shipment_id = s.id AND p.user_id = ?))";
    List<Map<String, Object>> values = actor.isAdmin()
        ? jdbcTemplate.query(availableShipmentSelect() + authority, this::mapAvailableShipment, shipmentPublicId)
        : jdbcTemplate.query(
            availableShipmentSelect() + authority,
            this::mapAvailableShipment,
            shipmentPublicId,
            actor.id(),
            actor.id()
        );
    if (values.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Shipment not found");
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
               s.business_note,
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
  private String availableShipmentSelect() {
    return """
        SELECT s.id, s.public_id AS shipment_public_id, s.carrier_code, s.tracking_status,
               s.business_note, s.last_tracked_at, s.updated_at,
               r.reference_type, r.reference_no_raw,
               (SELECT COUNT(*) FROM cp_customer_shipment_access a WHERE a.shipment_id = s.id) AS customer_count,
               (SELECT COUNT(*) FROM cp_customer_shipment_access a WHERE a.shipment_id = s.id AND a.relationship_role = 'SHIPPER') AS shipper_count,
               (SELECT COUNT(*) FROM cp_customer_shipment_access a WHERE a.shipment_id = s.id AND a.relationship_role = 'CONSIGNEE') AS consignee_count,
               (SELECT COUNT(*) FROM cp_customer_shipment_access a WHERE a.shipment_id = s.id AND a.relationship_role = 'AGENT') AS agent_count
        FROM cp_shipments s
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
    value.put("note", rs.getString("business_note"));
    value.put("relationshipRole", rs.getString("relationship_role"));
    value.put("assignedAt", instantString(rs, "assigned_at"));
    value.put("assignedBy", nullableLong(rs, "assigned_by"));
    value.put("assignedByDisplayName", rs.getString("assigned_by_display_name"));
    return value;
  }
  private Map<String, Object> mapAvailableShipment(ResultSet rs, int rowNumber) throws SQLException {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("shipmentId", rs.getString("shipment_public_id"));
    value.put("carrier", rs.getString("carrier_code"));
    value.put("referenceType", rs.getString("reference_type"));
    value.put("referenceNo", rs.getString("reference_no_raw"));
    value.put("trackingStatus", rs.getString("tracking_status"));
    value.put("note", rs.getString("business_note"));
    value.put("lastTrackedAt", instantString(rs, "last_tracked_at"));
    value.put("updatedAt", instantString(rs, "updated_at"));
    value.put("customerCount", rs.getLong("customer_count"));
    List<String> boundRoles = new java.util.ArrayList<>();
    if (rs.getLong("shipper_count") > 0) boundRoles.add("SHIPPER");
    if (rs.getLong("consignee_count") > 0) boundRoles.add("CONSIGNEE");
    if (rs.getLong("agent_count") > 0) boundRoles.add("AGENT");
    value.put("boundRoles", boundRoles);
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

  private void auditShipment(AuthenticatedUser actor, String action, long targetId, String detail, String ip) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (admin_user_id, action, target_type, target_id, detail, ip_address)
        VALUES (?, ?, 'SHIPMENT', ?, ?, ?)
        """,
        actor.id(),
        action,
        targetId,
        ClientInfo.trim(detail, 512),
        ClientInfo.trim(ip, 64)
    );
  }

  private void lockShipment(long shipmentId) {
    jdbcTemplate.queryForObject(
        "SELECT id FROM cp_shipments WHERE id = ? FOR UPDATE",
        Long.class,
        shipmentId
    );
  }

  private void ensureShipmentRoleAvailable(long shipmentId, long customerId, String role) {
    if (!UNIQUE_PARTY_ROLES.contains(role)) return;
    Integer conflictCount = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) FROM cp_customer_shipment_access
        WHERE shipment_id = ? AND relationship_role = ? AND customer_id <> ?
        """,
        Integer.class,
        shipmentId,
        role,
        customerId
    );
    if (conflictCount != null && conflictCount > 0) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment already has a " + role + " customer");
    }
  }

  private void ensureRoleAvailableForExistingBindings(long customerId, String role) {
    if (!UNIQUE_PARTY_ROLES.contains(role)) return;
    Integer conflictCount = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*)
        FROM cp_customer_shipment_access own_access
        JOIN cp_customer_shipment_access other_access
          ON other_access.shipment_id = own_access.shipment_id
         AND other_access.customer_id <> own_access.customer_id
         AND other_access.relationship_role = ?
        WHERE own_access.customer_id = ?
        """,
        Integer.class,
        role,
        customerId
    );
    if (conflictCount != null && conflictCount > 0) {
      throw new ApiException(HttpStatus.CONFLICT, "One or more shipments already have a " + role + " customer");
    }
  }

  private BusinessShipmentRecord requireBusinessShipment(long shipmentId) {
    List<BusinessShipmentRecord> records = jdbcTemplate.query(
        """
        SELECT s.tracking_status, s.business_note,
               r.id AS reference_id, r.reference_type, r.reference_no_raw
        FROM cp_shipments s
        JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id FROM cp_shipment_references r2
          WHERE r2.shipment_id = s.id
          ORDER BY r2.primary_reference DESC, r2.id ASC LIMIT 1
        )
        WHERE s.id = ?
        """,
        (rs, rowNumber) -> new BusinessShipmentRecord(
            rs.getLong("reference_id"),
            rs.getString("reference_type"),
            rs.getString("reference_no_raw"),
            rs.getString("tracking_status"),
            rs.getString("business_note")
        ),
        shipmentId
    );
    if (records.isEmpty()) throw new ApiException(HttpStatus.CONFLICT, "Shipment has no primary reference");
    return records.get(0);
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

  private String normalizeCarrier(String value) {
    String normalized = normalizeCode(value, "COSCO");
    if (!CARRIERS.contains(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported carrier");
    }
    return normalized;
  }

  private String normalizeReferenceType(String value) {
    String normalized = normalizeCode(value, "BILLOFLADING");
    if (!REFERENCE_TYPES.contains(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported shipment reference type");
    }
    return normalized;
  }

  private String normalizeShipmentReference(String carrier, String type, String value) {
    String normalized = normalizeReference(value);
    if ("COSCO".equals(carrier) && "BILLOFLADING".equals(type)
        && normalized.matches("COSU[0-9]{6,20}")) {
      normalized = normalized.substring(4);
    }
    if (!normalized.matches("[A-Z0-9-]{4,35}")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment number format is invalid");
    }
    return normalized;
  }

  private String normalizeTrackingStatus(String value, String fallback) {
    String normalized = value == null ? fallback : value.trim();
    if (normalized != null && normalized.length() > 80) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Tracking status must not exceed 80 characters");
    }
    return normalized == null || normalized.isBlank() ? null : normalized;
  }

  private String normalizeShipmentNote(String value, String fallback) {
    String normalized = value == null ? fallback : value.trim();
    if (normalized != null && normalized.length() > 2000) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment note must not exceed 2000 characters");
    }
    return normalized == null || normalized.isBlank() ? null : normalized;
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
  private record BusinessShipmentRecord(
      long referenceId,
      String referenceType,
      String referenceNo,
      String trackingStatus,
      String note
  ) {}
}
