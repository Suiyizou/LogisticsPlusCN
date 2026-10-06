package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 客户档案查询与访问判定。
 *
 * <p>从 {@code BusinessCustomerService} 抽出的共享数据访问 + 权限判定：按角色返回可见客户、
 * 客户元数据投影、会话吊销。此前这些逻辑与 5000 行的业务 Service 混在一起，任何领域拆分都会
 * 形成循环依赖。本批只做“共享能力下沉”，业务事务仍留在各自的领域服务。
 */
@Service
public class CustomerLookupService {
  private final JdbcTemplate jdbcTemplate;
  private final CustomerAccessGuard accessGuard;

  public CustomerLookupService(JdbcTemplate jdbcTemplate, CustomerAccessGuard accessGuard) {
    this.jdbcTemplate = jdbcTemplate;
    this.accessGuard = accessGuard;
  }

  public String baseCustomerSelect() {
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

  public CustomerRecord requireManaged(String publicId, AuthenticatedUser actor) {
    accessGuard.requireManager(actor);
    List<CustomerRecord> records =
        actor.isAdmin()
            ? jdbcTemplate.query(
                baseCustomerSelect() + " WHERE c.public_id = ? AND c.status <> 'DELETED'",
                this::mapCustomer,
                publicId)
            : jdbcTemplate.query(
                baseCustomerSelect()
                    + " WHERE c.public_id = ? AND c.responsible_agent_id = ?"
                    + " AND c.status <> 'DELETED'",
                this::mapCustomer,
                publicId,
                actor.id());
    if (records.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Customer not found");
    return records.get(0);
  }

  public CustomerRecord requireTransferCustomer(String publicId, AuthenticatedUser actor) {
    accessGuard.requireTransferManager(actor);
    if (actor.isAdmin() || actor.isBusiness()) return requireManaged(publicId, actor);
    List<CustomerRecord> records =
        jdbcTemplate.query(
            baseCustomerSelect()
                + """
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
            actor.id());
    if (records.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Customer not found");
    return records.get(0);
  }

  public CustomerRecord requireAccessibleCustomer(String publicId, AuthenticatedUser actor) {
    accessGuard.requireOperationsReader(actor);
    List<CustomerRecord> records;
    if (actor.isAdmin()) {
      records =
          jdbcTemplate.query(
              baseCustomerSelect() + " WHERE c.public_id = ? AND c.status <> 'DELETED'",
              this::mapCustomer,
              publicId);
    } else if (actor.isBusiness()) {
      records =
          jdbcTemplate.query(
              baseCustomerSelect()
                  + " WHERE c.public_id = ? AND c.responsible_agent_id = ?"
                  + " AND c.status <> 'DELETED'",
              this::mapCustomer,
              publicId,
              actor.id());
    } else {
      records =
          jdbcTemplate.query(
              baseCustomerSelect()
                  + """
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
              actor.id());
    }
    if (records.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Customer not found");
    return records.get(0);
  }

  public CustomerRecord mapCustomer(ResultSet rs, int rowNumber) throws SQLException {
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
        rs.getLong("shipment_count"));
  }

  public Map<String, Object> customerMetadata(CustomerRecord record) {
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

  public Map<String, Object> customerMetadataWithEmployee(CustomerRecord record) {
    Map<String, Object> value = customerMetadata(record);
    List<Map<String, Object>> assignments =
        jdbcTemplate.query(
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
            record.id());
    Map<String, Object> assignment = assignments.isEmpty() ? null : assignments.get(0);
    value.put("overseaAgentUserId", assignment == null ? null : assignment.get("id"));
    value.put("overseaAgentUsername", assignment == null ? null : assignment.get("username"));
    value.put("overseaAgentDisplayName", assignment == null ? null : assignment.get("displayName"));
    return value;
  }

  public void revokeSessions(long customerId) {
    jdbcTemplate.update(
        """
        UPDATE cp_customer_sessions
        SET revoked_at = ?
        WHERE (customer_id = ? OR scope_customer_id = ?)
          AND revoked_at IS NULL
        """,
        Timestamp.from(Instant.now()),
        customerId,
        customerId);
  }

  private Long nullableLong(ResultSet rs, String column) throws SQLException {
    long value = rs.getLong(column);
    return rs.wasNull() ? null : value;
  }

  private String instantString(ResultSet rs, String column) throws SQLException {
    Timestamp value = rs.getTimestamp(column);
    return value == null ? null : value.toInstant().toString();
  }
}
