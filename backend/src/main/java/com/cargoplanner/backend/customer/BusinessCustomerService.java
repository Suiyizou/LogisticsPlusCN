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
    requireOperationsReader(actor);
    List<CustomerRecord> records;
    if (actor.isAdmin()) {
      records = jdbcTemplate.query(
          baseCustomerSelect()
              + " WHERE c.status = 'ACTIVE'"
              + " AND c.party_role IN ('SHIPPER', 'CONSIGNEE')"
              + " ORDER BY c.created_at DESC, c.id DESC",
          this::mapCustomer
      );
    } else if (actor.isBusiness()) {
      records = jdbcTemplate.query(
          baseCustomerSelect()
              + " WHERE c.responsible_agent_id = ?"
              + " AND c.status = 'ACTIVE'"
              + " AND c.party_role IN ('SHIPPER', 'CONSIGNEE')"
              + " ORDER BY c.created_at DESC, c.id DESC",
          this::mapCustomer,
          actor.id()
      );
    } else {
      records = jdbcTemplate.query(
          baseCustomerSelect() + """
               WHERE c.status = 'ACTIVE'
                 AND c.party_role IN ('SHIPPER', 'CONSIGNEE')
                 AND EXISTS (
                 SELECT 1 FROM cp_customer_employee_assignments employee_assignment
                 WHERE employee_assignment.customer_id = c.id
                   AND employee_assignment.employee_user_id = ?
               )
               ORDER BY c.created_at DESC, c.id DESC
              """,
          this::mapCustomer,
          actor.id()
      );
    }
    List<Map<String, Object>> items = records.stream()
        .map(record -> customerMetadataWithEmployee(record))
        .toList();
    return Map.of("items", items, "total", records.size());
  }

  public Map<String, Object> listTransferAgents(AuthenticatedUser actor) {
    requireTransferManager(actor);
    List<Map<String, Object>> agents = jdbcTemplate.query(
        """
        SELECT u.id, u.username, u.display_name, u.status,
               (SELECT COUNT(*) FROM cp_customer_employee_assignments assignment
                JOIN cp_customers linked_customer ON linked_customer.id = assignment.customer_id
                WHERE assignment.employee_user_id = u.id
                  AND linked_customer.status = 'ACTIVE'
                  AND linked_customer.party_role IN ('SHIPPER', 'CONSIGNEE')) AS linked_customer_count
        FROM cp_users u
        WHERE u.role = 'OVERSEA_AGENT' AND u.status <> 'DELETED'
        ORDER BY u.display_name, u.username, u.id
        """,
        (rs, rowNumber) -> {
          Map<String, Object> value = new LinkedHashMap<>();
          value.put("id", String.valueOf(rs.getLong("id")));
          value.put("username", rs.getString("username"));
          value.put("displayName", rs.getString("display_name"));
          value.put("status", rs.getString("status"));
          value.put("linkedCustomerCount", rs.getLong("linked_customer_count"));
          return value;
        }
    );
    return Map.of("items", agents, "total", agents.size());
  }

  public Map<String, Object> listBusinessHandoverAgents(AuthenticatedUser actor) {
    if (actor == null || (!actor.isBusiness() && !actor.isAdmin())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Business or administrator permission is required");
    }
    List<Map<String, Object>> agents = jdbcTemplate.query(
        """
        SELECT u.id, u.username, u.display_name, u.status,
               (SELECT COUNT(*) FROM cp_customers customer
                WHERE customer.responsible_agent_id = u.id
                  AND customer.status = 'ACTIVE') AS customer_count
        FROM cp_users u
        WHERE u.role = 'BUSINESS' AND u.status = 'ACTIVE'
        ORDER BY u.display_name, u.username, u.id
        """,
        (rs, rowNumber) -> {
          long userId = rs.getLong("id");
          Map<String, Object> value = new LinkedHashMap<>();
          value.put("id", userId);
          value.put("username", rs.getString("username"));
          value.put("displayName", rs.getString("display_name"));
          value.put("status", rs.getString("status"));
          value.put("customerCount", rs.getLong("customer_count"));
          value.put("current", userId == actor.id());
          return value;
        }
    );
    return Map.of(
        "items", agents,
        "total", agents.size(),
        "currentUserId", actor.id()
    );
  }

  @Transactional
  public Map<String, Object> createOverseaAgentEmployee(
      CreateOverseaAgentEmployeeRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    String username = normalizeUsername(request == null ? null : request.username());
    String displayName = normalizeDisplayName(request == null ? null : request.displayName());
    String password = request == null ? null : request.password();
    validateInternalPassword(password);
    PasswordHash passwordHash = passwordHasher.hash(password);
    try {
      jdbcTemplate.update(
          """
          INSERT INTO cp_users (
            username, display_name, role, party_role, status,
            password_salt, password_hash, password_iterations, created_by
          ) VALUES (?, ?, 'OVERSEA_AGENT', 'AGENT', 'ACTIVE', ?, ?, ?, ?)
          """,
          username,
          displayName,
          passwordHash.salt(),
          passwordHash.hash(),
          passwordHash.iterations(),
          actor.id()
      );
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Overseas agent username already exists");
    }
    Long userId = jdbcTemplate.queryForObject(
        "SELECT id FROM cp_users WHERE username = ?",
        Long.class,
        username
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (
          admin_user_id, action, target_type, target_id, detail, ip_address
        ) VALUES (?, 'CREATE_OVERSEA_AGENT', 'USER', ?, ?, ?)
        """,
        actor.id(),
        userId,
        ClientInfo.trim("Created internal overseas agent " + username, 512),
        ClientInfo.trim(ipAddress, 64)
    );
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("id", userId);
    response.put("username", username);
    response.put("displayName", displayName);
    response.put("role", "OVERSEA_AGENT");
    response.put("partyRole", "AGENT");
    response.put("status", "ACTIVE");
    return response;
  }

  @Transactional
  public Map<String, Object> batchCreateOverseaAgentEmployees(
      OverseaAgentBatchCreateRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    List<CreateOverseaAgentEmployeeRequest> requests =
        request == null || request.items() == null ? List.of() : request.items();
    if (requests.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one overseas agent is required");
    }
    if (requests.size() > 200) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At most 200 overseas agents can be created at once");
    }
    List<Map<String, Object>> items = new ArrayList<>(requests.size());
    for (CreateOverseaAgentEmployeeRequest item : requests) {
      items.add(createOverseaAgentEmployee(item, actor, ipAddress));
    }
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", items);
    response.put("total", items.size());
    response.put("atomic", true);
    return response;
  }

  @Transactional
  public Map<String, Object> updateOverseaAgent(
      long userId,
      UpdateOverseaAgentRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    Map<String, Object> existing = requireOverseaAgent(userId);
    String displayName = request == null || request.displayName() == null
        ? String.valueOf(existing.get("displayName"))
        : normalizeDisplayName(request.displayName());
    String status = request == null || request.status() == null || request.status().isBlank()
        ? String.valueOf(existing.get("status"))
        : request.status().trim().toUpperCase(Locale.ROOT);
    if (!List.of("ACTIVE", "DISABLED").contains(status)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Status must be ACTIVE or DISABLED");
    }
    String password = request == null ? null : request.password();
    if (password != null && !password.isBlank()) {
      validateInternalPassword(password);
      PasswordHash hash = passwordHasher.hash(password);
      jdbcTemplate.update(
          """
          UPDATE cp_users
          SET display_name = ?, status = ?, password_salt = ?, password_hash = ?,
              password_iterations = ?, updated_at = CURRENT_TIMESTAMP(6)
          WHERE id = ? AND role = 'OVERSEA_AGENT'
          """,
          displayName, status, hash.salt(), hash.hash(), hash.iterations(), userId
      );
      jdbcTemplate.update("DELETE FROM cp_login_devices WHERE user_id = ?", userId);
    } else {
      jdbcTemplate.update(
          "UPDATE cp_users SET display_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP(6) WHERE id = ? AND role = 'OVERSEA_AGENT'",
          displayName, status, userId
      );
      if ("DISABLED".equals(status)) {
        jdbcTemplate.update("DELETE FROM cp_login_devices WHERE user_id = ?", userId);
      }
    }
    audit(actor, "UPDATE_OVERSEA_AGENT", userId,
        "Updated overseas agent " + existing.get("username") + " (" + status + ")", ipAddress);
    return requireOverseaAgent(userId);
  }

  @Transactional
  public Map<String, Object> resetOverseaAgentPassword(
      long userId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    Map<String, Object> existing = requireOverseaAgent(userId);
    String username = String.valueOf(existing.get("username"));
    String temporaryPassword = username + "!@#2026";
    PasswordHash hash = passwordHasher.hash(temporaryPassword);
    jdbcTemplate.update(
        """
        UPDATE cp_users
        SET password_salt = ?, password_hash = ?, password_iterations = ?,
            updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ? AND role = 'OVERSEA_AGENT'
        """,
        hash.salt(), hash.hash(), hash.iterations(), userId
    );
    jdbcTemplate.update("DELETE FROM cp_login_devices WHERE user_id = ?", userId);
    audit(actor, "RESET_OVERSEA_AGENT_PASSWORD", userId,
        "Reset password for overseas agent " + username, ipAddress);
    Map<String, Object> response = new LinkedHashMap<>(requireOverseaAgent(userId));
    response.put("temporaryPassword", temporaryPassword);
    return response;
  }

  @Transactional
  public Map<String, Object> deleteOverseaAgent(
      long userId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    Map<String, Object> existing = requireOverseaAgent(userId);
    PasswordHash deletedPassword = passwordHasher.hash(UUID.randomUUID().toString());
    jdbcTemplate.update(
        """
        UPDATE cp_users
        SET username = ?, status = 'DELETED',
            password_salt = ?, password_hash = ?, password_iterations = ?,
            last_login_at = NULL, updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ? AND role = 'OVERSEA_AGENT' AND status <> 'DELETED'
        """,
        deletedUsername("agent", userId),
        deletedPassword.salt(),
        deletedPassword.hash(),
        deletedPassword.iterations(),
        userId
    );
    jdbcTemplate.update("DELETE FROM cp_login_devices WHERE user_id = ?", userId);
    jdbcTemplate.update(
        "DELETE FROM cp_customer_employee_assignments WHERE employee_user_id = ?",
        userId
    );
    jdbcTemplate.update("DELETE FROM cp_shipment_participants WHERE user_id = ?", userId);
    audit(actor, "DELETE_OVERSEA_AGENT", userId,
        "Deleted overseas agent " + existing.get("username"), ipAddress);
    return Map.of(
        "id", String.valueOf(userId),
        "username", existing.get("username"),
        "status", "DELETED",
        "deleted", true
    );
  }

  private Map<String, Object> requireOverseaAgent(long userId) {
    List<Map<String, Object>> rows = jdbcTemplate.query(
        """
        SELECT id, username, display_name, status
        FROM cp_users
        WHERE id = ? AND role = 'OVERSEA_AGENT' AND status <> 'DELETED'
        """,
        (rs, rowNumber) -> {
          Map<String, Object> value = new LinkedHashMap<>();
          value.put("id", String.valueOf(rs.getLong("id")));
          value.put("username", rs.getString("username"));
          value.put("displayName", rs.getString("display_name"));
          value.put("status", rs.getString("status"));
          return value;
        },
        userId
    );
    if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Overseas agent not found");
    return rows.get(0);
  }

  public Map<String, Object> get(String customerPublicId, AuthenticatedUser actor) {
    return customerMetadataWithEmployee(requireAccessibleCustomer(customerPublicId, actor));
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
              provisioning_source, status, remark, created_by, responsible_agent_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'ACTIVE', ?, ?, ?)
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
        statement.setLong(14, actor.id());
        return statement;
      }, keyHolder);
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Customer username or client code already exists");
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
      String displayName = item == null || item.displayName() == null || item.displayName().isBlank()
          ? username
          : item.displayName();
      String clientCode = item == null ? null : item.clientCode();
      String partyRole = item == null || item.partyRole() == null || item.partyRole().isBlank()
          ? "CONSIGNEE"
          : item.partyRole();
      String remark = item == null ? null : item.remark();
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("rowNumber", rowNumber);
      row.put("username", username == null ? "" : username.trim());
      row.put("displayName", displayName == null ? "" : displayName.trim());
      row.put("clientCode", clientCode == null ? "" : clientCode.trim().toUpperCase(Locale.ROOT));
      row.put("partyRole", partyRole);
      try {
        Map<String, Object> created = create(
            new CreateCustomerRequest(
                username,
                password,
                displayName,
                partyRole,
                clientCode,
                remark
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
    String requestedClientCode = request == null ? null : request.clientCode();
    String clientCode = requestedClientCode == null
        ? existing.clientCode()
        : requestedClientCode.trim().equalsIgnoreCase(existing.clientCode())
            ? existing.clientCode()
            : normalizeOptionalClientCode(requestedClientCode);
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
        jdbcTemplate.update(
            """
            DELETE FROM cp_oversea_agent_shipment_scopes
            WHERE oversea_agent_customer_id = ? OR represented_customer_id = ?
            """,
            existing.id(),
            existing.id()
        );
        if ("OVERSEA_AGENT".equals(partyRole)) {
          jdbcTemplate.update(
              "DELETE FROM cp_oversea_agent_customers WHERE customer_id = ?",
              existing.id()
          );
        } else {
          jdbcTemplate.update(
              "DELETE FROM cp_oversea_agent_customers WHERE oversea_agent_customer_id = ?",
              existing.id()
          );
        }
        syncOverseaAgentScopesForCustomer(existing.id());
      }
      if (codeChanged) revokeSessions(existing.id());
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Customer username or client code already exists");
    }
    if (!"ACTIVE".equals(status)) revokeSessions(existing.id());
    audit(actor, "UPDATE_CUSTOMER", existing.id(), "Updated customer " + username, ipAddress);
    return customerMetadata(requireManaged(customerPublicId, actor));
  }

  @Transactional
  public Map<String, Object> transferCustomers(
      CustomerTransferRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireTransferManager(actor);
    List<String> requestedIds = request == null || request.customerIds() == null
        ? List.of()
        : request.customerIds();
    LinkedHashSet<String> customerIds = new LinkedHashSet<>();
    for (String id : requestedIds) {
      if (id != null && !id.isBlank()) customerIds.add(id.trim());
    }
    if (customerIds.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one customer is required");
    }
    if (customerIds.size() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A customer transfer cannot exceed 500 customers");
    }
    if (request == null || request.targetAgentId() == null || request.targetAgentId().isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Target overseas agent is required");
    }
    TransferAgent target = requireTransferAgent(request.targetAgentId());
    String batchId = UUID.randomUUID().toString();

    List<CustomerTransferTarget> targets = new ArrayList<>();
    for (String customerId : customerIds.stream().sorted().toList()) {
      lockCustomer(customerId);
      CustomerRecord customer = requireTransferCustomer(customerId, actor);
      if (!UNIQUE_PARTY_ROLES.contains(customer.partyRole())) {
        throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "Only shipper or consignee customers can be transferred to an overseas agent"
        );
      }
      if (!"ACTIVE".equals(customer.status())) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Only active customers can be transferred");
      }
      List<Long> previousAgentIds = jdbcTemplate.query(
          target.internalEmployee()
              ? "SELECT employee_user_id FROM cp_customer_employee_assignments WHERE customer_id = ? FOR UPDATE"
              : "SELECT oversea_agent_customer_id FROM cp_oversea_agent_customers WHERE customer_id = ? FOR UPDATE",
          (rs, rowNumber) -> rs.getLong(1),
          customer.id()
      );
      Long previousAgentId = previousAgentIds.isEmpty() ? null : previousAgentIds.get(0);
      if (previousAgentId != null && previousAgentId == target.id()) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "Customer " + customer.displayName() + " is already assigned to the target overseas agent"
        );
      }
      List<Long> shipmentIds = jdbcTemplate.query(
          "SELECT shipment_id FROM cp_customer_shipment_access WHERE customer_id = ? ORDER BY shipment_id",
          (rs, rowNumber) -> rs.getLong(1),
          customer.id()
      );
      targets.add(new CustomerTransferTarget(customer, previousAgentId, List.copyOf(shipmentIds)));
    }

    LinkedHashSet<Long> affectedShipments = new LinkedHashSet<>();
    for (CustomerTransferTarget transfer : targets) affectedShipments.addAll(transfer.shipmentIds());

    for (CustomerTransferTarget transfer : targets) {
      CustomerRecord customer = transfer.customer();
      if (target.internalEmployee()) {
        jdbcTemplate.update(
            """
            INSERT INTO cp_customer_employee_assignments (
              customer_id, employee_user_id, assigned_by, assigned_at
            ) VALUES (?, ?, ?, CURRENT_TIMESTAMP(6))
            ON DUPLICATE KEY UPDATE
              employee_user_id = VALUES(employee_user_id),
              assigned_by = VALUES(assigned_by),
              assigned_at = VALUES(assigned_at),
              updated_at = CURRENT_TIMESTAMP(6)
            """,
            customer.id(),
            target.id(),
            actor.id()
        );
        for (Long shipmentId : transfer.shipmentIds()) {
          syncEmployeeAgentParticipant(customer.id(), shipmentId, actor.id());
          if (transfer.previousAgentId() != null
              && transfer.previousAgentId() != target.id()) {
            removeUnusedEmployeeAgentParticipant(shipmentId, transfer.previousAgentId());
          }
        }
      } else {
        jdbcTemplate.update(
            """
            INSERT INTO cp_oversea_agent_customers (
              customer_id, oversea_agent_customer_id, assigned_by, assigned_at
            ) VALUES (?, ?, ?, CURRENT_TIMESTAMP(6))
            ON DUPLICATE KEY UPDATE
              oversea_agent_customer_id = VALUES(oversea_agent_customer_id),
              assigned_by = VALUES(assigned_by),
              assigned_at = VALUES(assigned_at)
            """,
            customer.id(), target.id(), actor.id()
        );
        jdbcTemplate.update(
            """
            INSERT INTO cp_oversea_agent_customer_transfer_log (
              batch_id, customer_id, from_oversea_agent_customer_id,
              to_oversea_agent_customer_id, initiated_by, shipment_count, ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            batchId, customer.id(), transfer.previousAgentId(), target.id(), actor.id(),
            transfer.shipmentIds().size(), ClientInfo.trim(ipAddress, 64)
        );
        syncOverseaAgentScopesForCustomer(customer.id());
      }
      audit(
          actor,
          "ASSIGN_CUSTOMER_TO_OVERSEA_AGENT",
          customer.id(),
          "Batch " + batchId + ": assigned " + customer.displayName()
              + " to internal overseas agent " + target.id() + " (" + target.displayName() + ")"
              + "; global business ownership retained by user " + customer.responsibleAgentId(),
          ipAddress
      );
    }

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("batchId", batchId);
    response.put("transferred", targets.size());
    response.put("relatedShipments", affectedShipments.size());
    response.put("targetAgentId", target.publicId());
    response.put("targetAgentName", target.displayName());
    response.put("businessHistoryRetained", true);
    response.put("assignmentMode", target.internalEmployee() ? "OVERSEA_AGENT" : "LEGACY_CUSTOMER");
    return response;
  }

  @Transactional
  public Map<String, Object> handoverCustomers(
      BusinessCustomerHandoverRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    if (actor == null || !actor.isBusiness()) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Business operator permission is required for direct customer handover"
      );
    }
    LinkedHashSet<String> customerIds = new LinkedHashSet<>();
    if (request != null && request.customerIds() != null) {
      for (String customerId : request.customerIds()) {
        if (customerId != null && !customerId.isBlank()) {
          customerIds.add(customerId.trim());
        }
      }
    }
    if (customerIds.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one customer is required");
    }
    if (customerIds.size() > 200) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A customer handover cannot exceed 200 customers");
    }
    Long targetUserId = request == null ? null : request.targetBusinessUserId();
    if (targetUserId == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Target business user is required");
    }
    BusinessHandoverAgent target = requireBusinessHandoverAgent(targetUserId);
    String reason = request == null || request.reason() == null
        ? ""
        : request.reason().trim();
    if (reason.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Handover reason is required");
    }
    if (reason.length() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Handover reason cannot exceed 500 characters");
    }

    List<CustomerHandoverApplicationTarget> targets = new ArrayList<>();
    Long sourceAgentId = null;
    for (String customerId : customerIds.stream().sorted().toList()) {
      lockCustomer(customerId);
      CustomerRecord customer = requireManaged(customerId, actor);
      if (!UNIQUE_PARTY_ROLES.contains(customer.partyRole())) {
        throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "Only shipper or consignee customers can be handed over"
        );
      }
      if (!"ACTIVE".equals(customer.status())) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Only active customers can be handed over");
      }
      if (sourceAgentId == null) {
        sourceAgentId = customer.responsibleAgentId();
      } else if (sourceAgentId.longValue() != customer.responsibleAgentId()) {
        throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "All customers in one handover request must have the same current business owner"
        );
      }
      if (customer.responsibleAgentId() == target.id()) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "Customer " + customer.displayName() + " is already assigned to the target business user"
        );
      }
      jdbcTemplate.update(
          """
          UPDATE cp_customer_handover_requests
          SET status = 'REJECTED',
              review_comment = 'Superseded by direct handover workflow',
              reviewed_at = CURRENT_TIMESTAMP(6),
              updated_at = CURRENT_TIMESTAMP(6)
          WHERE status = 'PENDING'
            AND id IN (
              SELECT request_id
              FROM cp_customer_handover_request_items
              WHERE customer_id = ?
            )
          """,
          customer.id()
      );
      Integer shipmentCount = jdbcTemplate.queryForObject(
          "SELECT COUNT(*) FROM cp_customer_shipment_access WHERE customer_id = ?",
          Integer.class,
          customer.id()
      );
      targets.add(new CustomerHandoverApplicationTarget(
          customer,
          shipmentCount == null ? 0 : shipmentCount
      ));
    }
    if (sourceAgentId == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one customer is required");
    }

    String requestPublicId = UUID.randomUUID().toString();
    jdbcTemplate.update(
        """
        INSERT INTO cp_customer_handover_requests (
          public_id, status, source_agent_id, target_agent_id, requested_by,
          reason, customer_count, request_ip
        ) VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?)
        """,
        requestPublicId,
        sourceAgentId,
        target.id(),
        actor.id(),
        reason,
        targets.size(),
        ClientInfo.trim(ipAddress, 64)
    );
    Long requestId = jdbcTemplate.queryForObject(
        "SELECT id FROM cp_customer_handover_requests WHERE public_id = ?",
        Long.class,
        requestPublicId
    );
    if (requestId == null) {
      throw new IllegalStateException("Created customer handover request cannot be loaded");
    }
    for (CustomerHandoverApplicationTarget applicationTarget : targets) {
      CustomerRecord customer = applicationTarget.customer();
      jdbcTemplate.update(
          """
          INSERT INTO cp_customer_handover_request_items (
            request_id, customer_id, customer_public_id_snapshot,
            customer_display_name_snapshot, source_agent_id, shipment_count
          ) VALUES (?, ?, ?, ?, ?, ?)
          """,
          requestId,
          customer.id(),
          customer.publicId(),
          customer.displayName(),
          customer.responsibleAgentId(),
          applicationTarget.shipmentCount()
      );
    }
    String batchId = UUID.randomUUID().toString();
    int relatedShipments = 0;
    for (CustomerHandoverApplicationTarget applicationTarget : targets) {
      CustomerRecord customer = applicationTarget.customer();
      List<Long> shipmentIds = jdbcTemplate.query(
          """
          SELECT shipment_id
          FROM cp_customer_shipment_access
          WHERE customer_id = ?
          ORDER BY shipment_id
          """,
          (rs, rowNumber) -> rs.getLong(1),
          customer.id()
      );
      int updated = jdbcTemplate.update(
          """
          UPDATE cp_customers
          SET responsible_agent_id = ?
          WHERE id = ? AND responsible_agent_id = ?
          """,
          target.id(),
          customer.id(),
          customer.responsibleAgentId()
      );
      if (updated != 1) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "Customer ownership changed while the handover was being completed"
        );
      }
      for (Long shipmentId : shipmentIds) {
        grantBusinessHandoverParticipant(shipmentId, target.id(), actor.id());
      }
      jdbcTemplate.update(
          """
          INSERT INTO cp_customer_transfer_log (
            batch_id, customer_id, from_agent_id, to_agent_id, initiated_by,
            retained_previous_access, shipment_count, ip_address
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
          """,
          batchId,
          customer.id(),
          customer.responsibleAgentId(),
          target.id(),
          actor.id(),
          shipmentIds.size(),
          ClientInfo.trim(ipAddress, 64)
      );
      jdbcTemplate.update(
          """
          UPDATE cp_customer_handover_request_items
          SET shipment_count = ?, transferred_at = CURRENT_TIMESTAMP(6)
          WHERE request_id = ? AND customer_id = ?
          """,
          shipmentIds.size(),
          requestId,
          customer.id()
      );
      audit(
          actor,
          "DIRECT_CUSTOMER_HANDOVER",
          customer.id(),
          "Completed direct handover " + requestPublicId + " in batch " + batchId
              + ": transferred " + customer.displayName()
              + " from business user " + customer.responsibleAgentId()
              + " to " + target.id() + " (" + target.displayName() + ")",
          ipAddress
      );
      relatedShipments += shipmentIds.size();
    }
    int finalized = jdbcTemplate.update(
        """
        UPDATE cp_customer_handover_requests
        SET status = 'APPROVED', reviewed_by = NULL, review_comment = NULL,
            review_ip = NULL, reviewed_at = CURRENT_TIMESTAMP(6),
            approved_batch_id = ?, shipment_count = ?,
            updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ? AND status = 'PENDING'
        """,
        batchId,
        relatedShipments,
        requestId
    );
    if (finalized != 1) {
      throw new ApiException(HttpStatus.CONFLICT, "Customer handover could not be completed");
    }
    auditCustomerHandover(
        actor,
        "COMPLETE_DIRECT_CUSTOMER_HANDOVER",
        requestId,
        "Completed direct handover " + requestPublicId + " in batch " + batchId
            + " for " + targets.size()
            + " customer(s) from business user " + sourceAgentId
            + " to " + target.id() + " (" + target.displayName() + ")"
            + "; reason: " + reason,
        ipAddress
    );
    return handoverRequestMetadata(requireCustomerHandoverRequest(requestPublicId, false));
  }

  public Map<String, Object> listCustomerHandoverRequests(
      String requestedStatus,
      int requestedPage,
      int requestedSize,
      AuthenticatedUser actor
  ) {
    requireManager(actor);
    String status = normalizeHandoverStatus(requestedStatus, true);
    int page = Math.max(0, requestedPage);
    int size = Math.max(1, Math.min(100, requestedSize));
    List<Object> parameters = new ArrayList<>();
    StringBuilder where = new StringBuilder(" WHERE 1 = 1");
    if (!actor.isAdmin()) {
      where.append(
          " AND (handover_request.requested_by = ?"
              + " OR handover_request.source_agent_id = ?"
              + " OR handover_request.target_agent_id = ?)"
      );
      parameters.add(actor.id());
      parameters.add(actor.id());
      parameters.add(actor.id());
    }
    if (status != null) {
      where.append(" AND handover_request.status = ?");
      parameters.add(status);
    }
    Long total = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_customer_handover_requests handover_request" + where,
        Long.class,
        parameters.toArray()
    );
    List<Object> pageParameters = new ArrayList<>(parameters);
    pageParameters.add(size);
    pageParameters.add(page * size);
    List<CustomerHandoverRequestRecord> records = jdbcTemplate.query(
        customerHandoverRequestSelect() + where
            + " ORDER BY handover_request.created_at DESC, handover_request.id DESC"
            + " LIMIT ? OFFSET ?",
        this::mapCustomerHandoverRequest,
        pageParameters.toArray()
    );
    List<Map<String, Object>> items = records.stream()
        .map(this::handoverRequestMetadata)
        .toList();
    long totalValue = total == null ? 0 : total;
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", items);
    response.put("total", totalValue);
    response.put("page", page);
    response.put("size", size);
    response.put("totalPages", totalValue == 0 ? 0 : (totalValue + size - 1) / size);
    return response;
  }

  public Map<String, Object> getCustomerHandoverRequest(
      String requestPublicId,
      AuthenticatedUser actor
  ) {
    requireManager(actor);
    CustomerHandoverRequestRecord request =
        requireCustomerHandoverRequest(requestPublicId, false);
    requireCustomerHandoverVisibility(request, actor);
    return handoverRequestMetadata(request);
  }

  @Transactional
  public Map<String, Object> approveCustomerHandover(
      String requestPublicId,
      CustomerHandoverDecisionRequest decision,
      AuthenticatedUser admin,
      String ipAddress
  ) {
    requireAdministrator(admin);
    CustomerHandoverRequestRecord request =
        requireCustomerHandoverRequest(requestPublicId, true);
    requirePendingHandover(request);
    BusinessHandoverAgent target = requireBusinessHandoverAgent(request.targetAgentId());
    String reviewComment = normalizeReviewComment(
        decision == null ? null : decision.reviewComment(),
        false
    );
    List<CustomerHandoverApprovalTarget> lockedTargets = jdbcTemplate.query(
        """
        SELECT customer.id, customer.public_id, customer.username, customer.display_name,
               customer.client_code, customer.party_role, customer.status,
               customer.responsible_agent_id, request_item.source_agent_id
        FROM cp_customer_handover_request_items request_item
        JOIN cp_customers customer ON customer.id = request_item.customer_id
        WHERE request_item.request_id = ?
        ORDER BY customer.id
        FOR UPDATE
        """,
        (rs, rowNumber) -> new CustomerHandoverApprovalTarget(
            rs.getLong("id"),
            rs.getString("public_id"),
            rs.getString("display_name"),
            rs.getString("party_role"),
            rs.getString("status"),
            rs.getLong("responsible_agent_id"),
            rs.getLong("source_agent_id"),
            List.of()
        ),
        request.id()
    );
    List<CustomerHandoverApprovalTarget> targets = new ArrayList<>();
    for (CustomerHandoverApprovalTarget lockedTarget : lockedTargets) {
      List<Long> shipmentIds = jdbcTemplate.query(
          """
          SELECT shipment_id
          FROM cp_customer_shipment_access
          WHERE customer_id = ?
          ORDER BY shipment_id
          """,
          (rs, rowNumber) -> rs.getLong(1),
          lockedTarget.customerId()
      );
      targets.add(new CustomerHandoverApprovalTarget(
          lockedTarget.customerId(),
          lockedTarget.publicId(),
          lockedTarget.displayName(),
          lockedTarget.partyRole(),
          lockedTarget.status(),
          lockedTarget.currentAgentId(),
          lockedTarget.sourceAgentId(),
          List.copyOf(shipmentIds)
      ));
    }
    if (targets.isEmpty() || targets.size() != request.customerCount()) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "Handover customer scope is incomplete and cannot be approved"
      );
    }
    for (CustomerHandoverApprovalTarget approvalTarget : targets) {
      if (!UNIQUE_PARTY_ROLES.contains(approvalTarget.partyRole())) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "Customer " + approvalTarget.displayName() + " is no longer eligible for handover"
        );
      }
      if (!"ACTIVE".equals(approvalTarget.status())) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "Customer " + approvalTarget.displayName() + " is no longer active"
        );
      }
      if (approvalTarget.currentAgentId() != approvalTarget.sourceAgentId()
          || approvalTarget.sourceAgentId() != request.sourceAgentId()) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "Customer " + approvalTarget.displayName()
                + " changed owner after this request was submitted"
        );
      }
      if (approvalTarget.currentAgentId() == target.id()) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "Customer " + approvalTarget.displayName()
                + " is already assigned to the target business user"
        );
      }
    }

    String batchId = UUID.randomUUID().toString();
    int relatedShipments = 0;
    for (CustomerHandoverApprovalTarget approvalTarget : targets) {
      int updated = jdbcTemplate.update(
          """
          UPDATE cp_customers
          SET responsible_agent_id = ?
          WHERE id = ? AND responsible_agent_id = ?
          """,
          target.id(),
          approvalTarget.customerId(),
          approvalTarget.sourceAgentId()
      );
      if (updated != 1) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "Customer ownership changed while the handover was being approved"
        );
      }
      for (Long shipmentId : approvalTarget.shipmentIds()) {
        grantBusinessHandoverParticipant(shipmentId, target.id(), admin.id());
      }
      jdbcTemplate.update(
          """
          INSERT INTO cp_customer_transfer_log (
            batch_id, customer_id, from_agent_id, to_agent_id, initiated_by,
            retained_previous_access, shipment_count, ip_address
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
          """,
          batchId,
          approvalTarget.customerId(),
          approvalTarget.sourceAgentId(),
          target.id(),
          request.requestedBy(),
          approvalTarget.shipmentIds().size(),
          ClientInfo.trim(ipAddress, 64)
      );
      jdbcTemplate.update(
          """
          UPDATE cp_customer_handover_request_items
          SET shipment_count = ?, transferred_at = CURRENT_TIMESTAMP(6)
          WHERE request_id = ? AND customer_id = ?
          """,
          approvalTarget.shipmentIds().size(),
          request.id(),
          approvalTarget.customerId()
      );
      audit(
          admin,
          "APPROVE_CUSTOMER_HANDOVER",
          approvalTarget.customerId(),
          "Approved handover request " + request.publicId() + " in batch " + batchId
              + ": transferred " + approvalTarget.displayName()
              + " from business user " + approvalTarget.sourceAgentId()
              + " to " + target.id() + " (" + target.displayName() + ")"
              + "; requested by user " + request.requestedBy(),
          ipAddress
      );
      relatedShipments += approvalTarget.shipmentIds().size();
    }
    int finalized = jdbcTemplate.update(
        """
        UPDATE cp_customer_handover_requests
        SET status = 'APPROVED', reviewed_by = ?, review_comment = ?, review_ip = ?,
            reviewed_at = CURRENT_TIMESTAMP(6), approved_batch_id = ?,
            shipment_count = ?, updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ? AND status = 'PENDING'
        """,
        admin.id(),
        reviewComment,
        ClientInfo.trim(ipAddress, 64),
        batchId,
        relatedShipments,
        request.id()
    );
    if (finalized != 1) {
      throw new ApiException(HttpStatus.CONFLICT, "Handover request has already been reviewed");
    }
    auditCustomerHandover(
        admin,
        "APPROVE_CUSTOMER_HANDOVER_REQUEST",
        request.id(),
        "Approved handover request " + request.publicId() + " in batch " + batchId
            + " for " + targets.size() + " customer(s)",
        ipAddress
    );
    return handoverRequestMetadata(
        requireCustomerHandoverRequest(request.publicId(), false)
    );
  }

  @Transactional
  public Map<String, Object> rejectCustomerHandover(
      String requestPublicId,
      CustomerHandoverDecisionRequest decision,
      AuthenticatedUser admin,
      String ipAddress
  ) {
    requireAdministrator(admin);
    CustomerHandoverRequestRecord request =
        requireCustomerHandoverRequest(requestPublicId, true);
    requirePendingHandover(request);
    String reviewComment = normalizeReviewComment(
        decision == null ? null : decision.reviewComment(),
        true
    );
    int updated = jdbcTemplate.update(
        """
        UPDATE cp_customer_handover_requests
        SET status = 'REJECTED', reviewed_by = ?, review_comment = ?, review_ip = ?,
            reviewed_at = CURRENT_TIMESTAMP(6), updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ? AND status = 'PENDING'
        """,
        admin.id(),
        reviewComment,
        ClientInfo.trim(ipAddress, 64),
        request.id()
    );
    if (updated != 1) {
      throw new ApiException(HttpStatus.CONFLICT, "Handover request has already been reviewed");
    }
    auditCustomerHandover(
        admin,
        "REJECT_CUSTOMER_HANDOVER_REQUEST",
        request.id(),
        "Rejected handover request " + request.publicId()
            + "; review comment: " + reviewComment,
        ipAddress
    );
    return handoverRequestMetadata(
        requireCustomerHandoverRequest(request.publicId(), false)
    );
  }

  @Transactional
  public Map<String, Object> disable(
      String customerPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = requireManaged(customerPublicId, actor);
    jdbcTemplate.update(
        "UPDATE cp_customers SET status = 'DISABLED', updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
        customer.id()
    );
    revokeSessions(customer.id());
    audit(actor, "DISABLE_CUSTOMER", customer.id(), "Disabled customer " + customer.username(), ipAddress);
    return Map.of("disabled", true, "id", customer.publicId(), "status", "DISABLED");
  }

  @Transactional
  public Map<String, Object> delete(
      String customerPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = requireManaged(customerPublicId, actor);
    PasswordHash deletedPassword = passwordHasher.hash(UUID.randomUUID().toString());
    GeneratedCustomerCode deletedCode = tokenCodec.newCustomerCode();
    jdbcTemplate.update(
        """
        UPDATE cp_customers
        SET username = ?, client_code = NULL, status = 'DELETED',
            password_salt = ?, password_hash = ?, password_iterations = ?,
            customer_code_hash = ?, customer_code_prefix = ?,
            customer_code_mode = 'RANDOM', updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ? AND status <> 'DELETED'
        """,
        deletedUsername("customer", customer.id()),
        deletedPassword.salt(),
        deletedPassword.hash(),
        deletedPassword.iterations(),
        deletedCode.hash(),
        deletedCode.prefix(),
        customer.id()
    );
    revokeSessions(customer.id());
    if ("OVERSEA_AGENT".equals(customer.partyRole())) {
      jdbcTemplate.update(
          "DELETE FROM cp_oversea_agent_customers WHERE oversea_agent_customer_id = ?",
          customer.id()
      );
    }
    audit(actor, "DELETE_CUSTOMER", customer.id(), "Deleted customer " + customer.username(), ipAddress);
    return Map.of("deleted", true, "id", customer.publicId(), "username", customer.username());
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

  public Map<String, Object> listOverseaAgentCustomers(
      String overseaAgentPublicId,
      AuthenticatedUser actor
  ) {
    CustomerRecord agent = requireManaged(overseaAgentPublicId, actor);
    requireOverseaAgent(agent);
    List<Map<String, Object>> items = jdbcTemplate.query(
        """
        SELECT c.public_id, c.username, c.display_name, c.client_code, c.party_role,
               c.status, link.assigned_at
        FROM cp_oversea_agent_customers link
        JOIN cp_customers c ON c.id = link.customer_id
        WHERE link.oversea_agent_customer_id = ?
        ORDER BY c.display_name, c.id
        """,
        (rs, rowNumber) -> {
          Map<String, Object> item = new LinkedHashMap<>();
          item.put("id", rs.getString("public_id"));
          item.put("username", rs.getString("username"));
          item.put("displayName", rs.getString("display_name"));
          item.put("clientCode", rs.getString("client_code"));
          item.put("partyRole", rs.getString("party_role"));
          item.put("status", rs.getString("status"));
          item.put("assignedAt", instantString(rs, "assigned_at"));
          return item;
        },
        agent.id()
    );
    return Map.of("items", items, "total", items.size());
  }

  @Transactional
  public Map<String, Object> updateOverseaAgentCustomers(
      String overseaAgentPublicId,
      OverseaAgentCustomerLinksRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord agent = requireManaged(overseaAgentPublicId, actor);
    requireOverseaAgent(agent);
    List<String> requestedIds = request == null || request.customerIds() == null
        ? List.of()
        : request.customerIds().stream()
            .map(value -> value == null ? "" : value.trim())
            .filter(value -> !value.isBlank())
            .distinct()
            .toList();
    if (requestedIds.size() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At most 500 customers can be linked at once");
    }

    List<CustomerRecord> linkedCustomers = new ArrayList<>();
    for (String customerId : requestedIds) {
      CustomerRecord customer = requireManaged(customerId, actor);
      if (customer.id() == agent.id()) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "An overseas agent cannot link itself");
      }
      if (!UNIQUE_PARTY_ROLES.contains(customer.partyRole())) {
        throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "Only shipper or consignee customers can be linked to an overseas agent"
        );
      }
      linkedCustomers.add(customer);
    }

    LinkedHashSet<Long> affectedCustomerIds = new LinkedHashSet<>(
        jdbcTemplate.query(
            """
            SELECT customer_id
            FROM cp_oversea_agent_customers
            WHERE oversea_agent_customer_id = ?
            """,
            (rs, rowNumber) -> rs.getLong(1),
            agent.id()
        )
    );
    linkedCustomers.forEach(customer -> affectedCustomerIds.add(customer.id()));
    jdbcTemplate.update(
        "DELETE FROM cp_oversea_agent_customers WHERE oversea_agent_customer_id = ?",
        agent.id()
    );
    for (CustomerRecord customer : linkedCustomers) {
      jdbcTemplate.update(
          """
          INSERT INTO cp_oversea_agent_customers (
            customer_id, oversea_agent_customer_id, assigned_by, assigned_at
          ) VALUES (?, ?, ?, CURRENT_TIMESTAMP(6))
          ON DUPLICATE KEY UPDATE
            oversea_agent_customer_id = VALUES(oversea_agent_customer_id),
            assigned_by = VALUES(assigned_by),
            assigned_at = CURRENT_TIMESTAMP(6)
          """,
          customer.id(), agent.id(), actor.id()
      );
    }
    for (Long customerId : affectedCustomerIds) {
      syncOverseaAgentScopesForCustomer(customerId);
      revokeSessions(customerId);
    }
    revokeSessions(agent.id());
    audit(
        actor,
        "UPDATE_OVERSEA_AGENT_CUSTOMERS",
        agent.id(),
        "Linked " + linkedCustomers.size() + " customers",
        ipAddress
    );
    return listOverseaAgentCustomers(overseaAgentPublicId, actor);
  }

  private void requireOverseaAgent(CustomerRecord customer) {
    if (!"OVERSEA_AGENT".equalsIgnoreCase(customer.partyRole())) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Linked customers can only be managed for an OVERSEA_AGENT customer"
      );
    }
  }

  public Map<String, Object> listShipments(String customerPublicId, AuthenticatedUser actor) {
    CustomerRecord customer = requireAccessibleCustomer(customerPublicId, actor);
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
    requireOperationsReader(actor);
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
    requireOperationsReader(actor);
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
    ShipmentCounts shipmentCounts = shipmentCounts(baseWhere, parameters);
    long refreshIssueTotal = shipmentCounts.refreshIssues();
    if (refreshIssuesOnly) {
      filters.add("UPPER(COALESCE(s.last_refresh_result, '')) IN ('FAILED', 'PARTIAL')");
    }
    String where = filters.isEmpty() ? "" : " WHERE " + String.join(" AND ", filters);
    long total = refreshIssuesOnly ? refreshIssueTotal : shipmentCounts.total();
    int totalPages = total == 0 ? 0 : (int) ((total + pageSize - 1) / pageSize);
    if (totalPages == 0) page = 1;
    else if (page > totalPages) page = totalPages;
    int offset = (page - 1) * pageSize;

    List<Object> queryParameters = new ArrayList<>(parameters);
    queryParameters.add(pageSize);
    queryParameters.add(offset);
    List<Map<String, Object>> items = jdbcTemplate.query(
        snapshotShipmentSelect() + where
            + shipmentSnapshotOrderBy() + " LIMIT ? OFFSET ?",
        this::mapSnapshotShipment,
        queryParameters.toArray()
    );
    enrichShipmentRelations(items);

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", items);
    response.put("total", total);
    response.put("page", page);
    response.put("pageSize", pageSize);
    response.put("totalPages", totalPages);
    response.put("refreshIssueTotal", refreshIssueTotal);
    return response;
  }

  private ShipmentCounts shipmentCounts(String where, List<Object> parameters) {
    return jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) AS total_count,
               COALESCE(SUM(
                 CASE WHEN UPPER(COALESCE(s.last_refresh_result, ''))
                           IN ('FAILED', 'PARTIAL')
                      THEN 1 ELSE 0 END
               ), 0) AS refresh_issue_count
        FROM cp_shipments s
        LEFT JOIN cp_tracking_snapshots t
          ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        """ + where,
        (rs, rowNumber) -> new ShipmentCounts(
            rs.getLong("total_count"),
            rs.getLong("refresh_issue_count")
        ),
        parameters.toArray()
    );
  }

  private String businessStateSql(String state) {
    String completed =
        "UPPER(COALESCE(s.tracking_status, '')) LIKE '%EMPTY RETURNED%'";
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
            AND r2.reference_type = 'BOOKING'
          ORDER BY r2.primary_reference DESC, r2.id ASC
          LIMIT 1
        )
        WHERE s.carrier_code IN ('COSCO', 'CMA')
          AND REPLACE(UPPER(COALESCE(s.tracking_status, '')), '_', ' ')
                NOT LIKE '%EMPTY RETURNED%'
        """;
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
            AND r2.reference_type = 'BOOKING'
          ORDER BY r2.primary_reference DESC, r2.id ASC
          LIMIT 1
        )
        WHERE s.carrier_code IN ('COSCO', 'CMA')
          AND s.public_id IN (%s)
        """.formatted(placeholders);
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
    if (isSharedCoscoNumericIdentity(carrier, referenceType, normalized)) {
      normalized = normalizeReference(normalized);
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
    requireOperationsReader(actor);
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
                 WHEN UPPER(COALESCE(s.tracking_status, '')) LIKE '%EMPTY RETURNED%'
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
        """;
  }

  private String shipmentSnapshotOrderBy() {
    if (!isMySql()) {
      return " ORDER BY COALESCE(t.fetched_at, s.updated_at) DESC, s.id DESC";
    }
    String etaRaw = """
        COALESCE(
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.snapshot_json, '$.keyTimes.estimatedFinalArrival.time')), 'null'),
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.snapshot_json, '$.keyTimes.estimatedArrival.time')), 'null'),
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.snapshot_json, '$.routingLegs[0].estimatedArrival')), 'null'),
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.snapshot_json, '$.summary.estimatedArrival')), 'null')
        )
        """;
    String etaTime = "COALESCE("
        + "STR_TO_DATE(REPLACE(LEFT(" + etaRaw + ", 19), 'T', ' '), '%Y-%m-%d %H:%i:%s'), "
        + "STR_TO_DATE(LEFT(" + etaRaw + ", 10), '%Y-%m-%d')"
        + ")";
    return " ORDER BY CASE WHEN " + etaTime + " IS NULL THEN 1 ELSE 0 END, "
        + etaTime + " ASC, COALESCE(t.fetched_at, s.updated_at) DESC, s.id DESC";
  }

  private boolean isMySql() {
    try {
      return jdbcTemplate.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>) connection -> {
        String product = connection.getMetaData().getDatabaseProductName();
        return product != null && product.toLowerCase(Locale.ROOT).contains("mysql");
      });
    } catch (Exception ignored) {
      return false;
    }
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
    value.put("lastTrackedAt", lastTrackedAt);
    value.put("snapshotFetchedAt", fetchedAt);
    value.put("createdAt", instantString(rs, "shipment_created_at"));
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
    putRefreshOutcome(value, rs);
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
          value.put("forwarderJobNumber", textOrNull(businessRef.path("forwarderJobNumber")));
        }
        if (value.get("clientPoNumber") == null) {
          value.put("clientPoNumber", textOrNull(businessRef.path("clientPoNumber")));
        }
        if (value.get("clientNameCode") == null) {
          value.put("clientNameCode", textOrNull(businessRef.path("clientNameCode")));
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
            base + " AND (q.requested_by = ? OR s.responsible_agent_id = ?) ORDER BY q.updated_at DESC LIMIT 200",
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
              AND (q.requested_by = ? OR s.responsible_agent_id = ?)
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
    syncOverseaAgentScopeForShipment(customer.id(), match.shipmentId());
    syncEmployeeAgentParticipant(customer.id(), match.shipmentId(), actor.id());
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
              public_id, carrier_code, tracking_status, business_note,
              created_by, responsible_agent_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            Statement.RETURN_GENERATED_KEYS
        );
        statement.setString(1, publicId);
        statement.setString(2, carrier);
        statement.setString(3, trackingStatus);
        statement.setString(4, note);
        statement.setLong(5, actor.id());
        statement.setLong(6, actor.id());
        statement.setTimestamp(7, Timestamp.from(now));
        statement.setTimestamp(8, Timestamp.from(now));
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

  public Map<String, Object> inspectShipmentImportConflicts(
      ShipmentImportConflictCheckRequest request,
      AuthenticatedUser actor
  ) {
    requireManager(actor);
    List<CreateBusinessShipmentRequest> shipments =
        request == null || request.shipments() == null ? List.of() : request.shipments();
    if (shipments.size() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At most 500 shipments can be checked");
    }

    Set<String> checkedIdentities = new LinkedHashSet<>();
    List<Map<String, Object>> conflicts = new ArrayList<>();
    int snapshotConflictCount = 0;
    for (CreateBusinessShipmentRequest shipment : shipments) {
      if (shipment == null) continue;
      String carrier = normalizeCarrier(shipment.carrier());
      String referenceType = normalizeReferenceType(shipment.referenceType());
      String referenceNo = normalizeShipmentReference(
          carrier, referenceType, shipment.referenceNo()
      );
      String identity = durableReferenceIdentity(carrier, referenceType, referenceNo);
      if (!checkedIdentities.add(identity)) continue;

      ShipmentRecord existing = findShipmentByReference(carrier, referenceType, referenceNo);
      if (existing == null) continue;
      requireShipmentAssignmentAuthority(existing, actor);
      Integer currentSnapshotCount = jdbcTemplate.queryForObject(
          """
          SELECT COUNT(*)
          FROM cp_shipments s
          JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
          WHERE s.id = ? AND t.invalidated_at IS NULL
          """,
          Integer.class,
          existing.id()
      );
      boolean hasCurrentSnapshot =
          currentSnapshotCount != null && currentSnapshotCount > 0;
      if (hasCurrentSnapshot) snapshotConflictCount += 1;

      Map<String, Object> conflict = new LinkedHashMap<>();
      conflict.put("shipmentId", existing.publicId());
      conflict.put("carrier", carrier);
      conflict.put("referenceType", referenceType);
      conflict.put("referenceNo", referenceNo);
      conflict.put("hasCurrentSnapshot", hasCurrentSnapshot);
      conflicts.add(conflict);
    }

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("checked", checkedIdentities.size());
    response.put("existingCount", conflicts.size());
    response.put("snapshotConflictCount", snapshotConflictCount);
    response.put("conflicts", conflicts);
    return response;
  }

  @Transactional
  public Map<String, Object> createAssignedShipment(
      AssignedBusinessShipmentRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    if (request == null || request.customerId() == null || request.customerId().isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Select a customer before creating a shipment");
    }
    requireManaged(request.customerId(), actor);
    if (request.shipment() == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment is required");
    }
    CreateBusinessShipmentRequest shipmentRequest = request.shipment();
    String carrier = normalizeCarrier(shipmentRequest.carrier());
    String referenceType = normalizeReferenceType(shipmentRequest.referenceType());
    String referenceNo = normalizeShipmentReference(
        carrier, referenceType, shipmentRequest.referenceNo()
    );
    boolean overwriteExisting = Boolean.TRUE.equals(request.overwriteExisting());
    ShipmentRecord existing = overwriteExisting
        ? findShipmentByReference(carrier, referenceType, referenceNo)
        : null;
    Map<String, Object> saved;
    boolean overwritten = existing != null;
    if (overwritten) {
      requireShipmentAssignmentAuthority(existing, actor);
      String incomingNote = hasText(shipmentRequest.note()) ? shipmentRequest.note() : null;
      updateShipment(
          existing.publicId(),
          new UpdateBusinessShipmentRequest(
              null, null, null, incomingNote
          ),
          actor,
          ipAddress
      );
      updateManualSnapshot(existing.publicId(), shipmentRequest, actor, ipAddress);
      saved = requireAvailableShipment(existing.publicId(), actor);
    } else {
      saved = createShipment(shipmentRequest, actor, ipAddress);
    }
    Object rawShipmentId = saved.get("shipmentId");
    if (rawShipmentId == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Saved shipment id is unavailable");
    }
    String shipmentId = String.valueOf(rawShipmentId);
    bindShipment(
        request.customerId(),
        new CustomerShipmentBindingRequest(shipmentId, null, null, null),
        actor,
        ipAddress
    );
    boolean publish = !Boolean.FALSE.equals(request.publishToCustomer());
    if (publish) {
      setShipmentPublication(
          request.customerId(),
          shipmentId,
          new ShipmentPublicationRequest(true),
          actor,
          ipAddress
      );
    }
    Map<String, Object> response = new LinkedHashMap<>(saved);
    response.put("customerId", request.customerId());
    response.put("published", publish);
    response.put("overwritten", overwritten);
    return response;
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
    String bookingNumber = normalizeManualField(request.bookingNumber(), 160);
    String billOfLading = normalizeManualField(request.billOfLading(), 160);
    String trafficTerm = normalizeManualField(request.trafficTerm(), 80);
    String estimatedDelivery = normalizeManualField(request.estimatedDelivery(), 80);
    String latestEventName = normalizeManualField(request.latestEventName(), 160);
    String latestEventTime = normalizeManualField(request.latestEventTime(), 80);
    String latestEventLocation = normalizeManualField(request.latestEventLocation(), 160);
    List<String> serviceScopes = normalizeManualServiceScopes(request.serviceScopes());
    List<ManualRouteNodeRequest> routeNodes = normalizeManualRouteNodes(request.routeNodes());
    List<ManualRoutingLegRequest> requestedRoutingLegs =
        normalizeManualRoutingLegs(request.routingLegs());
    List<ManualContainerSummaryRequest> containerTypes =
        normalizeManualContainerTypes(request.containerTypes());
    List<ManualContainerRequest> requestedContainers =
        normalizeManualContainers(request.containers());
    validateDetailedManualSnapshot(request, routeNodes, containerTypes);

    ManualRouteNodeRequest placeOfReceipt = manualRouteNode(routeNodes, "POR");
    ManualRouteNodeRequest firstLoadingPort = manualRouteNode(routeNodes, "FPOL", "POL");
    ManualRouteNodeRequest lastDischargePort = manualRouteNode(routeNodes, "LPOD", "POD");
    ManualRouteNodeRequest finalDestination = manualRouteNode(routeNodes, "FND");
    if (firstLoadingPort != null) loadingPort = firstLoadingPort.city();
    if (lastDischargePort != null) dischargePort = lastDischargePort.city();
    if (bookingNumber == null && "BOOKING".equals(referenceType)) bookingNumber = referenceNo;
    if (billOfLading == null && "BILLOFLADING".equals(referenceType)) billOfLading = referenceNo;
    if (latestEventName == null) latestEventName = status;
    if (latestEventLocation == null) latestEventLocation = currentLocation;
    if (latestEventTime == null) {
      latestEventTime = actualDelivery != null
          ? actualDelivery
          : actualArrival != null ? actualArrival : actualDeparture;
    }

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
    if (bookingNumber != null) addUniqueManualText(arrayField(summary, "bookingNumbers"), bookingNumber);
    if (billOfLading != null) summary.put("billOfLading", billOfLading);
    ObjectNode latestEvent = objectField(summary, "latestEvent");
    latestEvent.put("name", latestEventName);
    putManualField(latestEvent, "location", latestEventLocation);
    putManualField(latestEvent, "occurredAt", latestEventTime);
    String originName = placeOfReceipt != null ? placeOfReceipt.city() : loadingPort;
    String destinationName = finalDestination != null ? finalDestination.city() : dischargePort;
    if (originName != null) objectField(summary, "origin").put("name", originName);
    if (destinationName != null) objectField(summary, "destination").put("name", destinationName);
    if (placeOfReceipt != null && placeOfReceipt.countryCode() != null) {
      objectField(summary, "origin").put("countryCode", placeOfReceipt.countryCode());
    }
    if (finalDestination != null && finalDestination.countryCode() != null) {
      objectField(summary, "destination").put("countryCode", finalDestination.countryCode());
    }
    putManualField(summary, "vesselVoyage", vesselVoyage);
    putManualField(summary, "volume", volume);
    putManualField(summary, "trafficTerm", trafficTerm);
    if (serviceScopes != null) {
      ArrayNode scopes = summary.putArray("serviceScopes");
      serviceScopes.forEach(scopes::add);
    }
    if (containerTypes != null) {
      ArrayNode containerSummary = summary.putArray("containers");
      for (ManualContainerSummaryRequest item : containerTypes) {
        ObjectNode value = containerSummary.addObject();
        value.put("containerType", item.type());
        value.put("quantity", item.quantity());
      }
    }

    ObjectNode references = objectField(snapshot, "references");
    if (bookingNumber != null) {
      addUniqueManualText(arrayField(references, "bookingNumbers"), bookingNumber);
    }
    if (billOfLading != null) references.put("masterBill", billOfLading);

    if (routeNodes != null && !routeNodes.isEmpty()) {
      ArrayNode route = snapshot.putArray("route");
      for (int index = 0; index < routeNodes.size(); index += 1) {
        ManualRouteNodeRequest item = routeNodes.get(index);
        ObjectNode node = route.addObject();
        node.put("sequence", index + 1);
        node.put("locationType", item.locationType());
        node.put("city", item.city());
        putManualField(node, "countryCode", item.countryCode());
        putManualField(node, "facilityCode", item.facilityCode());
        putManualField(node, "event", manualRouteEvent(item));
        putManualField(node, "estimatedTime", manualRouteEstimatedTime(
            item, etd, eta, estimatedDelivery
        ));
        putManualField(node, "actualTime", manualRouteActualTime(
            item, actualDeparture, actualArrival, actualDelivery
        ));
        putManualField(node, "timezone", item.timezone());
        if (latestEventLocation != null
            && latestEventLocation.equalsIgnoreCase(item.city())) {
          node.put("active", true);
        }
      }
    }

    if (requestedRoutingLegs != null && !requestedRoutingLegs.isEmpty()) {
      ArrayNode routingLegs = snapshot.putArray("routingLegs");
      for (int index = 0; index < requestedRoutingLegs.size(); index += 1) {
        ManualRoutingLegRequest item = requestedRoutingLegs.get(index);
        ObjectNode leg = routingLegs.addObject();
        leg.put("sequence", index + 1);
        putManualField(leg, "mode", item.mode());
        putManualField(leg, "vesselName", item.vesselName());
        putManualField(leg, "service", item.service());
        putManualField(leg, "voyage", item.voyage());
        putManualField(leg, "loadPort", item.loadPort());
        putManualField(leg, "loadCountryCode", item.loadCountryCode());
        putManualField(leg, "dischargePort", item.dischargePort());
        putManualField(leg, "dischargeCountryCode", item.dischargeCountryCode());
        putManualField(leg, "estimatedDeparture", item.estimatedDeparture());
        putManualField(leg, "actualDeparture", item.actualDeparture());
        putManualField(leg, "estimatedArrival", item.estimatedArrival());
        putManualField(leg, "actualArrival", item.actualArrival());
        putManualField(leg, "masterBill", item.masterBill());
      }
    } else if (vesselVoyage != null || loadingPort != null || dischargePort != null
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
      putManualField(leg, "loadPort", loadingPort);
      putManualField(leg, "dischargePort", dischargePort);
    }
    if (requestedContainers != null) {
      ArrayNode containers = snapshot.putArray("containers");
      for (ManualContainerRequest item : requestedContainers) {
        ObjectNode container = containers.addObject();
        putManualField(container, "number", item.number());
        putManualField(container, "type", item.type());
        putManualField(container, "transportMode", item.transportMode());
        putManualField(container, "trafficTerm", item.trafficTerm());
        putManualField(container, "currentLocation", item.currentLocation());
        putManualField(container, "latestEvent", item.latestEvent());
        putManualField(container, "latestEventTime", item.latestEventTime());
        container.putArray("milestones");
        container.put("detailSource", "BUSINESS_MANUAL");
      }
    }
    if (etd != null || eta != null || actualDeparture != null
        || actualArrival != null || actualDelivery != null || estimatedDelivery != null) {
      ObjectNode keyTimes = objectField(snapshot, "keyTimes");
      if (etd != null) {
        ObjectNode departure = objectField(keyTimes, "estimatedDeparture");
        departure.put("time", etd);
        if (loadingPort != null) departure.put("location", loadingPort);
      }
      if (eta != null) {
        ObjectNode arrival = objectField(keyTimes, "estimatedFinalArrival");
        arrival.put("time", eta);
        if (dischargePort != null) arrival.put("location", dischargePort);
      }
      if (actualDeparture != null) objectField(keyTimes, "actualDeparture").put("time", actualDeparture);
      if (actualArrival != null) objectField(keyTimes, "actualArrival").put("time", actualArrival);
      if (actualDelivery != null) objectField(keyTimes, "actualDelivery").put("time", actualDelivery);
      if (estimatedDelivery != null) {
        ObjectNode delivery = objectField(keyTimes, "estimatedDelivery");
        delivery.put("time", estimatedDelivery);
        if (destinationName != null) delivery.put("location", destinationName);
      }
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
    addManualExtra(extra, "trafficTerm", trafficTerm);
    addManualExtra(extra, "estimatedDelivery", estimatedDelivery);

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
        WHERE shipment_id = ? AND queried_by = ?
          AND query_reference_type = ? AND query_reference_no = ?
          AND invalidated_at IS NULL
        ORDER BY id DESC LIMIT 1 FOR UPDATE
        """,
        (rs, rowNumber) -> rs.getLong("id"),
        shipmentId, actor.id(), referenceType, referenceNo
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

  private List<String> normalizeManualServiceScopes(List<String> requested) {
    if (requested == null) return null;
    if (requested.size() > 12) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Too many shipment service types");
    }
    LinkedHashSet<String> values = new LinkedHashSet<>();
    for (String requestedValue : requested) {
      String value = normalizeManualField(requestedValue, 40);
      if (value != null) values.add(value.toUpperCase(Locale.ROOT));
    }
    return List.copyOf(values);
  }

  private void validateDetailedManualSnapshot(
      CreateBusinessShipmentRequest request,
      List<ManualRouteNodeRequest> routeNodes,
      List<ManualContainerSummaryRequest> containerTypes
  ) {
    if (request.routeNodes() != null) {
      Set<String> types = routeNodes == null
          ? Set.of()
          : routeNodes.stream()
              .map(ManualRouteNodeRequest::locationType)
              .collect(java.util.stream.Collectors.toSet());
      if (!types.containsAll(List.of("POR", "FPOL", "LPOD", "FND"))) {
        throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "Manual route must include POR, FPOL, LPOD, and FND"
        );
      }
    }
    if (request.containerTypes() != null
        && (containerTypes == null || containerTypes.isEmpty())) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "At least one container type and quantity is required"
      );
    }
  }

  private List<ManualRouteNodeRequest> normalizeManualRouteNodes(
      List<ManualRouteNodeRequest> requested
  ) {
    if (requested == null) return null;
    if (requested.size() > 20) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A manual route cannot exceed 20 nodes");
    }
    List<ManualRouteNodeRequest> values = new ArrayList<>();
    for (ManualRouteNodeRequest item : requested) {
      if (item == null) continue;
      String city = normalizeManualField(item.city(), 160);
      if (city == null) continue;
      String locationType = normalizeManualField(item.locationType(), 32);
      values.add(new ManualRouteNodeRequest(
          locationType == null ? "WAYPOINT" : locationType.toUpperCase(Locale.ROOT),
          city,
          normalizeCountryCode(item.countryCode()),
          normalizeManualField(item.facilityCode(), 160),
          normalizeManualField(item.event(), 160),
          normalizeManualField(item.estimatedTime(), 80),
          normalizeManualField(item.actualTime(), 80),
          normalizeManualField(item.timezone(), 40)
      ));
    }
    return List.copyOf(values);
  }

  private List<ManualRoutingLegRequest> normalizeManualRoutingLegs(
      List<ManualRoutingLegRequest> requested
  ) {
    if (requested == null) return null;
    if (requested.size() > 50) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A manual shipment cannot exceed 50 routing legs");
    }
    List<ManualRoutingLegRequest> values = new ArrayList<>();
    for (ManualRoutingLegRequest item : requested) {
      if (item == null) continue;
      String mode = normalizeManualField(item.mode(), 40);
      String vesselName = normalizeManualField(item.vesselName(), 160);
      String service = normalizeManualField(item.service(), 120);
      String voyage = normalizeManualField(item.voyage(), 120);
      String loadPort = normalizeManualField(item.loadPort(), 160);
      String dischargePort = normalizeManualField(item.dischargePort(), 160);
      String etd = normalizeManualField(item.estimatedDeparture(), 80);
      String atd = normalizeManualField(item.actualDeparture(), 80);
      String eta = normalizeManualField(item.estimatedArrival(), 80);
      String ata = normalizeManualField(item.actualArrival(), 80);
      String masterBill = normalizeManualField(item.masterBill(), 160);
      if (mode == null && vesselName == null && service == null && voyage == null
          && loadPort == null && dischargePort == null && etd == null && atd == null
          && eta == null && ata == null && masterBill == null) {
        continue;
      }
      values.add(new ManualRoutingLegRequest(
          mode == null ? null : mode.toUpperCase(Locale.ROOT),
          vesselName,
          service,
          voyage,
          loadPort,
          normalizeCountryCode(item.loadCountryCode()),
          dischargePort,
          normalizeCountryCode(item.dischargeCountryCode()),
          etd,
          atd,
          eta,
          ata,
          masterBill
      ));
    }
    return List.copyOf(values);
  }

  private List<ManualContainerSummaryRequest> normalizeManualContainerTypes(
      List<ManualContainerSummaryRequest> requested
  ) {
    if (requested == null) return null;
    if (requested.size() > 20) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A manual shipment cannot exceed 20 container types");
    }
    List<ManualContainerSummaryRequest> values = new ArrayList<>();
    for (ManualContainerSummaryRequest item : requested) {
      if (item == null) continue;
      String type = normalizeManualField(item.type(), 40);
      if (type == null) continue;
      int quantity = item.quantity() == null ? 1 : item.quantity();
      if (quantity < 1 || quantity > 999) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Container quantity must be between 1 and 999");
      }
      values.add(new ManualContainerSummaryRequest(
          type.toUpperCase(Locale.ROOT),
          quantity
      ));
    }
    return List.copyOf(values);
  }

  private List<ManualContainerRequest> normalizeManualContainers(
      List<ManualContainerRequest> requested
  ) {
    if (requested == null) return null;
    if (requested.size() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A manual shipment cannot exceed 500 containers");
    }
    List<ManualContainerRequest> values = new ArrayList<>();
    for (ManualContainerRequest item : requested) {
      if (item == null) continue;
      String number = normalizeManualField(item.number(), 40);
      String type = normalizeManualField(item.type(), 40);
      String mode = normalizeManualField(item.transportMode(), 40);
      String terms = normalizeManualField(item.trafficTerm(), 80);
      String location = normalizeManualField(item.currentLocation(), 160);
      String latestEvent = normalizeManualField(item.latestEvent(), 160);
      String latestEventTime = normalizeManualField(item.latestEventTime(), 80);
      if (number == null && type == null && mode == null && terms == null
          && location == null && latestEvent == null && latestEventTime == null) {
        continue;
      }
      values.add(new ManualContainerRequest(
          number == null ? null : number.toUpperCase(Locale.ROOT),
          type == null ? null : type.toUpperCase(Locale.ROOT),
          mode == null ? null : mode.toUpperCase(Locale.ROOT),
          terms,
          location,
          latestEvent,
          latestEventTime
      ));
    }
    return List.copyOf(values);
  }

  private String normalizeCountryCode(String value) {
    String normalized = normalizeManualField(value, 2);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private ManualRouteNodeRequest manualRouteNode(
      List<ManualRouteNodeRequest> nodes,
      String... locationTypes
  ) {
    if (nodes == null || nodes.isEmpty()) return null;
    Set<String> expected = Set.of(locationTypes);
    return nodes.stream()
        .filter(node -> expected.contains(node.locationType()))
        .findFirst()
        .orElse(null);
  }

  private String manualRouteEvent(ManualRouteNodeRequest node) {
    if (node.event() != null) return node.event();
    return switch (node.locationType()) {
      case "POR" -> "Place of Receipt";
      case "FPOL", "POL" -> "Estimated Time of Departure";
      case "LPOD", "POD" -> "Estimated Time of Arrival";
      case "FND" -> "Cargo Pickup Estimated Time";
      default -> "Transshipment";
    };
  }

  private String manualRouteEstimatedTime(
      ManualRouteNodeRequest node,
      String estimatedDeparture,
      String estimatedArrival,
      String estimatedDelivery
  ) {
    if (node.estimatedTime() != null) return node.estimatedTime();
    return switch (node.locationType()) {
      case "FPOL", "POL" -> estimatedDeparture;
      case "LPOD", "POD" -> estimatedArrival;
      case "FND" -> estimatedDelivery;
      default -> null;
    };
  }

  private String manualRouteActualTime(
      ManualRouteNodeRequest node,
      String actualDeparture,
      String actualArrival,
      String actualDelivery
  ) {
    if (node.actualTime() != null) return node.actualTime();
    return switch (node.locationType()) {
      case "FPOL", "POL" -> actualDeparture;
      case "LPOD", "POD" -> actualArrival;
      case "FND" -> actualDelivery;
      default -> null;
    };
  }

  private void addUniqueManualText(ArrayNode values, String value) {
    if (value == null) return;
    for (JsonNode existing : values) {
      if (value.equalsIgnoreCase(existing.asText())) return;
    }
    values.add(value);
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

  /**
   * Updates the three operator-owned card fields without touching the carrier snapshot. All
   * targets are authorized and normalized before the first write so the batch is transactional.
   */
  @Transactional
  public Map<String, Object> updateShipmentBusinessFields(
      ShipmentBusinessFieldsBatchUpdateRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    List<ShipmentBusinessFieldsUpdateItem> requested = request == null
        ? null
        : request.items();
    if (requested == null || requested.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one shipment is required");
    }
    if (requested.size() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A shipment batch cannot exceed 500 rows");
    }

    List<ShipmentBusinessFieldsTarget> targets = new ArrayList<>();
    Set<String> shipmentIds = new LinkedHashSet<>();
    for (ShipmentBusinessFieldsUpdateItem item : requested) {
      String shipmentPublicId = item == null || item.shipmentId() == null
          ? ""
          : item.shipmentId().trim();
      if (shipmentPublicId.isBlank() || !shipmentIds.add(shipmentPublicId)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment ids must be present and unique");
      }
      ShipmentRecord shipment = requireShipment(shipmentPublicId);
      requireShipmentAssignmentAuthority(shipment, actor);
      targets.add(new ShipmentBusinessFieldsTarget(
          shipment,
          normalizeManualField(item.forwarderJobNumber(), 160),
          normalizeManualField(item.clientPoNumber(), 160),
          normalizeManualField(item.clientNameCode(), 160)
      ));
    }

    Instant now = Instant.now();
    for (ShipmentBusinessFieldsTarget target : targets) {
      lockShipment(target.shipment().id());
      jdbcTemplate.update(
          """
          UPDATE cp_shipments
          SET job_number = ?, client_po_number = ?, client_name_code = ?, updated_at = ?
          WHERE id = ?
          """,
          target.jobNumber(),
          target.clientPoNumber(),
          target.clientNameCode(),
          Timestamp.from(now),
          target.shipment().id()
      );
      auditShipment(
          actor,
          "BATCH_UPDATE_SHIPMENT_BUSINESS_FIELDS",
          target.shipment().id(),
          "Updated operator-owned business fields for " + target.shipment().publicId(),
          ipAddress
      );
    }
    return Map.of(
        "updated", targets.size(),
        "shipmentIds", List.copyOf(shipmentIds)
    );
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
        || hasText(request.clientNameCode())
        || hasText(request.bookingNumber())
        || hasText(request.billOfLading())
        || hasText(request.trafficTerm())
        || hasText(request.estimatedDelivery())
        || hasText(request.latestEventName())
        || hasText(request.latestEventTime())
        || hasText(request.latestEventLocation())
        || (request.serviceScopes() != null && !request.serviceScopes().isEmpty())
        || (request.routeNodes() != null && !request.routeNodes().isEmpty())
        || (request.routingLegs() != null && !request.routingLegs().isEmpty())
        || (request.containerTypes() != null && !request.containerTypes().isEmpty())
        || (request.containers() != null && !request.containers().isEmpty());
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
    requireOperationsReader(actor);
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
    syncOverseaAgentScopeForShipment(customer.id(), shipment.id());
    syncEmployeeAgentParticipant(customer.id(), shipment.id(), actor.id());
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
      syncOverseaAgentScopeForShipment(customer.id(), shipment.id());
      syncEmployeeAgentParticipant(customer.id(), shipment.id(), actor.id());
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
    syncOverseaAgentScopeForShipment(customer.id(), shipment.id());
    syncEmployeeAgentParticipant(customer.id(), shipment.id(), actor.id());
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
    syncOverseaAgentScopeForShipment(customer.id(), shipment.id());
    syncEmployeeAgentParticipant(customer.id(), shipment.id(), actor.id());
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
        ? jdbcTemplate.query(
            baseCustomerSelect() + " WHERE c.public_id = ? AND c.status <> 'DELETED'",
            this::mapCustomer,
            publicId
        )
        : jdbcTemplate.query(
            baseCustomerSelect()
                + " WHERE c.public_id = ? AND c.responsible_agent_id = ?"
                + " AND c.status <> 'DELETED'",
            this::mapCustomer,
            publicId,
            actor.id()
        );
    if (records.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Customer not found");
    return records.get(0);
  }

  private CustomerRecord requireTransferCustomer(String publicId, AuthenticatedUser actor) {
    requireTransferManager(actor);
    if (actor.isAdmin() || actor.isBusiness()) return requireManaged(publicId, actor);
    List<CustomerRecord> records = jdbcTemplate.query(
        baseCustomerSelect() + """
             WHERE c.public_id = ?
               AND c.status <> 'DELETED'
               AND c.party_role IN ('SHIPPER', 'CONSIGNEE')
               AND EXISTS (
                 SELECT 1 FROM cp_customer_employee_assignments employee_assignment
                 WHERE employee_assignment.customer_id = c.id
                   AND employee_assignment.employee_user_id = ?
               )
            """,
        this::mapCustomer,
        publicId,
        actor.id()
    );
    if (records.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Customer not found");
    return records.get(0);
  }

  private CustomerRecord requireAccessibleCustomer(String publicId, AuthenticatedUser actor) {
    requireOperationsReader(actor);
    List<CustomerRecord> records;
    if (actor.isAdmin()) {
      records = jdbcTemplate.query(
          baseCustomerSelect() + " WHERE c.public_id = ? AND c.status <> 'DELETED'",
          this::mapCustomer,
          publicId
      );
    } else if (actor.isBusiness()) {
      records = jdbcTemplate.query(
          baseCustomerSelect()
              + " WHERE c.public_id = ? AND c.responsible_agent_id = ?"
              + " AND c.status <> 'DELETED'",
          this::mapCustomer,
          publicId,
          actor.id()
      );
    } else {
      records = jdbcTemplate.query(
          baseCustomerSelect() + """
               WHERE c.public_id = ?
                 AND c.status <> 'DELETED'
                 AND EXISTS (
                   SELECT 1 FROM cp_customer_employee_assignments employee_assignment
                   WHERE employee_assignment.customer_id = c.id
                     AND employee_assignment.employee_user_id = ?
                 )
              """,
          this::mapCustomer,
          publicId,
          actor.id()
      );
    }
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
    if (!"BOOKING".equals(type)) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Shipment binding must use the booking number"
      );
    }
    String reference = normalizeReference(request.referenceNo());
    if (reference.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment id or reference number is required");
    }
    List<ShipmentRecord> shipments = jdbcTemplate.query(
        """
        SELECT s.id, s.public_id, s.carrier_code, s.responsible_agent_id
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

  private ShipmentRecord findShipmentByReference(
      String carrier,
      String referenceType,
      String referenceNo
  ) {
    String normalized = normalizeReference(referenceNo);
    boolean sharedCoscoIdentity = isSharedCoscoNumericIdentity(
        carrier, referenceType, normalized
    );
    String canonical = sharedCoscoIdentity && normalized.startsWith("COSU")
        ? normalized.substring(4)
        : normalized;
    String sql = sharedCoscoIdentity
        ? """
          SELECT s.id, s.public_id, s.carrier_code, s.responsible_agent_id
          FROM cp_shipment_references r
          JOIN cp_shipments s ON s.id = r.shipment_id
          WHERE r.carrier_code = ?
            AND r.reference_type IN ('BOOKING', 'BILLOFLADING')
            AND r.reference_no_normalized IN (?, ?)
          ORDER BY CASE WHEN r.reference_type = ? THEN 0 ELSE 1 END,
                   r.primary_reference DESC, r.id ASC
          LIMIT 1
          """
        : """
          SELECT s.id, s.public_id, s.carrier_code, s.responsible_agent_id
          FROM cp_shipment_references r
          JOIN cp_shipments s ON s.id = r.shipment_id
          WHERE r.carrier_code = ? AND r.reference_type = ?
            AND r.reference_no_normalized = ?
          ORDER BY r.primary_reference DESC, r.id ASC
          LIMIT 1
          """;
    List<ShipmentRecord> records = sharedCoscoIdentity
        ? jdbcTemplate.query(
            sql,
            this::mapShipment,
            carrier,
            canonical,
            "COSU" + canonical,
            referenceType
        )
        : jdbcTemplate.query(
            sql,
            this::mapShipment,
            carrier,
            referenceType,
            normalized
        );
    return records.isEmpty() ? null : records.get(0);
  }

  private ShipmentRecord requireShipment(String publicId) {
    List<ShipmentRecord> shipments = jdbcTemplate.query(
        "SELECT id, public_id, carrier_code, responsible_agent_id FROM cp_shipments WHERE public_id = ?",
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
        : " WHERE s.public_id = ? AND (s.responsible_agent_id = ? OR EXISTS ("
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
               c.status, c.remark, c.created_by, c.responsible_agent_id,
               c.created_at, c.updated_at,
               creator.display_name AS created_by_display_name,
               owner.display_name AS responsible_agent_display_name,
               (SELECT COUNT(*) FROM cp_customer_shipment_access a WHERE a.customer_id = c.id) AS shipment_count
        FROM cp_customers c
        LEFT JOIN cp_users creator ON creator.id = c.created_by
        LEFT JOIN cp_users owner ON owner.id = c.responsible_agent_id
        """;
  }

  private String shipmentBindingSelect() {
    return """
        SELECT s.public_id AS shipment_public_id, s.carrier_code, s.tracking_status,
               s.business_note, s.last_refresh_result, s.last_refresh_error_code,
               s.last_refresh_error, s.last_refresh_attempts,
               s.last_refresh_proxy_attempts, s.last_refresh_at,
                s.last_tracked_at, s.fresh_until, s.created_at, s.updated_at,
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
               s.business_note, s.last_refresh_result, s.last_refresh_error_code,
               s.last_refresh_error, s.last_refresh_attempts,
               s.last_refresh_proxy_attempts, s.last_refresh_at,
                s.last_tracked_at, s.created_at, s.updated_at,
               r.reference_type, r.reference_no_raw,
               (SELECT COUNT(*) FROM cp_customer_shipment_access a WHERE a.shipment_id = s.id) AS customer_count,
               (SELECT COUNT(*) FROM cp_customer_shipment_access a WHERE a.shipment_id = s.id AND a.relationship_role = 'SHIPPER') AS shipper_count,
               (SELECT COUNT(*) FROM cp_customer_shipment_access a WHERE a.shipment_id = s.id AND a.relationship_role = 'CONSIGNEE') AS consignee_count,
               (SELECT COUNT(*) FROM cp_customer_shipment_access a
                WHERE a.shipment_id = s.id
                  AND UPPER(a.relationship_role) IN ('AGENT', 'OVERSEA_AGENT')) AS agent_count
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
        rs.getLong("responsible_agent_id"),
        rs.getString("responsible_agent_display_name"),
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
        nullableLong(rs, "responsible_agent_id")
    );
  }

  private void requireShipmentAssignmentAuthority(
      ShipmentRecord shipment,
      AuthenticatedUser actor
  ) {
    if (actor.isAdmin()) return;
    if (shipment.responsibleAgentId() != null
        && shipment.responsibleAgentId() == actor.id()) return;
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
    value.put("createdAt", instantString(rs, "created_at"));
    value.put("updatedAt", instantString(rs, "updated_at"));
    value.put("relationshipRole", rs.getString("relationship_role"));
    value.put("publicationStatus", rs.getString("publication_status"));
    value.put("publishedAt", instantString(rs, "published_at"));
    value.put("publishedBy", nullableLong(rs, "published_by"));
    value.put("assignedAt", instantString(rs, "assigned_at"));
    value.put("assignedBy", nullableLong(rs, "assigned_by"));
    value.put("assignedByDisplayName", rs.getString("assigned_by_display_name"));
    putRefreshOutcome(value, rs);
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
    value.put("createdAt", instantString(rs, "created_at"));
    value.put("updatedAt", instantString(rs, "updated_at"));
    putRefreshOutcome(value, rs);
    value.put("customerCount", rs.getLong("customer_count"));
    List<String> boundRoles = new java.util.ArrayList<>();
    if (rs.getLong("shipper_count") > 0) boundRoles.add("SHIPPER");
    if (rs.getLong("consignee_count") > 0) boundRoles.add("CONSIGNEE");
    if (rs.getLong("agent_count") > 0) boundRoles.add("OVERSEA_AGENT");
    value.put("boundRoles", boundRoles);
    return value;
  }

  private void putRefreshOutcome(Map<String, Object> value, ResultSet rs) throws SQLException {
    value.put("lastRefreshResult", rs.getString("last_refresh_result"));
    value.put("lastRefreshErrorCode", rs.getString("last_refresh_error_code"));
    value.put("lastRefreshError", rs.getString("last_refresh_error"));
    value.put("lastRefreshAttempts", rs.getInt("last_refresh_attempts"));
    value.put("lastRefreshProxyAttempts", rs.getInt("last_refresh_proxy_attempts"));
    value.put("lastRefreshAt", instantString(rs, "last_refresh_at"));
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
    value.put("responsibleAgentId", record.responsibleAgentId());
    value.put("responsibleAgentDisplayName", record.responsibleAgentDisplayName());
    value.put("createdAt", record.createdAt());
    value.put("updatedAt", record.updatedAt());
    value.put("shipmentCount", record.shipmentCount());
    return value;
  }

  private Map<String, Object> customerMetadataWithEmployee(CustomerRecord record) {
    Map<String, Object> value = customerMetadata(record);
    List<Map<String, Object>> assignments = jdbcTemplate.query(
        """
        SELECT u.id, u.username, u.display_name
        FROM cp_customer_employee_assignments assignment
        JOIN cp_users u ON u.id = assignment.employee_user_id
        WHERE assignment.customer_id = ? AND u.status = 'ACTIVE'
        """,
        (rs, rowNumber) -> {
          Map<String, Object> assignment = new LinkedHashMap<>();
          assignment.put("id", rs.getLong("id"));
          assignment.put("username", rs.getString("username"));
          assignment.put("displayName", rs.getString("display_name"));
          return assignment;
        },
        record.id()
    );
    Map<String, Object> assignment = assignments.isEmpty() ? null : assignments.get(0);
    value.put("overseaAgentUserId", assignment == null ? null : assignment.get("id"));
    value.put("overseaAgentUsername", assignment == null ? null : assignment.get("username"));
    value.put("overseaAgentDisplayName", assignment == null ? null : assignment.get("displayName"));
    return value;
  }

  private void revokeSessions(long customerId) {
    jdbcTemplate.update(
        """
        UPDATE cp_customer_sessions
        SET revoked_at = ?
        WHERE (customer_id = ? OR scope_customer_id = ?)
          AND revoked_at IS NULL
        """,
        Timestamp.from(Instant.now()),
        customerId,
        customerId
    );
  }

  private void syncOverseaAgentScopesForCustomer(long customerId) {
    jdbcTemplate.update(
        "DELETE FROM cp_oversea_agent_shipment_scopes WHERE represented_customer_id = ?",
        customerId
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
        WHERE link.customer_id = ?
        """,
        customerId
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

  private void syncEmployeeAgentParticipant(long customerId, long shipmentId, long actorId) {
    List<Long> employeeIds = jdbcTemplate.query(
        "SELECT employee_user_id FROM cp_customer_employee_assignments WHERE customer_id = ?",
        (rs, rowNumber) -> rs.getLong(1),
        customerId
    );
    if (employeeIds.isEmpty()) return;
    long employeeId = employeeIds.get(0);
    Long bindingCount = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_customer_shipment_access WHERE customer_id = ? AND shipment_id = ?",
        Long.class,
        customerId,
        shipmentId
    );
    if (bindingCount != null && bindingCount > 0) {
      jdbcTemplate.update(
          """
          INSERT INTO cp_shipment_participants (
            shipment_id, user_id, participant_role, granted_by
          ) VALUES (?, ?, 'OVERSEA_AGENT', ?)
          ON DUPLICATE KEY UPDATE
            participant_role = 'OVERSEA_AGENT',
            granted_by = VALUES(granted_by),
            updated_at = CURRENT_TIMESTAMP(6)
          """,
          shipmentId,
          employeeId,
          actorId
      );
    } else {
      removeUnusedEmployeeAgentParticipant(shipmentId, employeeId);
    }
  }

  private void removeUnusedEmployeeAgentParticipant(long shipmentId, long employeeId) {
    Long assignmentCount = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*)
        FROM cp_customer_shipment_access shipment_access
        JOIN cp_customer_employee_assignments assignment
          ON assignment.customer_id = shipment_access.customer_id
        WHERE shipment_access.shipment_id = ?
          AND assignment.employee_user_id = ?
        """,
        Long.class,
        shipmentId,
        employeeId
    );
    if (assignmentCount == null || assignmentCount == 0) {
      jdbcTemplate.update(
          """
          DELETE FROM cp_shipment_participants
          WHERE shipment_id = ? AND user_id = ? AND participant_role = 'OVERSEA_AGENT'
          """,
          shipmentId,
          employeeId
      );
    }
  }

  private void grantBusinessHandoverParticipant(long shipmentId, long userId, long actorId) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_participants (
          shipment_id, user_id, participant_role, granted_by
        ) VALUES (?, ?, 'CUSTOMER_OWNER', ?)
        ON DUPLICATE KEY UPDATE
          participant_role = VALUES(participant_role),
          granted_by = VALUES(granted_by),
          updated_at = CURRENT_TIMESTAMP(6)
        """,
        shipmentId,
        userId,
        actorId
    );
  }

  private String customerHandoverRequestSelect() {
    return """
        SELECT handover_request.id, handover_request.public_id, handover_request.status,
               handover_request.source_agent_id, handover_request.target_agent_id,
               handover_request.requested_by, handover_request.reason,
               handover_request.customer_count, handover_request.shipment_count,
               handover_request.request_ip, handover_request.reviewed_by,
               handover_request.review_comment, handover_request.review_ip,
               handover_request.approved_batch_id, handover_request.created_at,
               handover_request.updated_at, handover_request.reviewed_at,
               source_user.username AS source_username,
               source_user.display_name AS source_display_name,
               target_user.username AS target_username,
               target_user.display_name AS target_display_name,
               requester.username AS requester_username,
               requester.display_name AS requester_display_name,
               reviewer.username AS reviewer_username,
               reviewer.display_name AS reviewer_display_name
        FROM cp_customer_handover_requests handover_request
        JOIN cp_users source_user ON source_user.id = handover_request.source_agent_id
        JOIN cp_users target_user ON target_user.id = handover_request.target_agent_id
        JOIN cp_users requester ON requester.id = handover_request.requested_by
        LEFT JOIN cp_users reviewer ON reviewer.id = handover_request.reviewed_by
        """;
  }

  private CustomerHandoverRequestRecord mapCustomerHandoverRequest(
      ResultSet rs,
      int rowNumber
  ) throws SQLException {
    return new CustomerHandoverRequestRecord(
        rs.getLong("id"),
        rs.getString("public_id"),
        rs.getString("status"),
        rs.getLong("source_agent_id"),
        rs.getString("source_username"),
        rs.getString("source_display_name"),
        rs.getLong("target_agent_id"),
        rs.getString("target_username"),
        rs.getString("target_display_name"),
        rs.getLong("requested_by"),
        rs.getString("requester_username"),
        rs.getString("requester_display_name"),
        rs.getString("reason"),
        rs.getInt("customer_count"),
        rs.getInt("shipment_count"),
        rs.getString("request_ip"),
        nullableLong(rs, "reviewed_by"),
        rs.getString("reviewer_username"),
        rs.getString("reviewer_display_name"),
        rs.getString("review_comment"),
        rs.getString("review_ip"),
        rs.getString("approved_batch_id"),
        instantString(rs, "created_at"),
        instantString(rs, "updated_at"),
        instantString(rs, "reviewed_at")
    );
  }

  private CustomerHandoverRequestRecord requireCustomerHandoverRequest(
      String requestPublicId,
      boolean lock
  ) {
    String normalized = requestPublicId == null ? "" : requestPublicId.trim();
    if (normalized.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Handover request id is required");
    }
    List<CustomerHandoverRequestRecord> requests = jdbcTemplate.query(
        customerHandoverRequestSelect()
            + " WHERE handover_request.public_id = ?"
            + (lock ? " FOR UPDATE" : ""),
        this::mapCustomerHandoverRequest,
        normalized
    );
    if (requests.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Handover request not found");
    }
    return requests.get(0);
  }

  private void requireCustomerHandoverVisibility(
      CustomerHandoverRequestRecord request,
      AuthenticatedUser actor
  ) {
    if (actor.isAdmin()
        || request.requestedBy() == actor.id()
        || request.sourceAgentId() == actor.id()
        || request.targetAgentId() == actor.id()) {
      return;
    }
    throw new ApiException(HttpStatus.NOT_FOUND, "Handover request not found");
  }

  private Map<String, Object> handoverRequestMetadata(
      CustomerHandoverRequestRecord request
  ) {
    List<Map<String, Object>> customers = jdbcTemplate.query(
        """
        SELECT request_item.customer_public_id_snapshot,
               request_item.customer_display_name_snapshot,
               request_item.source_agent_id, request_item.shipment_count,
               request_item.transferred_at, customer.client_code,
               customer.party_role, customer.status,
               customer.responsible_agent_id AS current_agent_id
        FROM cp_customer_handover_request_items request_item
        JOIN cp_customers customer ON customer.id = request_item.customer_id
        WHERE request_item.request_id = ?
        ORDER BY request_item.customer_display_name_snapshot,
                 request_item.customer_public_id_snapshot
        """,
        (rs, rowNumber) -> {
          Map<String, Object> value = new LinkedHashMap<>();
          value.put("id", rs.getString("customer_public_id_snapshot"));
          value.put("displayName", rs.getString("customer_display_name_snapshot"));
          value.put("clientCode", rs.getString("client_code"));
          value.put("partyRole", rs.getString("party_role"));
          value.put("status", rs.getString("status"));
          value.put("sourceBusinessUserId", rs.getLong("source_agent_id"));
          value.put("currentBusinessUserId", rs.getLong("current_agent_id"));
          value.put("shipmentCount", rs.getInt("shipment_count"));
          value.put("transferredAt", instantString(rs, "transferred_at"));
          return value;
        },
        request.id()
    );
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("requestId", request.publicId());
    value.put("status", request.status());
    value.put("reason", request.reason());
    value.put("customerCount", request.customerCount());
    value.put("shipmentCount", request.shipmentCount());
    value.put("customers", customers);
    value.put(
        "customerIds",
        customers.stream().map(customer -> customer.get("id")).toList()
    );
    value.put("sourceBusinessUserId", request.sourceAgentId());
    value.put("sourceBusinessUserName", request.sourceDisplayName());
    value.put("sourceBusinessUser", Map.of(
        "id", request.sourceAgentId(),
        "username", request.sourceUsername(),
        "displayName", request.sourceDisplayName()
    ));
    value.put("targetBusinessUserId", request.targetAgentId());
    value.put("targetBusinessUserName", request.targetDisplayName());
    value.put("targetBusinessUser", Map.of(
        "id", request.targetAgentId(),
        "username", request.targetUsername(),
        "displayName", request.targetDisplayName()
    ));
    value.put("requestedByUserId", request.requestedBy());
    value.put("requestedByUserName", request.requesterDisplayName());
    value.put("requestedBy", Map.of(
        "id", request.requestedBy(),
        "username", request.requesterUsername(),
        "displayName", request.requesterDisplayName()
    ));
    value.put("requestedAt", request.createdAt());
    value.put("updatedAt", request.updatedAt());
    value.put("reviewedAt", request.reviewedAt());
    value.put("reviewComment", request.reviewComment());
    value.put("approvedBatchId", request.approvedBatchId());
    if (request.reviewedBy() == null) {
      value.put("reviewedBy", null);
    } else {
      Map<String, Object> reviewer = new LinkedHashMap<>();
      reviewer.put("id", request.reviewedBy());
      reviewer.put("username", request.reviewerUsername());
      reviewer.put("displayName", request.reviewerDisplayName());
      value.put("reviewedBy", reviewer);
    }
    return value;
  }

  private String normalizeHandoverStatus(String value, boolean allowBlank) {
    if (value == null || value.isBlank()) {
      if (allowBlank) return null;
      throw new ApiException(HttpStatus.BAD_REQUEST, "Handover status is required");
    }
    String normalized = value.trim().toUpperCase(Locale.ROOT);
    if (!List.of("PENDING", "APPROVED", "REJECTED").contains(normalized)) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Handover status must be PENDING, APPROVED, or REJECTED"
      );
    }
    return normalized;
  }

  private String normalizeReviewComment(String value, boolean required) {
    String normalized = value == null ? "" : value.trim();
    if (required && normalized.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Rejection reason is required");
    }
    if (normalized.length() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Review comment cannot exceed 500 characters");
    }
    return normalized.isBlank() ? null : normalized;
  }

  private void requirePendingHandover(CustomerHandoverRequestRecord request) {
    if (!"PENDING".equals(request.status())) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "Handover request has already been " + request.status().toLowerCase(Locale.ROOT)
      );
    }
  }

  private void requireAdministrator(AuthenticatedUser actor) {
    if (actor == null || !actor.isAdmin()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Administrator permission is required");
    }
  }

  private void auditCustomerHandover(
      AuthenticatedUser actor,
      String action,
      long requestId,
      String detail,
      String ip
  ) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (
          admin_user_id, action, target_type, target_id, detail, ip_address
        ) VALUES (?, ?, 'CUSTOMER_HANDOVER', ?, ?, ?)
        """,
        actor.id(),
        action,
        requestId,
        ClientInfo.trim(detail, 512),
        ClientInfo.trim(ip, 64)
    );
  }

  private void requireOperationsReader(AuthenticatedUser actor) {
    if (actor == null
        || (!actor.isBusiness() && !actor.isAdmin() && !actor.isOverseaAgent())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Internal operations permission is required");
    }
  }

  private void requireManager(AuthenticatedUser actor) {
    if (actor == null || (!actor.isBusiness() && !actor.isAdmin())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Business or administrator permission is required");
    }
  }

  private void requireTransferManager(AuthenticatedUser actor) {
    if (actor == null
        || (!actor.isBusiness() && !actor.isAdmin() && !actor.isOverseaAgent())) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Business, administrator, or overseas agent permission is required"
      );
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

  private void lockCustomer(String customerPublicId) {
    List<Long> ids = jdbcTemplate.query(
        "SELECT id FROM cp_customers WHERE public_id = ? FOR UPDATE",
        (rs, rowNumber) -> rs.getLong(1),
        customerPublicId
    );
    if (ids.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Customer not found");
  }

  private TransferAgent requireTransferAgent(String agentPublicId) {
    Long agentUserId = null;
    try {
      agentUserId = Long.parseLong(agentPublicId.trim());
    } catch (RuntimeException ignored) {
      // UUID values are accepted only for existing legacy customer-agent records.
    }
    List<TransferAgent> agents = agentUserId == null
        ? List.of()
        : jdbcTemplate.query(
            """
            SELECT id, username, display_name
            FROM cp_users
            WHERE id = ? AND role = 'OVERSEA_AGENT' AND status = 'ACTIVE'
            FOR UPDATE
            """,
            (rs, rowNumber) -> new TransferAgent(
                rs.getLong("id"), String.valueOf(rs.getLong("id")),
                rs.getString("username"), rs.getString("display_name"), true
            ),
            agentUserId
        );
    if (agents.isEmpty()) {
      agents = jdbcTemplate.query(
          """
          SELECT id, public_id, username, display_name
          FROM cp_customers
          WHERE public_id = ? AND party_role = 'OVERSEA_AGENT' AND status = 'ACTIVE'
          FOR UPDATE
          """,
          (rs, rowNumber) -> new TransferAgent(
              rs.getLong("id"), rs.getString("public_id"),
              rs.getString("username"), rs.getString("display_name"), false
          ),
          agentPublicId.trim()
      );
    }
    if (agents.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Target overseas agent is not active");
    }
    return agents.get(0);
  }

  private BusinessHandoverAgent requireBusinessHandoverAgent(long userId) {
    List<BusinessHandoverAgent> users = jdbcTemplate.query(
        """
        SELECT id, username, display_name
        FROM cp_users
        WHERE id = ? AND role = 'BUSINESS' AND status = 'ACTIVE'
        FOR UPDATE
        """,
        (rs, rowNumber) -> new BusinessHandoverAgent(
            rs.getLong("id"),
            rs.getString("username"),
            rs.getString("display_name")
        ),
        userId
    );
    if (users.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Target business user is not active");
    }
    return users.get(0);
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
    if (!value.chars().anyMatch(Character::isLetter)
        || !value.chars().anyMatch(Character::isDigit)) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Customer password must contain at least one letter and one number"
      );
    }
    return value;
  }

  private void validateInternalPassword(String password) {
    String value = password == null ? "" : password;
    boolean valid = value.length() >= 8
        && value.length() <= 128
        && value.chars().anyMatch(Character::isLetter)
        && value.chars().anyMatch(Character::isDigit);
    if (!valid) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Password must be 8-128 characters and include at least one letter and one number"
      );
    }
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
    if (!normalized.matches("[A-Z0-9._-]{6,10}")) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Client Code must contain 6-10 letters, numbers, dots, underscores, or hyphens"
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

  private String deletedUsername(String accountType, long id) {
    String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    return "deleted_" + accountType + "_" + id + "_" + suffix;
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
    if ("AGENT".equals(normalized)) normalized = "OVERSEA_AGENT";
    if (normalized == null
        || (!"OVERSEA_AGENT".equals(normalized)
        && !"SHIPPER".equals(normalized)
        && !"CONSIGNEE".equals(normalized))) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Customer party role must be SHIPPER or CONSIGNEE; OVERSEA_AGENT is accepted only for legacy records"
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
    String normalized = normalizeCode(value, "BOOKING");
    if (!"BOOKING".equals(normalized)) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "New and updated shipments must use the booking number; the bill of lading is supplementary data only"
      );
    }
    return normalized;
  }

  private String normalizeShipmentReference(String carrier, String type, String value) {
    String normalized = normalizeReference(value);
    if ("COSCO".equals(carrier)
        && ("BOOKING".equals(type) || "BILLOFLADING".equals(type))
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
      long responsibleAgentId,
      String responsibleAgentDisplayName,
      String createdAt,
      String updatedAt,
      long shipmentCount
  ) {}

  private record ShipmentRecord(long id, String publicId, String carrier, Long responsibleAgentId) {}
  private record ShipmentCounts(long total, long refreshIssues) {}

  private record BusinessHandoverAgent(long id, String username, String displayName) {}
  private record CustomerHandoverApplicationTarget(
      CustomerRecord customer,
      int shipmentCount
  ) {}
  private record CustomerHandoverApprovalTarget(
      long customerId,
      String publicId,
      String displayName,
      String partyRole,
      String status,
      long currentAgentId,
      long sourceAgentId,
      List<Long> shipmentIds
  ) {}
  private record CustomerHandoverRequestRecord(
      long id,
      String publicId,
      String status,
      long sourceAgentId,
      String sourceUsername,
      String sourceDisplayName,
      long targetAgentId,
      String targetUsername,
      String targetDisplayName,
      long requestedBy,
      String requesterUsername,
      String requesterDisplayName,
      String reason,
      int customerCount,
      int shipmentCount,
      String requestIp,
      Long reviewedBy,
      String reviewerUsername,
      String reviewerDisplayName,
      String reviewComment,
      String reviewIp,
      String approvedBatchId,
      String createdAt,
      String updatedAt,
      String reviewedAt
  ) {}
  private record TransferAgent(
      long id,
      String publicId,
      String username,
      String displayName,
      boolean internalEmployee
  ) {}
  private record CustomerTransferTarget(
      CustomerRecord customer,
      Long previousAgentId,
      List<Long> shipmentIds
  ) {}
  private record RefreshableShipment(
      String shipmentPublicId,
      String carrier,
      String referenceType,
      String referenceNo,
      String displayReferenceNo
  ) {}
  private record ShipmentBusinessFieldsTarget(
      ShipmentRecord shipment,
      String jobNumber,
      String clientPoNumber,
      String clientNameCode
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
