package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.auth.PasswordHasher.PasswordHash;
import com.cargoplanner.backend.common.ApiException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 海外代理账号与代理范围同步。
 *
 * <p>从 {@code BusinessCustomerService} 拆出的代理领域服务：账号创建/编辑/重置/删除、
 * 可用代理列表，以及客户-代理-票单范围同步。事务边界与原实现保持一致：
 * <ul>
 *   <li>{@code batchCreateOverseaAgentEmployees} 与 {@code createOverseaAgentEmployee}
 *       同处一个 Bean，批量为整体事务（自调用不开新事务，语义不变）。</li>
 *   <li>{@code sync*} 不单独开启事务，加入调用方（客户建档/绑定）的事务。</li>
 * </ul>
 */
@Service
public class OverseaAgentService {
  private final JdbcTemplate jdbcTemplate;
  private final PasswordHasher passwordHasher;
  private final CustomerAccessGuard accessGuard;
  private final CustomerInputRules inputRules;
  private final CustomerAuditService auditService;

  public OverseaAgentService(
      JdbcTemplate jdbcTemplate,
      PasswordHasher passwordHasher,
      CustomerAccessGuard accessGuard,
      CustomerInputRules inputRules,
      CustomerAuditService auditService
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.passwordHasher = passwordHasher;
    this.accessGuard = accessGuard;
    this.inputRules = inputRules;
    this.auditService = auditService;
  }

