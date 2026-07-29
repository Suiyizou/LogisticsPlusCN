package com.cargoplanner.backend.admin;

import com.cargoplanner.backend.auth.AuthService;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import com.cargoplanner.backend.common.RequestStats;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminService {
  private final JdbcTemplate jdbcTemplate;
  private final PasswordHasher passwordHasher;
  private final RequestStats requestStats;
  private final AuthService authService;

  public AdminService(
      JdbcTemplate jdbcTemplate,
      PasswordHasher passwordHasher,
      RequestStats requestStats,
      AuthService authService
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.passwordHasher = passwordHasher;
    this.requestStats = requestStats;
    this.authService = authService;
  }

  public List<Map<String, Object>> listEmployees() {
    return jdbcTemplate.query(
        """
        SELECT id, username, display_name, role, party_role, status, created_at, updated_at, last_login_at
        FROM cp_users
        WHERE status <> 'DELETED'
        ORDER BY role = 'ADMIN' DESC, id ASC
        """,
        this::mapUserRow
    );
  }

  public Map<String, Object> employeePage(int page, int size) {
    int safePage = safePage(page);
    int safeSize = safeSize(size);
    List<Map<String, Object>> items = jdbcTemplate.query(
        """
        SELECT id, username, display_name, role, party_role, status, created_at, updated_at, last_login_at
        FROM cp_users
        WHERE status <> 'DELETED'
        ORDER BY role = 'ADMIN' DESC, id ASC
        LIMIT ? OFFSET ?
        """,
        this::mapUserRow,
        safeSize,
        pageOffset(safePage, safeSize)
    );
    return pageResult(
        items,
        safePage,
        safeSize,
        count("SELECT COUNT(*) FROM cp_users WHERE status <> 'DELETED'")
    );
  }

  @Transactional
  public Map<String, Object> createEmployee(CreateEmployeeRequest request, AuthenticatedUser admin, String ip) {
    validateStrongPassword(request.password());
    PasswordHasher.PasswordHash passwordHash = passwordHasher.hash(request.password());
    String role = normalizeRole(request.role(), "OVERSEA_AGENT");
    ensureSingleBusinessAccount(role, null);
    String partyRole = normalizePartyRole(request.partyRole(), role, "AGENT");
    try {
      jdbcTemplate.update(
          """
          INSERT INTO cp_users (
            username, display_name, role, party_role, status,
            password_salt, password_hash, password_iterations, created_by
          )
          VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
          """,
          request.username().trim(),
          request.displayName().trim(),
          role,
          partyRole,
          passwordHash.salt(),
          passwordHash.hash(),
          passwordHash.iterations(),
          admin.id()
      );
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Username already exists");
    }
    Long userId = jdbcTemplate.queryForObject("SELECT id FROM cp_users WHERE username = ?", Long.class, request.username().trim());
    if ("BUSINESS".equals(role)) {
      reassignDeletedBusinessScope(userId);
    }
    audit(admin.id(), "CREATE_USER", "USER", userId, "Created user " + request.username().trim(), ip);
    return findUser(userId);
  }

  @Transactional
  public Map<String, Object> updateEmployee(long userId, UpdateEmployeeRequest request, AuthenticatedUser admin, String ip) {
    Map<String, Object> existing = findUser(userId);
    String displayName = valueOrExisting(request.displayName(), (String) existing.get("displayName"));
    String role = normalizeRole(request.role(), (String) existing.get("role"));
    ensureSingleBusinessAccount(role, userId);
    String partyRole = normalizePartyRole(
        request.partyRole(),
        role,
        (String) existing.get("partyRole")
    );
    String status = normalizeStatus(request.status(), (String) existing.get("status"));
    boolean passwordChanged = request.password() != null && !request.password().isBlank();
    preserveActiveAdministrator(userId, admin, existing, role, status);

    if (passwordChanged) {
      validateStrongPassword(request.password());
      PasswordHasher.PasswordHash passwordHash = passwordHasher.hash(request.password());
      jdbcTemplate.update(
          """
          UPDATE cp_users
          SET display_name = ?, role = ?, party_role = ?, status = ?,
              password_salt = ?, password_hash = ?, password_iterations = ?
          WHERE id = ?
          """,
          displayName,
          role,
          partyRole,
          status,
          passwordHash.salt(),
          passwordHash.hash(),
          passwordHash.iterations(),
          userId
      );
    } else {
      jdbcTemplate.update(
          "UPDATE cp_users SET display_name = ?, role = ?, party_role = ?, status = ? WHERE id = ?",
          displayName,
          role,
          partyRole,
          status,
          userId
      );
    }

    if (passwordChanged || "DISABLED".equals(status)) {
      jdbcTemplate.update(
          "UPDATE cp_login_devices SET online = 0, session_token_hash = NULL, revoked_at = ? WHERE user_id = ?",
          Timestamp.from(Instant.now()),
          userId
      );
    }
    audit(admin.id(), "UPDATE_USER", "USER", userId, "Updated user " + existing.get("username"), ip);
    return findUser(userId);
  }

  @Transactional
  public Map<String, Object> resetEmployeePassword(long userId, AuthenticatedUser admin, String ip) {
    if (admin != null && userId == admin.id()) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Administrators cannot reset their own password from the employee console"
      );
    }
    Map<String, Object> existing = findUser(userId);
    String temporaryPassword = existing.get("username") + "!@#2026";
    PasswordHasher.PasswordHash passwordHash = passwordHasher.hash(temporaryPassword);
    jdbcTemplate.update(
        """
        UPDATE cp_users
        SET password_salt = ?, password_hash = ?, password_iterations = ?
        WHERE id = ?
        """,
        passwordHash.salt(),
        passwordHash.hash(),
        passwordHash.iterations(),
        userId
    );
    jdbcTemplate.update(
        "UPDATE cp_login_devices SET online = 0, session_token_hash = NULL, revoked_at = ? WHERE user_id = ?",
        Timestamp.from(Instant.now()),
        userId
    );
    audit(admin.id(), "RESET_PASSWORD", "USER", userId, "Reset password for " + existing.get("username"), ip);
    Map<String, Object> response = new LinkedHashMap<>(findUser(userId));
    response.put("temporaryPassword", temporaryPassword);
    return response;
  }

  private void validateStrongPassword(String password) {
    String value = password == null ? "" : password;
    boolean valid = value.length() >= 8
        && value.length() <= 128
        && value.chars().anyMatch(Character::isLetter)
        && value.chars().anyMatch(Character::isDigit);
    boolean knownLegacyPassword = "123456".equals(value) || "Admin@123456".equals(value);
    if (!valid || knownLegacyPassword) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Password must be 8-128 characters and include at least one letter and one number"
      );
    }
  }

  @Transactional
  public Map<String, Object> deleteEmployee(long userId, AuthenticatedUser admin, String ip) {
    if (admin.id() == userId) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot delete current admin account");
    }
    Map<String, Object> existing = findUser(userId);
    preserveActiveAdministrator(
        userId,
        admin,
        existing,
        (String) existing.get("role"),
        "DELETED"
    );
    PasswordHasher.PasswordHash deletedPassword = passwordHasher.hash(UUID.randomUUID().toString());
    jdbcTemplate.update(
        """
        UPDATE cp_users
        SET username = ?, status = 'DELETED',
            password_salt = ?, password_hash = ?, password_iterations = ?,
            last_login_at = NULL, updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ? AND status <> 'DELETED'
        """,
        deletedUsername("user", userId),
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
    audit(admin.id(), "DELETE_USER", "USER", userId, "Deleted user " + existing.get("username"), ip);

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("id", userId);
    response.put("username", existing.get("username"));
    response.put("displayName", existing.get("displayName"));
    response.put("status", "DELETED");
    response.put("deleted", true);
    return response;
  }

  private void preserveActiveAdministrator(
      long userId,
      AuthenticatedUser actor,
      Map<String, Object> existing,
      String requestedRole,
      String requestedStatus
  ) {
    boolean removesActiveAdmin = "ADMIN".equals(existing.get("role"))
        && "ACTIVE".equals(existing.get("status"))
        && (!"ADMIN".equals(requestedRole) || !"ACTIVE".equals(requestedStatus));
    if (!removesActiveAdmin) return;
    if (actor != null && actor.id() == userId) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Administrators cannot demote or disable their own account"
      );
    }
    List<Long> activeAdministratorIds = jdbcTemplate.query(
        "SELECT id FROM cp_users WHERE role = 'ADMIN' AND status = 'ACTIVE' FOR UPDATE",
        (rs, rowNumber) -> rs.getLong(1)
    );
    if (activeAdministratorIds.size() <= 1) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "At least one active administrator account must remain"
      );
    }
  }

  public List<Map<String, Object>> listDevices() {
    return jdbcTemplate.query(
        """
        SELECT d.id, d.user_id, u.username, u.display_name, d.device_id, d.device_name, d.mac_address,
               d.ip_address, d.user_agent, d.online, d.logged_in_at, d.last_seen_at, d.revoked_at
        FROM cp_login_devices d
        JOIN cp_users u ON u.id = d.user_id
        ORDER BY d.online DESC, d.last_seen_at DESC, d.id DESC
        """,
        this::mapDeviceRow
    );
  }

  public Map<String, Object> devicePage(int page, int size) {
    int safePage = safePage(page);
    int safeSize = safeSize(size);
    List<Map<String, Object>> items = jdbcTemplate.query(
        """
        SELECT d.id, d.user_id, u.username, u.display_name, d.device_id, d.device_name, d.mac_address,
               d.ip_address, d.user_agent, d.online, d.logged_in_at, d.last_seen_at, d.revoked_at
        FROM cp_login_devices d
        JOIN cp_users u ON u.id = d.user_id
        ORDER BY d.online DESC, d.last_seen_at DESC, d.id DESC
        LIMIT ? OFFSET ?
        """,
        this::mapDeviceRow,
        safeSize,
        pageOffset(safePage, safeSize)
    );
    return pageResult(items, safePage, safeSize, count("SELECT COUNT(*) FROM cp_login_devices"));
  }

  @Transactional
  public Map<String, Object> kickDevice(long deviceRowId, AuthenticatedUser admin, String ip) {
    Map<String, Object> device = findDevice(deviceRowId);
    jdbcTemplate.update(
        "UPDATE cp_login_devices SET online = 0, session_token_hash = NULL, revoked_at = ? WHERE id = ?",
        Timestamp.from(Instant.now()),
        deviceRowId
    );
    authService.recordEvent(
        ((Number) device.get("userId")).longValue(),
        (String) device.get("username"),
        "KICK",
        (String) device.get("deviceId"),
        ip,
        null,
        "Kicked by admin " + admin.username()
    );
    audit(admin.id(), "KICK_DEVICE", "DEVICE", deviceRowId, "Kicked device " + device.get("deviceId"), ip);
    return findDevice(deviceRowId);
  }

  @Transactional
  public Map<String, Object> deleteDevice(long deviceRowId, AuthenticatedUser admin, String ip) {
    Map<String, Object> device = findDevice(deviceRowId);
    jdbcTemplate.update(
        "UPDATE cp_login_devices SET online = 0, session_token_hash = NULL, revoked_at = ? WHERE id = ?",
        Timestamp.from(Instant.now()),
        deviceRowId
    );
    audit(admin.id(), "DELETE_DEVICE", "DEVICE", deviceRowId, "Deleted device " + device.get("deviceId"), ip);
    jdbcTemplate.update("DELETE FROM cp_login_devices WHERE id = ?", deviceRowId);
    return Map.of("ok", true, "deletedDeviceId", deviceRowId);
  }

  public Map<String, Object> monitoring() {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("serverTime", Instant.now().toString());
    result.put("userCount", count("SELECT COUNT(*) FROM cp_users WHERE status <> 'DELETED'"));
    result.put(
        "adminCount",
        count("SELECT COUNT(*) FROM cp_users WHERE role = 'ADMIN' AND status <> 'DELETED'")
    );
    result.put("onlineDeviceCount", count("SELECT COUNT(*) FROM cp_login_devices WHERE online = 1 AND revoked_at IS NULL"));
    result.put("loginSuccessToday", count("SELECT COUNT(*) FROM cp_login_events WHERE event_type = 'LOGIN_SUCCESS' AND created_at >= CURDATE()"));
    result.put("loginFailToday", count("SELECT COUNT(*) FROM cp_login_events WHERE event_type IN ('LOGIN_FAIL', 'DEVICE_LIMIT') AND created_at >= CURDATE()"));
    result.put("deviceLimit", authService.deviceLimit());
    result.put("tokenTtlHours", authService.tokenTtlHours());
    result.put("runtime", requestStats.snapshot());
    result.put("recentEvents", recentEvents());
    result.put("recentApiAudit", recentApiAudit());
    return result;
  }

  public Map<String, Object> systemOverview() {
    LocalDate today = LocalDate.now(ZoneId.of("Asia/Shanghai"));
    LocalDate trendStart = today.minusDays(6);
    Timestamp trendStartTimestamp = Timestamp.valueOf(trendStart.atStartOfDay());
    Timestamp todayTimestamp = Timestamp.valueOf(today.atStartOfDay());

    long internalUserCount = count("SELECT COUNT(*) FROM cp_users WHERE status <> 'DELETED'");
    long customerCount = count("SELECT COUNT(*) FROM cp_customers WHERE status <> 'DELETED'");
    long activeInternalUsers = count("SELECT COUNT(*) FROM cp_users WHERE status = 'ACTIVE'");
    long activeCustomers = count("SELECT COUNT(*) FROM cp_customers WHERE status = 'ACTIVE'");

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("totalUsers", internalUserCount + customerCount);
    result.put("internalUserCount", internalUserCount);
    result.put("customerCount", customerCount);
    result.put("activeUsers", activeInternalUsers + activeCustomers);
    result.put(
        "onlineDeviceCount",
        count("SELECT COUNT(*) FROM cp_login_devices WHERE online = 1 AND revoked_at IS NULL")
    );
    result.put(
        "managementActions30d",
        count(
            """
            SELECT COUNT(*) FROM cp_admin_audit_log
            WHERE action <> 'API_REQUEST' AND created_at >= ?
            """,
            Timestamp.valueOf(today.minusDays(29).atStartOfDay())
        )
    );
    result.put(
        "operationsToday",
        count(
            "SELECT COUNT(*) FROM cp_admin_audit_log WHERE created_at >= ?",
            todayTimestamp
        )
    );
    result.put("userComposition", userComposition(customerCount));
    result.put(
        "accountStatus",
        List.of(
            metricItem("ACTIVE", activeInternalUsers + activeCustomers),
            metricItem(
                "DISABLED",
                Math.max(0L, internalUserCount + customerCount - activeInternalUsers - activeCustomers)
            )
        )
    );
    result.put("activityTrend", activityTrend(trendStart, trendStartTimestamp));
    result.put("operationTypes", operationTypes(today.minusDays(29)));
    return result;
  }

  private List<Map<String, Object>> userComposition(long customerCount) {
    List<Map<String, Object>> composition = new ArrayList<>(jdbcTemplate.query(
        """
        SELECT role AS item_code, COUNT(*) AS item_count
        FROM cp_users
        WHERE status <> 'DELETED'
        GROUP BY role
        ORDER BY item_count DESC, item_code ASC
        """,
        (rs, rowNum) -> metricItem(rs.getString("item_code"), rs.getLong("item_count"))
    ));
    composition.add(metricItem("CUSTOMER", customerCount));
    return composition;
  }

  private List<Map<String, Object>> activityTrend(
      LocalDate trendStart,
      Timestamp trendStartTimestamp
  ) {
    Map<LocalDate, long[]> dailyCounts = new LinkedHashMap<>();
    for (int index = 0; index < 7; index++) {
      dailyCounts.put(trendStart.plusDays(index), new long[] { 0L, 0L });
    }
    jdbcTemplate.query(
        """
        SELECT DATE(created_at) AS activity_day,
               SUM(CASE WHEN action = 'API_REQUEST' THEN 1 ELSE 0 END) AS api_count,
               SUM(CASE WHEN action <> 'API_REQUEST' THEN 1 ELSE 0 END) AS management_count
        FROM cp_admin_audit_log
        WHERE created_at >= ?
        GROUP BY DATE(created_at)
        ORDER BY activity_day ASC
        """,
        rs -> {
          LocalDate day = rs.getDate("activity_day").toLocalDate();
          if (dailyCounts.containsKey(day)) {
            dailyCounts.put(
                day,
                new long[] { rs.getLong("api_count"), rs.getLong("management_count") }
            );
          }
        },
        trendStartTimestamp
    );
    return dailyCounts.entrySet().stream().map(entry -> {
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("date", entry.getKey().toString());
      item.put("apiRequests", entry.getValue()[0]);
      item.put("managementActions", entry.getValue()[1]);
      return item;
    }).toList();
  }

  private List<Map<String, Object>> operationTypes(LocalDate startDate) {
    return jdbcTemplate.query(
        """
        SELECT action AS item_code, COUNT(*) AS item_count
        FROM cp_admin_audit_log
        WHERE action <> 'API_REQUEST' AND created_at >= ?
        GROUP BY action
        ORDER BY item_count DESC, item_code ASC
        LIMIT 8
        """,
        (rs, rowNum) -> metricItem(rs.getString("item_code"), rs.getLong("item_count")),
        Timestamp.valueOf(startDate.atStartOfDay())
    );
  }

  private Map<String, Object> metricItem(String code, long value) {
    Map<String, Object> item = new LinkedHashMap<>();
    item.put("code", code);
    item.put("value", value);
    return item;
  }

  public Map<String, Object> platformInfo() {
    List<Map<String, Object>> customers = jdbcTemplate.query(
        """
        SELECT c.public_id, c.username, c.display_name, c.client_code, c.party_role, c.status,
               business_user.id AS business_user_id,
               business_user.username AS business_username,
               business_user.display_name AS business_display_name,
               agent_user.id AS agent_user_id,
               agent_user.username AS agent_username,
               agent_user.display_name AS agent_display_name,
               agent_user.status AS agent_status,
               COUNT(DISTINCT access.shipment_id) AS shipment_count
        FROM cp_customers c
        LEFT JOIN cp_users business_user ON business_user.id = c.responsible_agent_id
        LEFT JOIN cp_customer_employee_assignments assignment ON assignment.customer_id = c.id
        LEFT JOIN cp_users agent_user ON agent_user.id = assignment.employee_user_id
        LEFT JOIN cp_customer_shipment_access access ON access.customer_id = c.id
        WHERE c.status = 'ACTIVE'
          AND c.party_role IN ('SHIPPER', 'CONSIGNEE')
        GROUP BY c.id, c.public_id, c.username, c.display_name, c.client_code,
                 c.party_role, c.status, business_user.id, business_user.username,
                 business_user.display_name, agent_user.id, agent_user.username,
                 agent_user.display_name, agent_user.status
        ORDER BY c.created_at DESC, c.id DESC
        """,
        this::mapPlatformRow
    );
    long assigned = customers.stream().filter(row -> row.get("agentUserId") != null).count();
    return Map.of(
        "platform", "Shipment Track",
        "items", customers,
        "customerCount", customers.size(),
        "assignedCustomerCount", assigned,
        "unassignedCustomerCount", customers.size() - assigned
    );
  }

  public Map<String, Object> platformInfoPage(int page, int size) {
    int safePage = safePage(page);
    int safeSize = safeSize(size);
    List<Map<String, Object>> items = jdbcTemplate.query(
        """
        SELECT c.public_id, c.username, c.display_name, c.client_code, c.party_role, c.status,
               business_user.id AS business_user_id,
               business_user.username AS business_username,
               business_user.display_name AS business_display_name,
               agent_user.id AS agent_user_id,
               agent_user.username AS agent_username,
               agent_user.display_name AS agent_display_name,
               agent_user.status AS agent_status,
               COUNT(DISTINCT access.shipment_id) AS shipment_count
        FROM cp_customers c
        LEFT JOIN cp_users business_user ON business_user.id = c.responsible_agent_id
        LEFT JOIN cp_customer_employee_assignments assignment ON assignment.customer_id = c.id
        LEFT JOIN cp_users agent_user ON agent_user.id = assignment.employee_user_id
        LEFT JOIN cp_customer_shipment_access access ON access.customer_id = c.id
        WHERE c.status = 'ACTIVE'
          AND c.party_role IN ('SHIPPER', 'CONSIGNEE')
        GROUP BY c.id, c.public_id, c.username, c.display_name, c.client_code,
                 c.party_role, c.status, business_user.id, business_user.username,
                 business_user.display_name, agent_user.id, agent_user.username,
                 agent_user.display_name, agent_user.status
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ? OFFSET ?
        """,
        this::mapPlatformRow,
        safeSize,
        pageOffset(safePage, safeSize)
    );
    long total = count(
        """
        SELECT COUNT(*)
        FROM (
          SELECT c.id, assignment.employee_user_id
          FROM cp_customers c
          LEFT JOIN cp_customer_employee_assignments assignment ON assignment.customer_id = c.id
          WHERE c.status = 'ACTIVE'
            AND c.party_role IN ('SHIPPER', 'CONSIGNEE')
          GROUP BY c.id, assignment.employee_user_id
        ) platform_rows
        """
    );
    long customerCount = count(
        "SELECT COUNT(*) FROM cp_customers WHERE status = 'ACTIVE' AND party_role IN ('SHIPPER', 'CONSIGNEE')"
    );
    long assignedCustomerCount = count(
        """
        SELECT COUNT(DISTINCT assignment.customer_id)
        FROM cp_customer_employee_assignments assignment
        JOIN cp_customers customer ON customer.id = assignment.customer_id
        WHERE customer.status = 'ACTIVE'
          AND customer.party_role IN ('SHIPPER', 'CONSIGNEE')
        """
    );
    Map<String, Object> result = pageResult(items, safePage, safeSize, total);
    result.put("platform", "Shipment Track");
    result.put("customerCount", customerCount);
    result.put("assignedCustomerCount", assignedCustomerCount);
    result.put("unassignedCustomerCount", Math.max(0L, customerCount - assignedCustomerCount));
    return result;
  }

  public Map<String, Object> apiAuditPage(int page, int size) {
    int safePage = safePage(page);
    int safeSize = safeSize(size);
    long total = 0L;
    List<Map<String, Object>> items = List.of();
    try {
      total = count("SELECT COUNT(*) FROM cp_admin_audit_log WHERE action = 'API_REQUEST'");
      items = jdbcTemplate.query(
          """
          SELECT id, admin_user_id, username_snapshot, role_snapshot,
                 http_method, request_path, http_status, success, duration_ms,
                 request_id, ip_address, user_agent, created_at
          FROM cp_admin_audit_log
          WHERE action = 'API_REQUEST'
          ORDER BY created_at DESC, id DESC
          LIMIT ? OFFSET ?
          """,
          this::mapApiAuditRow,
          safeSize,
          pageOffset(safePage, safeSize)
      );
    } catch (DataAccessException ignored) {
      total = 0L;
      items = List.of();
    }
    return pageResult(items, safePage, safeSize, total);
  }

  private List<Map<String, Object>> recentApiAudit() {
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> items = (List<Map<String, Object>>) apiAuditPage(0, 20).get("items");
    return items;
  }

  private Map<String, Object> mapApiAuditRow(ResultSet rs, int rowNum) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", rs.getLong("id"));
    row.put("userId", nullableLong(rs, "admin_user_id"));
    row.put("username", rs.getString("username_snapshot"));
    row.put("role", rs.getString("role_snapshot"));
    row.put("method", rs.getString("http_method"));
    row.put("path", rs.getString("request_path"));
    row.put("status", rs.getObject("http_status"));
    row.put("success", rs.getObject("success"));
    row.put("durationMs", rs.getObject("duration_ms"));
    row.put("requestId", rs.getString("request_id"));
    row.put("ipAddress", rs.getString("ip_address"));
    row.put("userAgent", rs.getString("user_agent"));
    row.put("createdAt", stringTimestamp(rs, "created_at"));
    return row;
  }

  private Map<String, Object> mapPlatformRow(ResultSet rs, int rowNum) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("customerId", rs.getString("public_id"));
    row.put("customerUsername", rs.getString("username"));
    row.put("customerDisplayName", rs.getString("display_name"));
    row.put("clientCode", rs.getString("client_code"));
    row.put("partyRole", rs.getString("party_role"));
    row.put("customerStatus", rs.getString("status"));
    row.put("businessUserId", nullableLong(rs, "business_user_id"));
    row.put("businessUsername", rs.getString("business_username"));
    row.put("businessDisplayName", rs.getString("business_display_name"));
    row.put("agentUserId", nullableLong(rs, "agent_user_id"));
    row.put("agentUsername", rs.getString("agent_username"));
    row.put("agentDisplayName", rs.getString("agent_display_name"));
    row.put("agentStatus", rs.getString("agent_status"));
    row.put("shipmentCount", rs.getLong("shipment_count"));
    return row;
  }

  private Map<String, Object> findUser(Long userId) {
    List<Map<String, Object>> users = jdbcTemplate.query(
        """
        SELECT id, username, display_name, role, party_role, status, created_at, updated_at, last_login_at
        FROM cp_users
        WHERE id = ? AND status <> 'DELETED'
        """,
        this::mapUserRow,
        userId
    );
    if (users.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "User not found");
    }
    return users.get(0);
  }

  private Map<String, Object> findDevice(long deviceRowId) {
    List<Map<String, Object>> devices = jdbcTemplate.query(
        """
        SELECT d.id, d.user_id, u.username, u.display_name, d.device_id, d.device_name, d.mac_address,
               d.ip_address, d.user_agent, d.online, d.logged_in_at, d.last_seen_at, d.revoked_at
        FROM cp_login_devices d
        JOIN cp_users u ON u.id = d.user_id
        WHERE d.id = ?
        """,
        this::mapDeviceRow,
        deviceRowId
    );
    if (devices.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Device not found");
    }
    return devices.get(0);
  }

  private List<Map<String, Object>> recentEvents() {
    return jdbcTemplate.query(
        """
        SELECT id, user_id, username, event_type, device_id, ip_address, message, created_at
        FROM cp_login_events
        ORDER BY created_at DESC, id DESC
        LIMIT 20
        """,
        (rs, rowNum) -> {
          Map<String, Object> row = new LinkedHashMap<>();
          row.put("id", rs.getLong("id"));
          row.put("userId", nullableLong(rs, "user_id"));
          row.put("username", rs.getString("username"));
          row.put("eventType", rs.getString("event_type"));
          row.put("deviceId", rs.getString("device_id"));
          row.put("ipAddress", rs.getString("ip_address"));
          row.put("message", rs.getString("message"));
          row.put("createdAt", stringTimestamp(rs, "created_at"));
          return row;
        }
    );
  }

  private void audit(Long adminId, String action, String targetType, Long targetId, String detail, String ip) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (admin_user_id, action, target_type, target_id, detail, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        adminId,
        action,
        targetType,
        targetId,
        ClientInfo.trim(detail, 512),
        ClientInfo.trim(ip, 64)
    );
  }

  private long count(String sql, Object... arguments) {
    Long value = jdbcTemplate.queryForObject(sql, Long.class, arguments);
    return value == null ? 0 : value;
  }

  private int safePage(int page) {
    return Math.max(0, page);
  }

  private int safeSize(int size) {
    return Math.max(1, Math.min(100, size));
  }

  private long pageOffset(int page, int size) {
    return (long) page * size;
  }

  private Map<String, Object> pageResult(
      List<Map<String, Object>> items,
      int page,
      int pageSize,
      long total
  ) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("items", items);
    result.put("page", page);
    result.put("pageSize", pageSize);
    result.put("total", total);
    return result;
  }

  private String normalizeRole(String role, String fallback) {
    String value = role == null || role.isBlank() ? fallback : role.trim().toUpperCase();
    if (!"ADMIN".equals(value) && !"OVERSEA_AGENT".equals(value) && !"BUSINESS".equals(value)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Role must be ADMIN, BUSINESS, or OVERSEA_AGENT");
    }
    return value;
  }

  private void ensureSingleBusinessAccount(String role, Long excludedUserId) {
    if (!"BUSINESS".equals(role)) return;
    Long count = excludedUserId == null
        ? jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM cp_users WHERE role = 'BUSINESS' AND status <> 'DELETED'",
            Long.class
        )
        : jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM cp_users WHERE role = 'BUSINESS' AND status <> 'DELETED' AND id <> ?",
            Long.class,
            excludedUserId
        );
    if (count != null && count > 0) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "Only one business operator account is allowed"
      );
    }
  }

  private String normalizeStatus(String status, String fallback) {
    String value = status == null || status.isBlank() ? fallback : status.trim().toUpperCase();
    if (!"ACTIVE".equals(value) && !"DISABLED".equals(value)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Status must be ACTIVE or DISABLED");
    }
    return value;
  }

  private String normalizePartyRole(String partyRole, String systemRole, String fallback) {
    return "AGENT";
  }

  private String valueOrExisting(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : ClientInfo.trim(value, 80);
  }

  private String deletedUsername(String accountType, long id) {
    String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    return "deleted_" + accountType + "_" + id + "_" + suffix;
  }

  private void reassignDeletedBusinessScope(long newBusinessUserId) {
    List<Long> deletedBusinessIds = jdbcTemplate.query(
        "SELECT id FROM cp_users WHERE role = 'BUSINESS' AND status = 'DELETED' AND id <> ?",
        (rs, rowNumber) -> rs.getLong(1),
        newBusinessUserId
    );
    for (Long deletedBusinessId : deletedBusinessIds) {
      jdbcTemplate.update(
          """
          UPDATE cp_customers
          SET responsible_agent_id = ?, updated_at = CURRENT_TIMESTAMP(6)
          WHERE responsible_agent_id = ? AND status <> 'DELETED'
          """,
          newBusinessUserId,
          deletedBusinessId
      );
      jdbcTemplate.update(
          """
          UPDATE cp_shipments
          SET responsible_agent_id = ?, updated_at = CURRENT_TIMESTAMP(6)
          WHERE responsible_agent_id = ?
          """,
          newBusinessUserId,
          deletedBusinessId
      );
    }
  }

  private Map<String, Object> mapUserRow(ResultSet rs, int rowNum) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", rs.getLong("id"));
    row.put("username", rs.getString("username"));
    row.put("displayName", rs.getString("display_name"));
    row.put("role", rs.getString("role"));
    row.put("partyRole", rs.getString("party_role"));
    row.put("status", rs.getString("status"));
    row.put("createdAt", stringTimestamp(rs, "created_at"));
    row.put("updatedAt", stringTimestamp(rs, "updated_at"));
    row.put("lastLoginAt", stringTimestamp(rs, "last_login_at"));
    return row;
  }

  private Map<String, Object> mapDeviceRow(ResultSet rs, int rowNum) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", rs.getLong("id"));
    row.put("userId", rs.getLong("user_id"));
    row.put("username", rs.getString("username"));
    row.put("displayName", rs.getString("display_name"));
    row.put("deviceId", rs.getString("device_id"));
    row.put("deviceName", rs.getString("device_name"));
    row.put("macAddress", rs.getString("mac_address"));
    row.put("ipAddress", rs.getString("ip_address"));
    row.put("userAgent", rs.getString("user_agent"));
    row.put("online", rs.getBoolean("online"));
    row.put("loggedInAt", stringTimestamp(rs, "logged_in_at"));
    row.put("lastSeenAt", stringTimestamp(rs, "last_seen_at"));
    row.put("revokedAt", stringTimestamp(rs, "revoked_at"));
    return row;
  }

  private Long nullableLong(ResultSet rs, String column) throws SQLException {
    long value = rs.getLong(column);
    return rs.wasNull() ? null : value;
  }

  private String stringTimestamp(ResultSet rs, String column) throws SQLException {
    Timestamp timestamp = rs.getTimestamp(column);
    return timestamp == null ? null : timestamp.toInstant().toString();
  }
}
