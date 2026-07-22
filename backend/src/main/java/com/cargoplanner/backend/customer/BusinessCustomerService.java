package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.auth.PasswordHasher.PasswordHash;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import com.cargoplanner.backend.customer.CustomerTokenCodec.GeneratedCustomerCode;
import com.cargoplanner.backend.shipment.ShipmentBatchItemRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
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
import java.util.HexFormat;
import org.springframework.beans.factory.annotation.Autowired;
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
  private static final SecureRandom CREDENTIAL_RANDOM = new SecureRandom();
  private static final String PASSWORD_ALPHABET =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

  private final JdbcTemplate jdbcTemplate;
  private final CustomerTokenCodec tokenCodec;
  private final PasswordHasher passwordHasher;
  private final ObjectMapper objectMapper;

  @Autowired
  public BusinessCustomerService(
      JdbcTemplate jdbcTemplate,
      CustomerTokenCodec tokenCodec,
      PasswordHasher passwordHasher,
      ObjectMapper objectMapper
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.tokenCodec = tokenCodec;
    this.passwordHasher = passwordHasher;
    this.objectMapper = objectMapper;
  }

  BusinessCustomerService(
      JdbcTemplate jdbcTemplate,
      CustomerTokenCodec tokenCodec,
      PasswordHasher passwordHasher
  ) {
    this(jdbcTemplate, tokenCodec, passwordHasher, new ObjectMapper());
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
    String password = normalizePassword(request == null ? null : request.password());
    String displayName = normalizeDisplayName(
        request == null || request.displayName() == null || request.displayName().isBlank()
            ? username
            : request.displayName()
    );
    String clientCodeRaw = normalizeOptionalClientCode(request == null ? null : request.clientCode());
    final String clientCode;
    final String customerCodeHash;
    final String customerCodePrefix;
    final String customerCodeMode;
    if (clientCodeRaw != null && !clientCodeRaw.isBlank()) {
      clientCode = clientCodeRaw;
      customerCodeHash = tokenCodec.hash(clientCode);
      customerCodePrefix = clientCode.length() > 4 ? clientCode.substring(0, 4) : clientCode;
      customerCodeMode = "MANUAL";
    } else {
      GeneratedCustomerCode generated = tokenCodec.newCustomerCode();
      clientCode = generated.plainText();
      customerCodeHash = generated.hash();
      customerCodePrefix = generated.prefix();
      customerCodeMode = "RANDOM";
    }
    String partyRole = normalizePartyRole(
        request == null ? null : request.partyRole(), "CONSIGNEE"
    );
    String remarkRaw = request == null || request.remark() == null || request.remark().isBlank()
        ? null
        : request.remark().trim();
    final String remark = remarkRaw != null && remarkRaw.length() > 500
        ? remarkRaw.substring(0, 500)
        : remarkRaw;
    PasswordHash passwordHash = passwordHasher.hash(password);
    String publicId = UUID.randomUUID().toString();
    KeyHolder keyHolder = new GeneratedKeyHolder();
    try {
      jdbcTemplate.update(connection -> {
        PreparedStatement statement = connection.prepareStatement(
            """
            INSERT INTO cp_customers (
              public_id, username, display_name, client_code, party_role,
              password_salt, password_hash, password_iterations,
              customer_code_hash, customer_code_prefix, customer_code_mode,
              provisioning_source, status, remark, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'ACTIVE', ?, ?)
            """,
            Statement.RETURN_GENERATED_KEYS
        );
        statement.setString(1, publicId);
        statement.setString(2, username);
        statement.setString(3, displayName);
        statement.setString(4, clientCode);
        statement.setString(5, partyRole);
        statement.setString(6, passwordHash.salt());
        statement.setString(7, passwordHash.hash());
        statement.setInt(8, passwordHash.iterations());
        statement.setString(9, customerCodeHash);
        statement.setString(10, customerCodePrefix);
        statement.setString(11, customerCodeMode);
        statement.setString(12, remark);
        statement.setLong(13, actor.id());
        return statement;
      }, keyHolder);
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Customer username already exists");
    }
    CustomerRecord customer = requireManaged(publicId, actor);
    audit(actor, "CREATE_CUSTOMER", customer.id(), "Created customer " + username, ipAddress);
    Map<String, Object> response = new LinkedHashMap<>(customerMetadata(customer));
    response.put("customerCode", clientCode);
    return response;
  }

  public Map<String, Object> batchCreate(
      CustomerBatchImportRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    List<CustomerBatchImportItem> items = request == null || request.items() == null
        ? List.of()
        : request.items();
    if (items.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one customer row is required");
    }
    if (items.size() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A customer import cannot exceed 500 rows");
    }
    List<Map<String, Object>> results = new ArrayList<>();
    int createdCount = 0;
    for (int index = 0; index < items.size(); index++) {
      CustomerBatchImportItem item = items.get(index);
      int rowNumber = item != null && item.rowNumber() != null
          ? item.rowNumber()
          : index + 2;
      String suppliedPassword = item == null ? null : item.password();
      String password = suppliedPassword == null || suppliedPassword.isBlank()
          ? generatePassword()
          : suppliedPassword;
      String username = item == null ? null : item.username();
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("rowNumber", rowNumber);
      row.put("username", username == null ? "" : username.trim());
      try {
        Map<String, Object> created = create(
            new CreateCustomerRequest(
                username,
                password,
                username,
                "CONSIGNEE",
                null,
                null
            ),
            actor,
            ipAddress
        );
        row.put("status", "CREATED");
        row.put("customer", created);
        row.put("password", password);
        row.put("customerCode", created.get("customerCode"));
        createdCount++;
      } catch (ApiException error) {
        row.put("status", "FAILED");
        row.put("message", error.getMessage());
      }
      results.add(row);
    }
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", results);
    response.put("total", results.size());
    response.put("created", createdCount);
    response.put("failed", results.size() - createdCount);
    response.put("sourceFileName", ClientInfo.trim(
        request == null ? null : request.sourceFileName(), 255
    ));
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
    String clientCode = request == null || request.clientCode() == null
        ? existing.clientCode()
        : normalizeOptionalClientCode(request.clientCode());
    String partyRole = normalizePartyRole(
        request == null ? null : request.partyRole(), existing.partyRole()
    );
    String status = normalizeStatus(request == null ? null : request.status(), existing.status());
    String newRemark = request == null || request.remark() == null
        ? existing.remark()
        : (request.remark().isBlank() ? null : request.remark().trim());
    if (newRemark != null && newRemark.length() > 500) {
      newRemark = newRemark.substring(0, 500);
    }
    try {
      boolean codeChanged = clientCode != null && !clientCode.equals(existing.clientCode());
      if (codeChanged) {
        String codeHash = tokenCodec.hash(clientCode);
        String codePrefix = clientCode.length() > 4 ? clientCode.substring(0, 4) : clientCode;
        jdbcTemplate.update(
            """
            UPDATE cp_customers SET username = ?, display_name = ?, client_code = ?, party_role = ?, status = ?, remark = ?,
              customer_code_hash = ?, customer_code_prefix = ?, customer_code_mode = 'MANUAL'
            WHERE id = ?
            """,
            username,
            displayName,
            clientCode,
            partyRole,
            status,
            newRemark,
            codeHash,
            codePrefix,
            existing.id()
        );
      } else {
        jdbcTemplate.update(
            "UPDATE cp_customers SET username = ?, display_name = ?, client_code = ?, party_role = ?, status = ?, remark = ? WHERE id = ?",
            username,
            displayName,
            clientCode,
            partyRole,
            status,
            newRemark,
            existing.id()
        );
      }
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
        "UPDATE cp_customers SET customer_code_hash = ?, customer_code_prefix = ?, customer_code_mode = 'RANDOM' WHERE id = ?",
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

  @Transactional
  public Map<String, Object> resetPassword(
      String customerPublicId,
      UpdateCustomerPasswordRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = requireManaged(customerPublicId, actor);
    String password = normalizePassword(request == null ? null : request.password());
    PasswordHash passwordHash = passwordHasher.hash(password);
    jdbcTemplate.update(
        """
        UPDATE cp_customers
        SET password_salt = ?, password_hash = ?, password_iterations = ?
        WHERE id = ?
        """,
        passwordHash.salt(),
        passwordHash.hash(),
        passwordHash.iterations(),
        customer.id()
    );
    revokeSessions(customer.id());
    audit(actor, "RESET_CUSTOMER_PASSWORD", customer.id(), "Reset customer password", ipAddress);
    return Map.of("passwordReset", true, "id", customer.publicId());
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
    return listShipmentSnapshots(actor);
  }

  /**
   * Returns one read model per shipment that the current business user owns or participates in.
   * Snapshot provenance ({@code queried_by}) is deliberately not an authorization boundary.
   */
  public Map<String, Object> listShipmentSnapshots(AuthenticatedUser actor) {
    requireManager(actor);
    String baseSql = snapshotShipmentSelect();
    List<Map<String, Object>> items = actor.isAdmin()
        ? jdbcTemplate.query(
            baseSql + " ORDER BY COALESCE(t.fetched_at, s.updated_at) DESC, s.id DESC",
            this::mapSnapshotShipment
        )
        : jdbcTemplate.query(
            baseSql + " WHERE (s.created_by = ? OR EXISTS ("
                + "SELECT 1 FROM cp_shipment_participants p "
                + "WHERE p.shipment_id = s.id AND p.user_id = ?)) "
                + "ORDER BY COALESCE(t.fetched_at, s.updated_at) DESC, s.id DESC",
            this::mapSnapshotShipment,
            actor.id(),
            actor.id()
        );
    enrichShipmentRelations(items);
    items = deduplicateShipmentSnapshots(items);
    return Map.of("items", items, "total", items.size());
  }

  /**
   * Builds a refresh queue from shipments the current user owns or participates in. The shipment's
   * durable reference is always used; stale snapshot query identities must never
   * steer a refresh back to an obsolete or empty query.
   * Shipments whose empty equipment has already been returned are terminal and are deliberately
   * excluded.
   */
  public List<ShipmentBatchItemRequest> listUnfinishedTrackingItems(AuthenticatedUser actor) {
    requireManager(actor);
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
            AND r2.reference_type IN ('BOOKING', 'BILLOFLADING')
          ORDER BY CASE WHEN r2.reference_type = 'BOOKING' THEN 0 ELSE 1 END,
                   r2.primary_reference DESC, r2.id ASC
          LIMIT 1
        )
        WHERE s.carrier_code IN ('COSCO', 'CMA')
          AND UPPER(COALESCE(s.tracking_status, '')) <> 'EMPTY_RETURNED'
        """;
    List<RefreshableShipment> candidates = actor.isAdmin()
        ? jdbcTemplate.query(
            baseSql + " ORDER BY COALESCE(t.fetched_at, s.updated_at) DESC, s.id DESC",
            this::mapRefreshableShipment
        )
        : jdbcTemplate.query(
            baseSql + " AND (s.created_by = ? OR EXISTS ("
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
    requireManager(actor);
    List<String> shipmentIds = normalizeShipmentIds(rawShipmentIds);
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
            AND r2.reference_type IN ('BOOKING', 'BILLOFLADING')
          ORDER BY CASE WHEN r2.reference_type = 'BOOKING' THEN 0 ELSE 1 END,
                   r2.primary_reference DESC, r2.id ASC
          LIMIT 1
        )
        WHERE s.carrier_code IN ('COSCO', 'CMA')
          AND s.public_id IN (%s)
        """.formatted(placeholders);
    List<Object> parameters = new ArrayList<>(shipmentIds);
    if (!actor.isAdmin()) {
      sql += " AND (s.created_by = ? OR EXISTS ("
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
      String identity = durableReferenceIdentity(
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

  private RefreshableShipment mapRefreshableShipment(ResultSet rs, int rowNumber)
      throws SQLException {
    String normalized = rs.getString("reference_no_normalized");
    String raw = rs.getString("reference_no_raw");
    String carrier = rs.getString("carrier_code");
    String referenceType = rs.getString("reference_type");
    if ("COSCO".equalsIgnoreCase(carrier)
        && "BILLOFLADING".equalsIgnoreCase(referenceType)
        && normalized != null && normalized.matches("(?:COSU)?[0-9]{8,12}")) {
      if (normalized.startsWith("COSU")) normalized = normalized.substring(4);
      // COSCO issues this numeric identity as the booking reference before a
      // bill of lading is ready. Background refreshes must therefore query it
      // as BOOKING even when an older imported row was labelled as a bill.
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
    String creatorSql = """
        SELECT s.public_id AS shipment_public_id, u.id AS user_id, u.username,
               u.display_name, u.role AS account_role, u.party_role
        FROM cp_shipments s
        JOIN cp_users u ON u.id = s.created_by
        WHERE s.public_id IN (
        """ + placeholders + ") ORDER BY s.id";
    jdbcTemplate.query(
        creatorSql,
        (rs, rowNum) -> {
          addInternalBoundUser(internalByShipment, rs, "CREATOR");
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
        """ + placeholders + ") ORDER BY s.id, p.user_id";
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
    user.put("role", "AGENT".equalsIgnoreCase(partyRole) ? "OVERSEA_AGENT" : partyRole);
    user.put("bindingRole", bindingRole);
    user.put("accountRole", rs.getString("account_role"));
    user.put("clientCode", null);
    usersByShipment.computeIfAbsent(shipmentId, key -> new LinkedHashMap<>())
        .putIfAbsent(userId, user);
  }

  public Map<String, Object> getShipmentSnapshot(AuthenticatedUser actor, String shipmentPublicId) {
    requireManager(actor);
    String baseSql = snapshotShipmentSelect();
    List<Map<String, Object>> items = actor.isAdmin()
        ? jdbcTemplate.query(
            baseSql + " WHERE s.public_id = ? LIMIT 1",
            this::mapSnapshotShipment,
            shipmentPublicId
        )
        : jdbcTemplate.query(
            baseSql + " WHERE s.public_id = ? AND (s.created_by = ? OR EXISTS ("
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
               s.original_bill_of_lading, s.last_tracked_at, s.updated_at
        FROM cp_shipments s
        LEFT JOIN cp_tracking_snapshots t
          ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        LEFT JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id FROM cp_shipment_references r2
          WHERE r2.shipment_id = s.id
          ORDER BY CASE WHEN r2.reference_type = 'BOOKING' THEN 0 ELSE 1 END,
                   r2.primary_reference DESC, r2.id ASC LIMIT 1
        )
        """;
  }

  private Map<String, Object> mapSnapshotShipment(ResultSet rs, int rowNumber) throws SQLException {
    Map<String, Object> value = new LinkedHashMap<>();
    String shipmentPublicId = rs.getString("shipment_public_id");
    String carrier = rs.getString("carrier_code");
    String referenceType = rs.getString("query_reference_type");
    String referenceNo = rs.getString("query_reference_no");
    String trackingStatus = rs.getString("tracking_status");
    String fetchedAt = instantString(rs, "fetched_at");
    String lastTrackedAt = instantString(rs, "last_tracked_at");
    String updatedAt = instantString(rs, "updated_at");
    String snapshotJson = rs.getString("snapshot_json");

    value.put("shipmentId", shipmentPublicId);
    value.put("carrier", carrier != null ? carrier : "COSCO");
    value.put("referenceType", referenceType);
    value.put("referenceNo", referenceNo);
    value.put("trackingStatus", trackingStatus);
    value.put("note", rs.getString("business_note"));
    value.put("lastTrackedAt", lastTrackedAt != null ? lastTrackedAt : fetchedAt);
    value.put("updatedAt", updatedAt != null ? updatedAt : fetchedAt);
    value.put("customerCount", 0L);
    value.put("boundRoles", List.of());
    value.put("snapshotJson", snapshotJson);
    value.put("sourceChannel", rs.getString("source_channel"));
    value.put("forwarderJobNumber", rs.getString("job_number"));
    value.put("clientPoNumber", rs.getString("client_po_number"));
    value.put("clientNameCode", rs.getString("client_name_code"));
    value.put("originalBillOfLading", rs.getString("original_bill_of_lading"));
    value.put("dataAvailable", false);
    value.put("snapshot", null);

    if (snapshotJson != null && !snapshotJson.isBlank()) {
      try {
        JsonNode snap = objectMapper.readTree(snapshotJson);
        if (snap == null || !snap.isObject()) return value;
        value.put("dataAvailable", true);
        value.put("snapshot", snap);
        JsonNode summary = snap.path("summary");
        JsonNode keyTimes = snap.path("keyTimes");
        JsonNode references = snap.path("references");
        JsonNode businessRef = references.path("business");
        JsonNode tracking = snap.path("tracking");

        if (value.get("forwarderJobNumber") == null) {
          value.put("forwarderJobNumber", textOrNull(businessRef.path("forwarderJobNumber")));
        }
        if (value.get("clientPoNumber") == null) {
          value.put("clientPoNumber", textOrNull(businessRef.path("clientPoNumber")));
        }
        if (value.get("clientNameCode") == null) {
          value.put("clientNameCode", textOrNull(businessRef.path("clientNameCode")));
        }

        JsonNode origin = summary.path("origin");
        JsonNode destination = summary.path("destination");
        value.put("portOfLoading", textOrNull(origin.path("name")));
        value.put("portOfDischarge", textOrNull(destination.path("name")));

        value.put("vesselVoyage", textOrNull(summary.path("vesselVoyage")));
        value.put("volume", textOrNull(summary.path("volume")));
        value.put("containerType", textOrNull(summary.path("containerType")));
        value.put("trafficTerm", textOrNull(summary.path("trafficTerm")));

        value.put("estimatedDeparture", textOrNull(keyTimes.path("estimatedDeparture").path("time")));
        String estimatedArrival = textOrNull(
            keyTimes.path("estimatedFinalArrival").path("time")
        );
        if (estimatedArrival == null) {
          estimatedArrival = textOrNull(keyTimes.path("estimatedArrival").path("time"));
        }
        value.put("estimatedArrival", estimatedArrival);
        value.put("actualDeparture", textOrNull(keyTimes.path("actualDeparture").path("time")));
        value.put("actualArrival", textOrNull(keyTimes.path("actualArrival").path("time")));
        value.put("actualDelivery", textOrNull(keyTimes.path("actualDelivery").path("time")));
        value.put("estimatedDelivery", textOrNull(keyTimes.path("estimatedDelivery").path("time")));

        JsonNode latestEvent = summary.path("latestEvent");
        value.put("currentLocation", textOrNull(latestEvent.path("location")));

        value.put("masterBill", textOrNull(references.path("masterBill")));
        value.put("bookingNumber", firstTextValue(
            references.path("bookingNumbers"),
            summary.path("bookingNumbers"),
            references.path("booking")
        ));

        JsonNode containers = snap.path("containers");
        if (containers.isArray() && containers.size() > 0) {
          value.put("containerCount", containers.size());
          JsonNode firstContainer = containers.get(0);
          value.put("containerNumber", textOrNull(firstContainer.path("number")));
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
            String vessel = textOrNull(firstLeg.path("vessel"));
            String voyage = textOrNull(firstLeg.path("voyage"));
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

  private static String textOrNull(JsonNode node) {
    if (node == null || node.isNull() || !node.isTextual()) return null;
    String text = node.asText();
    return text.isBlank() ? null : text.trim();
  }

  private static String firstTextValue(JsonNode... candidates) {
    for (JsonNode candidate : candidates) {
      if (candidate == null || candidate.isNull() || candidate.isMissingNode()) continue;
      if (candidate.isArray()) {
        for (JsonNode value : candidate) {
          String text = textOrNull(value);
          if (text != null) return text;
        }
        continue;
      }
      String text = textOrNull(candidate);
      if (text != null) return text;
    }
    return null;
  }

  public Map<String, Object> listPendingClientMatches(AuthenticatedUser actor) {
    requireManager(actor);
    String base = """
        SELECT q.id, q.imported_client_code, q.match_reason, q.created_at, q.updated_at,
               s.public_id AS shipment_public_id, s.carrier_code,
               r.reference_type, r.reference_no_raw
        FROM cp_shipment_client_match_queue q
        JOIN cp_shipments s ON s.id = q.shipment_id
        LEFT JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id FROM cp_shipment_references r2
          WHERE r2.shipment_id = s.id
          ORDER BY CASE WHEN r2.reference_type = 'BOOKING' THEN 0 ELSE 1 END,
                   r2.primary_reference DESC, r2.id ASC LIMIT 1
        )
        WHERE q.match_status = 'PENDING'
        """;
    List<Map<String, Object>> items = actor.isAdmin()
        ? jdbcTemplate.query(base + " ORDER BY q.updated_at DESC LIMIT 200", this::mapClientMatch)
        : jdbcTemplate.query(
            base + " AND (q.requested_by = ? OR s.created_by = ?) ORDER BY q.updated_at DESC LIMIT 200",
            this::mapClientMatch,
            actor.id(), actor.id()
        );
    return Map.of("items", items, "total", items.size());
  }

  @Transactional
  public Map<String, Object> resolveClientMatch(
      long matchId,
      ResolveClientMatchRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    if (request == null || request.customerId() == null || request.customerId().isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Customer is required to resolve the Client Code match");
    }
    CustomerRecord customer = requireManaged(request.customerId(), actor);
    List<PendingClientMatch> matches = actor.isAdmin()
        ? jdbcTemplate.query(
            """
            SELECT q.id, q.shipment_id, s.public_id
            FROM cp_shipment_client_match_queue q
            JOIN cp_shipments s ON s.id = q.shipment_id
            WHERE q.id = ? AND q.match_status = 'PENDING'
            """,
            (rs, rowNumber) -> new PendingClientMatch(
                rs.getLong("id"), rs.getLong("shipment_id"), rs.getString("public_id")
            ),
            matchId
        )
        : jdbcTemplate.query(
            """
            SELECT q.id, q.shipment_id, s.public_id
            FROM cp_shipment_client_match_queue q
            JOIN cp_shipments s ON s.id = q.shipment_id
            WHERE q.id = ? AND q.match_status = 'PENDING'
              AND (q.requested_by = ? OR s.created_by = ?)
            """,
            (rs, rowNumber) -> new PendingClientMatch(
                rs.getLong("id"), rs.getLong("shipment_id"), rs.getString("public_id")
            ),
            matchId, actor.id(), actor.id()
        );
    if (matches.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Pending Client Code match not found");
    PendingClientMatch match = matches.get(0);
    ensureShipmentRoleAvailable(match.shipmentId(), customer.id(), customer.partyRole());
    jdbcTemplate.update(
        """
        INSERT INTO cp_customer_shipment_access (
          customer_id, shipment_id, relationship_role, publication_status, assigned_by
        ) VALUES (?, ?, ?, 'DRAFT', ?)
        ON DUPLICATE KEY UPDATE relationship_role = VALUES(relationship_role),
          publication_status = 'DRAFT', published_at = NULL, published_by = NULL,
          assigned_by = VALUES(assigned_by), assigned_at = CURRENT_TIMESTAMP(6)
        """,
        customer.id(), match.shipmentId(), customer.partyRole(), actor.id()
    );
    Instant now = Instant.now();
    jdbcTemplate.update(
        """
        UPDATE cp_shipment_client_match_queue
        SET match_status = 'RESOLVED', match_reason = 'MANUAL_BOUND',
            matched_customer_id = ?, resolved_at = ?, updated_at = ?
        WHERE id = ?
        """,
        customer.id(), Timestamp.from(now), Timestamp.from(now), matchId
    );
    audit(actor, "RESOLVE_CLIENT_CODE_MATCH", customer.id(),
        "Bound pending shipment " + match.shipmentPublicId(), ipAddress);
    return requireBinding(customer.id(), match.shipmentPublicId());
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
    assertReferenceIdentityAvailable(carrier, referenceType, referenceNo, null);
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
      persistManualSnapshot(
          generatedId.longValue(), carrier, referenceType, referenceNo,
          trackingStatus, request, now, actor
      );
      auditShipment(actor, "CREATE_BUSINESS_SHIPMENT", generatedId.longValue(),
          "Created shipment " + referenceNo, ipAddress);
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment reference already exists");
    }
    return requireAvailableShipment(publicId, actor);
  }

  private void persistManualSnapshot(
      long shipmentId,
      String carrier,
      String referenceType,
      String referenceNo,
      String requestedStatus,
      CreateBusinessShipmentRequest request,
      Instant now,
      AuthenticatedUser actor
  ) {
    lockShipment(shipmentId);
    String status = requestedStatus == null ? "Pending update" : requestedStatus;
    String jobNumber = normalizeManualField(request.forwarderJobNumber(), 160);
    String vesselVoyage = normalizeManualField(request.vesselVoyage(), 240);
    String loadingPort = normalizeManualField(request.portOfLoading(), 160);
    String dischargePort = normalizeManualField(request.portOfDischarge(), 160);
    String clientPo = normalizeManualField(request.clientPoNumber(), 160);
    String etd = normalizeManualField(request.estimatedDeparture(), 80);
    String eta = normalizeManualField(request.estimatedArrival(), 80);
    String actualDeparture = normalizeManualField(request.actualDeparture(), 80);
    String actualArrival = normalizeManualField(request.actualArrival(), 80);
    String actualDelivery = normalizeManualField(request.actualDelivery(), 80);
    String currentLocation = normalizeManualField(request.currentLocation(), 160);
    String volume = normalizeManualField(request.volume(), 80);
    String clientCode = normalizeManualField(request.clientNameCode(), 160);

    jdbcTemplate.update(
        """
        UPDATE cp_shipments
        SET job_number = COALESCE(?, job_number),
            client_po_number = COALESCE(?, client_po_number),
            client_name_code = COALESCE(?, client_name_code),
            original_bill_of_lading = COALESCE(?, original_bill_of_lading)
        WHERE id = ?
        """,
        jobNumber,
        clientPo,
        clientCode,
        "BILLOFLADING".equals(referenceType) ? referenceNo : null,
        shipmentId
    );

    ObjectNode snapshot = currentSnapshotCopy(shipmentId);
    objectField(snapshot, "provider").put("code", carrier);
    snapshot.put("channel", "MANUAL");
    snapshot.put("fetchedAt", now.toString());
    ObjectNode tracking = objectField(snapshot, "tracking");
    tracking.put("type", referenceType);
    tracking.put("number", referenceNo);
    tracking.put("status", status);
    ObjectNode summary = objectField(snapshot, "summary");
    if ("BOOKING".equals(referenceType)) {
      ArrayNode bookingNumbers = arrayField(summary, "bookingNumbers");
      boolean alreadyPresent = false;
      for (JsonNode bookingNumber : bookingNumbers) {
        if (referenceNo.equals(bookingNumber.asText())) {
          alreadyPresent = true;
          break;
        }
      }
      if (!alreadyPresent) bookingNumbers.add(referenceNo);
    }
    else summary.put("billOfLading", referenceNo);
    ObjectNode latestEvent = objectField(summary, "latestEvent");
    latestEvent.put("name", status);
    putManualField(latestEvent, "location", currentLocation);
    putManualField(latestEvent, "occurredAt", actualDelivery != null
        ? actualDelivery : actualArrival != null ? actualArrival : actualDeparture);
    if (loadingPort != null) objectField(summary, "origin").put("name", loadingPort);
    if (dischargePort != null) objectField(summary, "destination").put("name", dischargePort);
    putManualField(summary, "vesselVoyage", vesselVoyage);
    putManualField(summary, "volume", volume);

    if (vesselVoyage != null || loadingPort != null || dischargePort != null
        || etd != null || eta != null || actualDeparture != null || actualArrival != null) {
      ArrayNode routingLegs = arrayField(snapshot, "routingLegs");
      ObjectNode leg = routingLegs.size() > 0 && routingLegs.get(0).isObject()
          ? (ObjectNode) routingLegs.get(0)
          : routingLegs.insertObject(0);
      putManualField(leg, "vesselName", vesselVoyage);
      putManualField(leg, "estimatedDeparture", etd);
      putManualField(leg, "estimatedArrival", eta);
      putManualField(leg, "actualDeparture", actualDeparture);
      putManualField(leg, "actualArrival", actualArrival);
      putManualField(leg, "portOfLoading", loadingPort);
      putManualField(leg, "portOfDischarge", dischargePort);
    }
    if (etd != null || eta != null || actualDeparture != null
        || actualArrival != null || actualDelivery != null) {
      ObjectNode keyTimes = objectField(snapshot, "keyTimes");
      if (etd != null) objectField(keyTimes, "estimatedDeparture").put("time", etd);
      if (eta != null) objectField(keyTimes, "estimatedFinalArrival").put("time", eta);
      if (actualDeparture != null) objectField(keyTimes, "actualDeparture").put("time", actualDeparture);
      if (actualArrival != null) objectField(keyTimes, "actualArrival").put("time", actualArrival);
      if (actualDelivery != null) objectField(keyTimes, "actualDelivery").put("time", actualDelivery);
    }
    ArrayNode extra = arrayField(snapshot, "extraInformation");
    addManualExtra(extra, "vesselVoyage", vesselVoyage);
    addManualExtra(extra, "portOfLoading", loadingPort);
    addManualExtra(extra, "portOfDischarge", dischargePort);
    addManualExtra(extra, "estimatedDeparture", etd);
    addManualExtra(extra, "estimatedArrival", eta);
    addManualExtra(extra, "actualDeparture", actualDeparture);
    addManualExtra(extra, "actualArrival", actualArrival);
    addManualExtra(extra, "actualDelivery", actualDelivery);
    addManualExtra(extra, "currentLocation", currentLocation);
    addManualExtra(extra, "volume", volume);

    String snapshotJson;
    try {
      snapshotJson = objectMapper.writeValueAsString(snapshot);
    } catch (JsonProcessingException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize manual shipment data");
    }
    String payloadSha = sha256(snapshotJson);
    List<Long> activeSnapshotIds = jdbcTemplate.query(
        """
        SELECT id FROM cp_tracking_snapshots
        WHERE queried_by = ? AND query_reference_type = ? AND query_reference_no = ?
          AND invalidated_at IS NULL
        ORDER BY id DESC LIMIT 1 FOR UPDATE
        """,
        (rs, rowNumber) -> rs.getLong("id"),
        actor.id(), referenceType, referenceNo
    );
    long snapshotId;
    if (activeSnapshotIds.isEmpty()) {
      KeyHolder snapshotKeyHolder = new GeneratedKeyHolder();
      jdbcTemplate.update(connection -> {
        PreparedStatement statement = connection.prepareStatement(
            """
            INSERT INTO cp_tracking_snapshots (
              shipment_id, query_reference_type, query_reference_no, queried_by,
              queried_by_username, source_channel, snapshot_json, strategy_json,
              payload_sha256, fetched_at, fresh_until, created_at
            ) VALUES (?, ?, ?, ?, ?, 'MANUAL', ?, NULL, ?, ?, ?, ?)
            """,
            Statement.RETURN_GENERATED_KEYS
        );
        statement.setLong(1, shipmentId);
        statement.setString(2, referenceType);
        statement.setString(3, referenceNo);
        statement.setLong(4, actor.id());
        statement.setString(5, actor.username());
        statement.setString(6, snapshotJson);
        statement.setString(7, payloadSha);
        statement.setTimestamp(8, Timestamp.from(now));
        statement.setTimestamp(9, Timestamp.from(now));
        statement.setTimestamp(10, Timestamp.from(now));
        return statement;
      }, snapshotKeyHolder);
      Number key = snapshotKeyHolder.getKey();
      if (key == null) {
        throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save manual shipment data");
      }
      snapshotId = key.longValue();
    } else {
      snapshotId = activeSnapshotIds.get(0);
      jdbcTemplate.update(
          """
          UPDATE cp_tracking_snapshots
          SET shipment_id = ?, queried_by_username = ?, source_channel = 'MANUAL',
              snapshot_json = ?, strategy_json = NULL, payload_sha256 = ?,
              fetched_at = ?, fresh_until = ?
          WHERE id = ?
          """,
          shipmentId, actor.username(), snapshotJson, payloadSha,
          Timestamp.from(now), Timestamp.from(now), snapshotId
      );
    }
    jdbcTemplate.update(
        """
        UPDATE cp_shipments
        SET current_snapshot_id = ?, tracking_status = ?, last_tracked_at = ?,
            fresh_until = ?, updated_at = ?
        WHERE id = ?
        """,
        snapshotId, status, Timestamp.from(now), Timestamp.from(now),
        Timestamp.from(now), shipmentId
    );
    jdbcTemplate.update(
        "UPDATE cp_customer_shipment_access SET publication_status = 'DRAFT', published_at = NULL, published_by = NULL WHERE shipment_id = ?",
        shipmentId
    );
  }

  private String normalizeManualField(String value, int maxLength) {
    if (value == null) return null;
    String normalized = value.replaceAll("\\s+", " ").trim();
    if (normalized.isBlank()) return null;
    if (normalized.length() > maxLength) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Manual shipment field is too long");
    }
    return normalized;
  }

  private void putManualField(ObjectNode node, String name, String value) {
    if (value != null) node.put(name, value);
  }

  private void addManualExtra(ArrayNode values, String key, String value) {
    if (value == null) return;
    ObjectNode item = null;
    for (JsonNode existing : values) {
      if (existing.isObject() && key.equals(existing.path("key").asText())) {
        item = (ObjectNode) existing;
        break;
      }
    }
    if (item == null) item = values.addObject();
    item.put("key", key);
    item.put("value", value);
    item.put("source", "BUSINESS_MANUAL");
  }

  private ObjectNode currentSnapshotCopy(long shipmentId) {
    List<String> values = jdbcTemplate.query(
        """
        SELECT t.snapshot_json
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t
          ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        WHERE s.id = ?
        LIMIT 1
        """,
        (rs, rowNumber) -> rs.getString("snapshot_json"),
        shipmentId
    );
    if (!values.isEmpty() && values.get(0) != null && !values.get(0).isBlank()) {
      try {
        JsonNode current = objectMapper.readTree(values.get(0));
        if (current != null && current.isObject()) return ((ObjectNode) current).deepCopy();
      } catch (JsonProcessingException ignored) {
        // A malformed payload cannot be used as a safe merge base.
      }
    }
    return objectMapper.createObjectNode();
  }

  private ObjectNode objectField(ObjectNode parent, String field) {
    JsonNode current = parent.get(field);
    if (current != null && current.isObject()) return (ObjectNode) current;
    ObjectNode created = objectMapper.createObjectNode();
    parent.set(field, created);
    return created;
  }

  private ArrayNode arrayField(ObjectNode parent, String field) {
    JsonNode current = parent.get(field);
    if (current != null && current.isArray()) return (ArrayNode) current;
    ArrayNode created = objectMapper.createArrayNode();
    parent.set(field, created);
    return created;
  }

  private String sha256(String value) {
    try {
      return HexFormat.of().formatHex(
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))
      );
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 is unavailable", error);
    }
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
    if (referenceChanged) {
      assertReferenceIdentityAvailable(
          shipment.carrier(), referenceType, referenceNo, shipment.id()
      );
    }
    // Tracking status belongs to the manual/live snapshot workflow. The base shipment endpoint
    // deliberately ignores legacy trackingStatus input so the row and current snapshot cannot
    // diverge.
    String trackingStatus = existing.trackingStatus();
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
        jdbcTemplate.update(
            "UPDATE cp_customer_shipment_access SET publication_status = 'DRAFT', published_at = NULL, published_by = NULL WHERE shipment_id = ?",
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
  public Map<String, Object> updateManualSnapshot(
      String shipmentPublicId,
      CreateBusinessShipmentRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    if (request == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Manual shipment data is required");
    ShipmentRecord shipment = requireShipment(shipmentPublicId);
    requireShipmentAssignmentAuthority(shipment, actor);
    BusinessShipmentRecord existing = requireBusinessShipment(shipment.id());
    if (!hasManualSnapshotChanges(request)) {
      return requireAvailableShipment(shipment.publicId(), actor);
    }
    String status = normalizeTrackingStatus(request.trackingStatus(), existing.trackingStatus());
    Instant now = Instant.now();
    persistManualSnapshot(
        shipment.id(), shipment.carrier(), existing.referenceType(),
        normalizeReference(existing.referenceNo()), status, request, now, actor
    );
    auditShipment(actor, "UPDATE_MANUAL_SHIPMENT_SNAPSHOT", shipment.id(),
        "Updated manual shipment data " + existing.referenceNo(), ipAddress);
    return requireAvailableShipment(shipment.publicId(), actor);
  }

  private boolean hasManualSnapshotChanges(CreateBusinessShipmentRequest request) {
    return hasText(request.trackingStatus())
        || hasText(request.forwarderJobNumber())
        || hasText(request.vesselVoyage())
        || hasText(request.portOfLoading())
        || hasText(request.portOfDischarge())
        || hasText(request.clientPoNumber())
        || hasText(request.estimatedDeparture())
        || hasText(request.estimatedArrival())
        || hasText(request.actualDeparture())
        || hasText(request.actualArrival())
        || hasText(request.actualDelivery())
        || hasText(request.currentLocation())
        || hasText(request.volume())
        || hasText(request.clientNameCode());
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
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
        "SELECT COUNT(*) FROM cp_shipment_files WHERE shipment_id = ? AND status <> 'DELETED'",
        Integer.class,
        shipment.id()
    );
    if (fileCount != null && fileCount > 0) {
      throw new ApiException(HttpStatus.CONFLICT, "Remove shipment files before deleting this shipment");
    }
    auditShipment(actor, "DELETE_BUSINESS_SHIPMENT", shipment.id(),
        "Deleted shipment " + shipment.publicId(), ipAddress);
    jdbcTemplate.update(
        "DELETE FROM cp_shipment_file_audit WHERE shipment_id = ?",
        shipment.id()
    );
    jdbcTemplate.update(
        "DELETE FROM cp_shipment_files WHERE shipment_id = ? AND status = 'DELETED'",
        shipment.id()
    );
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
          customer_id, shipment_id, relationship_role, publication_status, assigned_by
        ) VALUES (?, ?, ?, 'DRAFT', ?)
        ON DUPLICATE KEY UPDATE
          relationship_role = VALUES(relationship_role),
          publication_status = 'DRAFT',
          published_at = NULL,
          published_by = NULL,
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
  public Map<String, Object> bindShipments(
      String customerPublicId,
      CustomerShipmentBatchBindingRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = requireManaged(customerPublicId, actor);
    List<String> shipmentIds = normalizeShipmentIds(
        request == null ? null : request.shipmentIds()
    );
    int bound = 0;
    int skipped = 0;
    List<String> boundShipmentIds = new ArrayList<>();
    for (String shipmentPublicId : shipmentIds) {
      ShipmentRecord shipment = requireShipment(shipmentPublicId);
      requireShipmentAssignmentAuthority(shipment, actor);
      lockShipment(shipment.id());
      Integer existing = jdbcTemplate.queryForObject(
          "SELECT COUNT(*) FROM cp_customer_shipment_access WHERE customer_id = ? AND shipment_id = ?",
          Integer.class,
          customer.id(),
          shipment.id()
      );
      if (existing != null && existing > 0) {
        skipped++;
        continue;
      }
      ensureShipmentRoleAvailable(shipment.id(), customer.id(), customer.partyRole());
      jdbcTemplate.update(
          """
          INSERT INTO cp_customer_shipment_access (
            customer_id, shipment_id, relationship_role, publication_status, assigned_by
          ) VALUES (?, ?, ?, 'DRAFT', ?)
          """,
          customer.id(), shipment.id(), customer.partyRole(), actor.id()
      );
      bound++;
      boundShipmentIds.add(shipment.publicId());
    }
    audit(
        actor,
        "BATCH_BIND_CUSTOMER_SHIPMENTS",
        customer.id(),
        "Bound " + bound + " shipments; skipped " + skipped + " existing bindings",
        ipAddress
    );
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("customerId", customer.publicId());
    response.put("requested", shipmentIds.size());
    response.put("bound", bound);
    response.put("skipped", skipped);
    response.put("shipmentIds", boundShipmentIds);
    return response;
  }

  @Transactional
  public Map<String, Object> deleteShipments(
      com.cargoplanner.backend.shipment.ShipmentBatchDeleteRequest request,
      AuthenticatedUser actor
  ) {
    requireManager(actor);
    List<String> shipmentIds = normalizeShipmentIds(
        request == null ? null : request.shipmentIds()
    );
    List<ShipmentRecord> shipmentsToDelete = new ArrayList<>();
    for (String shipmentPublicId : shipmentIds) {
      ShipmentRecord shipment = requireShipment(shipmentPublicId);
      requireShipmentAssignmentAuthority(shipment, actor);
      shipmentsToDelete.add(shipment);
    }
    for (ShipmentRecord shipment : shipmentsToDelete) {
      auditShipment(
          actor,
          "BATCH_DELETE_BUSINESS_SHIPMENT",
          shipment.id(),
          "Deleted shipment " + shipment.publicId(),
          null
      );
      // The audit table predates the cascade constraints used by shipment files.
      jdbcTemplate.update("DELETE FROM cp_shipment_file_audit WHERE shipment_id = ?", shipment.id());
      jdbcTemplate.update("DELETE FROM cp_shipments WHERE id = ?", shipment.id());
    }
    return Map.of(
        "deleted", shipmentsToDelete.size(),
        "shipmentIds", shipmentIds
    );
  }

  private List<String> normalizeShipmentIds(List<String> rawShipmentIds) {
    if (rawShipmentIds == null || rawShipmentIds.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one shipment id is required");
    }
    if (rawShipmentIds.size() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A shipment batch cannot exceed 500 items");
    }
    List<String> shipmentIds = rawShipmentIds.stream()
        .map(value -> value == null ? "" : value.trim())
        .filter(value -> !value.isBlank())
        .distinct()
        .toList();
    if (shipmentIds.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one shipment id is required");
    }
    return shipmentIds;
  }

  @Transactional
  public Map<String, Object> setShipmentPublication(
      String customerPublicId,
      String shipmentPublicId,
      ShipmentPublicationRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = requireManaged(customerPublicId, actor);
    ShipmentRecord shipment = requireShipment(shipmentPublicId);
    requireShipmentAssignmentAuthority(shipment, actor);
    boolean published = request != null && Boolean.TRUE.equals(request.published());
    requireBinding(customer.id(), shipment.publicId());
    if (published) requirePublishableSnapshot(shipment.id());
    int affected = jdbcTemplate.update(
        """
        UPDATE cp_customer_shipment_access
        SET publication_status = ?, published_at = ?, published_by = ?
        WHERE customer_id = ? AND shipment_id = ?
        """,
        published ? "PUBLISHED" : "DRAFT",
        published ? Timestamp.from(Instant.now()) : null,
        published ? actor.id() : null,
        customer.id(),
        shipment.id()
    );
    if (affected == 0) throw new ApiException(HttpStatus.NOT_FOUND, "Customer shipment binding not found");
    audit(
        actor,
        published ? "PUBLISH_CUSTOMER_SHIPMENT" : "WITHDRAW_CUSTOMER_SHIPMENT",
        customer.id(),
        (published ? "Published shipment " : "Withdrew shipment ") + shipment.publicId(),
        ipAddress
    );
    return requireBinding(customer.id(), shipment.publicId());
  }

  @Transactional
  public Map<String, Object> invalidateCurrentSnapshot(
      String shipmentPublicId,
      SnapshotInvalidationRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    ShipmentRecord shipment = requireShipment(shipmentPublicId);
    requireShipmentAssignmentAuthority(shipment, actor);
    String reason = request == null || request.reason() == null ? "" : request.reason().trim();
    if (reason.isBlank() || reason.length() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalidation reason must contain 1-500 characters");
    }
    Long snapshotId = jdbcTemplate.queryForObject(
        "SELECT current_snapshot_id FROM cp_shipments WHERE id = ?",
        Long.class,
        shipment.id()
    );
    if (snapshotId == null) throw new ApiException(HttpStatus.CONFLICT, "Shipment has no current snapshot");
    Instant now = Instant.now();
    jdbcTemplate.update(
        "UPDATE cp_tracking_snapshots SET invalidated_at = ?, invalidated_by = ?, invalidation_reason = ? WHERE id = ?",
        Timestamp.from(now), actor.id(), reason, snapshotId
    );
    jdbcTemplate.update(
        "UPDATE cp_shipments SET current_snapshot_id = NULL, tracking_status = 'Needs review', last_tracked_at = NULL, fresh_until = NULL, updated_at = ? WHERE id = ?",
        Timestamp.from(now), shipment.id()
    );
    jdbcTemplate.update(
        "UPDATE cp_customer_shipment_access SET publication_status = 'DRAFT', published_at = NULL, published_by = NULL WHERE shipment_id = ?",
        shipment.id()
    );
    auditShipment(actor, "INVALIDATE_TRACKING_SNAPSHOT", shipment.id(), reason, ipAddress);
    return Map.of(
        "shipmentId", shipment.publicId(),
        "invalidated", true,
        "snapshotId", snapshotId,
        "status", "Needs review"
    );
  }

  private void requirePublishableSnapshot(long shipmentId) {
    List<String> snapshots = jdbcTemplate.query(
        """
        SELECT t.snapshot_json
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE s.id = ? AND t.invalidated_at IS NULL
        """,
        (rs, rowNumber) -> rs.getString("snapshot_json"),
        shipmentId
    );
    if (snapshots.isEmpty() || !isPublishableSnapshot(snapshots.get(0))) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "SNAPSHOT_NOT_PUBLISHABLE",
          "Shipment has no confirmed operational data; complete the manual fields before publishing"
      );
    }
  }

  private boolean isPublishableSnapshot(String rawSnapshot) {
    if (rawSnapshot == null || rawSnapshot.isBlank()) return false;
    try {
      JsonNode snapshot = objectMapper.readTree(rawSnapshot);
      JsonNode summary = snapshot.path("summary");
      int meaningful = 0;
      if (isOperationalText(summary.path("origin").path("name").asText())) meaningful++;
      if (isOperationalText(summary.path("destination").path("name").asText())) meaningful++;
      JsonNode latest = summary.path("latestEvent");
      if (isOperationalText(latest.path("name").asText())) meaningful++;
      if (isOperationalText(latest.path("location").asText())) meaningful++;
      if (isOperationalText(latest.path("occurredAt").asText())) meaningful++;
      if (operationalTextCount(snapshot.path("routingLegs")) >= 2) meaningful += 2;
      if (operationalTextCount(snapshot.path("containers")) >= 3) meaningful += 2;
      if (snapshot.path("keyTimes").isObject() && snapshot.path("keyTimes").size() > 0) meaningful++;
      return meaningful >= 2;
    } catch (JsonProcessingException error) {
      return false;
    }
  }

  private boolean isOperationalText(String value) {
    if (value == null || value.isBlank()) return false;
    String normalized = value.trim().toLowerCase(Locale.ROOT);
    return !List.of(
        "-", "—", "–", "n/a", "na", "unknown", "unknown location",
        "暂无", "暂无动态", "暂不存在", "未知", "未知地点"
    ).contains(normalized);
  }

  private int operationalTextCount(JsonNode node) {
    if (node == null || node.isNull() || node.isMissingNode()) return 0;
    if (node.isTextual()) return isOperationalText(node.asText()) ? 1 : 0;
    if (!node.isContainerNode()) return 0;
    int count = 0;
    for (JsonNode child : node) {
      count += operationalTextCount(child);
      if (count >= 3) return count;
    }
    return count;
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
        SELECT c.id, c.public_id, c.username, c.display_name, c.client_code,
               c.party_role, c.customer_code_prefix, c.customer_code_mode,
               c.provisioning_source,
               c.status, c.remark, c.created_by, c.created_at, c.updated_at,
               u.display_name AS created_by_display_name,
               (SELECT COUNT(*) FROM cp_customer_shipment_access a WHERE a.customer_id = c.id) AS shipment_count
        FROM cp_customers c
        LEFT JOIN cp_users u ON u.id = c.created_by
        """;
  }

  private String shipmentBindingSelect() {
    return """
        SELECT s.public_id AS shipment_public_id, s.carrier_code, s.tracking_status,
               s.business_note, s.last_tracked_at, s.fresh_until, s.updated_at,
               a.relationship_role, a.publication_status, a.published_at, a.published_by,
               a.assigned_at, a.assigned_by, u.display_name AS assigned_by_display_name,
               r.reference_type, r.reference_no_raw
        FROM cp_customer_shipment_access a
        JOIN cp_shipments s ON s.id = a.shipment_id
        LEFT JOIN cp_users u ON u.id = a.assigned_by
        LEFT JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id FROM cp_shipment_references r2
          WHERE r2.shipment_id = s.id
          ORDER BY CASE WHEN r2.reference_type = 'BOOKING' THEN 0 ELSE 1 END,
                   r2.primary_reference DESC, r2.id ASC LIMIT 1
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
          ORDER BY CASE WHEN r2.reference_type = 'BOOKING' THEN 0 ELSE 1 END,
                   r2.primary_reference DESC, r2.id ASC LIMIT 1
        )
        """;
  }


  private CustomerRecord mapCustomer(ResultSet rs, int rowNumber) throws SQLException {
    return new CustomerRecord(
        rs.getLong("id"),
        rs.getString("public_id"),
        rs.getString("username"),
        rs.getString("display_name"),
        rs.getString("client_code"),
        rs.getString("party_role"),
        rs.getString("customer_code_prefix"),
        rs.getString("customer_code_mode"),
        rs.getString("provisioning_source"),
        rs.getString("status"),
        rs.getString("remark"),
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
    value.put("lastTrackedAt", instantString(rs, "last_tracked_at"));
    value.put("freshUntil", instantString(rs, "fresh_until"));
    value.put("updatedAt", instantString(rs, "updated_at"));
    value.put("relationshipRole", rs.getString("relationship_role"));
    value.put("publicationStatus", rs.getString("publication_status"));
    value.put("publishedAt", instantString(rs, "published_at"));
    value.put("publishedBy", nullableLong(rs, "published_by"));
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

  private Map<String, Object> mapClientMatch(ResultSet rs, int rowNumber) throws SQLException {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("id", rs.getLong("id"));
    value.put("clientCode", rs.getString("imported_client_code"));
    value.put("reason", rs.getString("match_reason"));
    value.put("shipmentId", rs.getString("shipment_public_id"));
    value.put("carrier", rs.getString("carrier_code"));
    value.put("referenceType", rs.getString("reference_type"));
    value.put("referenceNo", rs.getString("reference_no_raw"));
    value.put("createdAt", instantString(rs, "created_at"));
    value.put("updatedAt", instantString(rs, "updated_at"));
    return value;
  }


  private Map<String, Object> customerMetadata(CustomerRecord record) {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("id", record.publicId());
    value.put("username", record.username());
    value.put("displayName", record.displayName());
    value.put("clientCode", record.clientCode());
    value.put("partyRole", record.partyRole());
    value.put("customerCodePrefix", record.codePrefix());
    value.put("customerCodeMode", record.customerCodeMode());
    value.put("provisioningSource", record.provisioningSource());
    value.put("status", record.status());
    value.put("remark", record.remark());
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
          ORDER BY CASE WHEN r2.reference_type = 'BOOKING' THEN 0 ELSE 1 END,
                   r2.primary_reference DESC, r2.id ASC LIMIT 1
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
    if (!normalized.matches("[\\p{L}\\p{N}._-]{2,64}")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Customer name must contain 2-64 letters, numbers, dots, underscores, or hyphens");
    }
    return normalized;
  }

  private String normalizePassword(String value) {
    if (value == null || value.length() < 8 || value.length() > 128) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Customer password must contain 8-128 characters"
      );
    }
    return value;
  }

  private String normalizeDisplayName(String value) {
    String normalized = value == null ? "" : value.trim();
    if (normalized.length() < 2 || normalized.length() > 80) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Customer display name must contain 2-80 characters");
    }
    return normalized;
  }

  private String normalizeOptionalClientCode(String value) {
    if (value == null || value.isBlank()) return null;
    String normalized = value.trim().toUpperCase(Locale.ROOT);
    if (!normalized.matches("[A-Z0-9._-]{1,64}")) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Client Code must contain 1-64 letters, numbers, dots, underscores, or hyphens"
      );
    }
    return normalized;
  }

  private String generatePassword() {
    StringBuilder value = new StringBuilder("Aa1!");
    while (value.length() < 18) {
      value.append(PASSWORD_ALPHABET.charAt(CREDENTIAL_RANDOM.nextInt(PASSWORD_ALPHABET.length())));
    }
    for (int index = value.length() - 1; index > 0; index--) {
      int other = CREDENTIAL_RANDOM.nextInt(index + 1);
      char swap = value.charAt(index);
      value.setCharAt(index, value.charAt(other));
      value.setCharAt(other, swap);
    }
    return value.toString();
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

  private void assertReferenceIdentityAvailable(
      String carrier,
      String type,
      String referenceNo,
      Long excludedShipmentId
  ) {
    String normalized = normalizeReference(referenceNo);
    boolean sharedCoscoIdentity = isSharedCoscoNumericIdentity(carrier, type, normalized);
    String canonical = sharedCoscoIdentity && normalized.startsWith("COSU")
        ? normalized.substring(4)
        : normalized;
    String sql = sharedCoscoIdentity
        ? """
          SELECT COUNT(*) FROM cp_shipment_references
          WHERE carrier_code = ?
            AND reference_type IN ('BOOKING', 'BILLOFLADING')
            AND reference_no_normalized IN (?, ?)
          """
        : """
          SELECT COUNT(*) FROM cp_shipment_references
          WHERE carrier_code = ? AND reference_type = ? AND reference_no_normalized = ?
          """;
    List<Object> parameters = new ArrayList<>();
    parameters.add(carrier);
    if (sharedCoscoIdentity) {
      parameters.add(canonical);
      parameters.add("COSU" + canonical);
    } else {
      parameters.add(type);
      parameters.add(normalized);
    }
    if (excludedShipmentId != null) {
      sql += " AND shipment_id <> ?";
      parameters.add(excludedShipmentId);
    }
    Integer count = jdbcTemplate.queryForObject(sql, Integer.class, parameters.toArray());
    if (count != null && count > 0) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment reference already exists");
    }
  }

  private List<Map<String, Object>> deduplicateShipmentSnapshots(
      List<Map<String, Object>> shipments
  ) {
    Map<String, Map<String, Object>> unique = new LinkedHashMap<>();
    for (Map<String, Object> shipment : shipments) {
      String key = durableReferenceIdentity(
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

  private String durableReferenceIdentity(String carrier, String type, String referenceNo) {
    String normalizedCarrier = normalizeCode(carrier, "");
    String normalizedType = normalizeCode(type, "");
    String normalizedNumber = normalizeReference(referenceNo);
    if (isSharedCoscoNumericIdentity(normalizedCarrier, normalizedType, normalizedNumber)) {
      String canonical = normalizedNumber.startsWith("COSU")
          ? normalizedNumber.substring(4)
          : normalizedNumber;
      return normalizedCarrier + "|COSCO_NUMERIC|" + canonical;
    }
    return normalizedCarrier + "|" + normalizedType + "|" + normalizedNumber;
  }

  private boolean isSharedCoscoNumericIdentity(
      String carrier,
      String type,
      String normalizedNumber
  ) {
    return "COSCO".equals(carrier)
        && REFERENCE_TYPES.contains(type)
        && normalizeReference(normalizedNumber).matches("(?:COSU)?[0-9]{8,12}");
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
      String clientCode,
      String partyRole,
      String codePrefix,
      String customerCodeMode,
      String provisioningSource,
      String status,
      String remark,
      Long createdBy,
      String createdByDisplayName,
      String createdAt,
      String updatedAt,
      long shipmentCount
  ) {}

  private record ShipmentRecord(long id, String publicId, String carrier, Long createdBy) {}
  private record RefreshableShipment(
      String shipmentPublicId,
      String carrier,
      String referenceType,
      String referenceNo,
      String displayReferenceNo
  ) {}
  private record PendingClientMatch(long id, long shipmentId, String shipmentPublicId) {}
  private record BusinessShipmentRecord(
      long referenceId,
      String referenceType,
      String referenceNo,
      String trackingStatus,
      String note
  ) {}
}