  public Map<String, Object> listTransferAgents(AuthenticatedUser actor) {
    accessGuard.requireTransferManager(actor);
    List<Map<String, Object>> agents =
        jdbcTemplate.query(
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
            });
    return Map.of("items", agents, "total", agents.size());
  }

  public Map<String, Object> listBusinessHandoverAgents(AuthenticatedUser actor) {
    accessGuard.requireManager(actor);
    List<Map<String, Object>> agents =
        jdbcTemplate.query(
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
            });
    return Map.of("items", agents, "total", agents.size(), "currentUserId", actor.id());
  }

  @Transactional
  public Map<String, Object> createOverseaAgentEmployee(
      CreateOverseaAgentEmployeeRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    String username = inputRules.normalizeUsername(request == null ? null : request.username());
    String displayName =
        inputRules.normalizeDisplayName(request == null ? null : request.displayName());
    String password = request == null ? null : request.password();
    inputRules.validateInternalPassword(password);
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
          actor.id());
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Overseas agent username already exists");
    }
    Long userId =
        jdbcTemplate.queryForObject(
            "SELECT id FROM cp_users WHERE username = ?", Long.class, username);
    auditService.record(
        actor,
        "CREATE_OVERSEA_AGENT",
        "USER",
        userId,
        "Created internal overseas agent " + username,
        ipAddress);
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
    accessGuard.requireManager(actor);
    List<CreateOverseaAgentEmployeeRequest> requests =
        request == null || request.items() == null ? List.of() : request.items();
    if (requests.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one overseas agent is required");
    }
    if (requests.size() > 200) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "At most 200 overseas agents can be created at once");
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
    accessGuard.requireManager(actor);
    Map<String, Object> existing = requireOverseaAgent(userId);
    String displayName =
        request == null || request.displayName() == null
            ? String.valueOf(existing.get("displayName"))
            : inputRules.normalizeDisplayName(request.displayName());
    String status =
        request == null || request.status() == null || request.status().isBlank()
            ? String.valueOf(existing.get("status"))
            : request.status().trim().toUpperCase(Locale.ROOT);
    if (!List.of("ACTIVE", "DISABLED").contains(status)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Status must be ACTIVE or DISABLED");
    }
    String password = request == null ? null : request.password();
    if (password != null && !password.isBlank()) {
      inputRules.validateInternalPassword(password);
      PasswordHash hash = passwordHasher.hash(password);
      jdbcTemplate.update(
          """
          UPDATE cp_users
          SET display_name = ?, status = ?, password_salt = ?, password_hash = ?,
              password_iterations = ?, updated_at = CURRENT_TIMESTAMP(6)
          WHERE id = ? AND role = 'OVERSEA_AGENT'
          """,
          displayName,
          status,
          hash.salt(),
          hash.hash(),
          hash.iterations(),
          userId);
      jdbcTemplate.update("DELETE FROM cp_login_devices WHERE user_id = ?", userId);
    } else {
      jdbcTemplate.update(
          "UPDATE cp_users SET display_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP(6) WHERE id = ? AND role = 'OVERSEA_AGENT'",
          displayName,
          status,
          userId);
      if ("DISABLED".equals(status)) {
        jdbcTemplate.update("DELETE FROM cp_login_devices WHERE user_id = ?", userId);
      }
    }
    auditService.customer(
        actor,
        "UPDATE_OVERSEA_AGENT",
        userId,
        "Updated overseas agent " + existing.get("username") + " (" + status + ")",
        ipAddress);
    return requireOverseaAgent(userId);
  }

  @Transactional
  public Map<String, Object> resetOverseaAgentPassword(
      long userId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
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
        hash.salt(),
        hash.hash(),
        hash.iterations(),
        userId);
    jdbcTemplate.update("DELETE FROM cp_login_devices WHERE user_id = ?", userId);
    auditService.customer(
        actor,
        "RESET_OVERSEA_AGENT_PASSWORD",
        userId,
        "Reset password for overseas agent " + username,
        ipAddress);
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
    accessGuard.requireManager(actor);
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
        inputRules.deletedUsername("agent", userId),
        deletedPassword.salt(),
        deletedPassword.hash(),
        deletedPassword.iterations(),
        userId);
    jdbcTemplate.update("DELETE FROM cp_login_devices WHERE user_id = ?", userId);
    jdbcTemplate.update(
        "DELETE FROM cp_customer_employee_assignments WHERE employee_user_id = ?", userId);
    jdbcTemplate.update("DELETE FROM cp_shipment_participants WHERE user_id = ?", userId);
    auditService.customer(
        actor,
        "DELETE_OVERSEA_AGENT",
        userId,
        "Deleted overseas agent " + existing.get("username"),
        ipAddress);
    return Map.of(
        "id", String.valueOf(userId),
        "username", existing.get("username"),
        "status", "DELETED",
        "deleted", true);
  }

  /** 供客户/交接模块校验代理合法性使用。 */
  public Map<String, Object> requireOverseaAgent(long userId) {
    List<Map<String, Object>> rows =
        jdbcTemplate.query(
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
            userId);
    if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Overseas agent not found");
    return rows.get(0);
  }

  public void syncScopesForCustomer(long customerId) {
    jdbcTemplate.update(
        "DELETE FROM cp_oversea_agent_shipment_scopes WHERE represented_customer_id = ?",
        customerId);
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
        customerId);
  }

  public void syncScopeForShipment(long customerId, long shipmentId) {
    jdbcTemplate.update(
        """
        DELETE FROM cp_oversea_agent_shipment_scopes
        WHERE represented_customer_id = ? AND shipment_id = ?
        """,
        customerId,
        shipmentId);
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
        customerId);
  }

  public void syncEmployeeAgentParticipant(long customerId, long shipmentId, long actorId) {
    List<Long> employeeIds =
        jdbcTemplate.query(
            "SELECT employee_user_id FROM cp_customer_employee_assignments WHERE customer_id = ?",
            (rs, rowNumber) -> rs.getLong(1),
            customerId);
    if (employeeIds.isEmpty()) return;
    long employeeId = employeeIds.get(0);
    Long bindingCount =
        jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM cp_customer_shipment_access WHERE customer_id = ? AND shipment_id = ?",
            Long.class,
            customerId,
            shipmentId);
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
          actorId);
    } else {
      removeUnusedEmployeeAgentParticipant(shipmentId, employeeId);
    }
  }

  public void removeUnusedEmployeeAgentParticipant(long shipmentId, long employeeId) {
    Long assignmentCount =
        jdbcTemplate.queryForObject(
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
            employeeId);
    if (assignmentCount == null || assignmentCount == 0) {
      jdbcTemplate.update(
          """
          DELETE FROM cp_shipment_participants
          WHERE shipment_id = ? AND user_id = ? AND participant_role = 'OVERSEA_AGENT'
          """,
          shipmentId,
          employeeId);
    }
  }
}
