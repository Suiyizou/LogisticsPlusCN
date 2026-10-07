package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 客户到海外代理的分配/转移。
 *
 * <p>从 {@code BusinessCustomerService} 拆出：把客户批量分配给内部海外代理账号或遗留
 * 代理客户，保留票单绑定与历史，并同步代理范围与票单参与人。事务边界与原实现一致
 * （整体 {@code @Transactional}）。
 */
@Service
public class CustomerTransferService {
  private final JdbcTemplate jdbcTemplate;
  private final CustomerAccessGuard accessGuard;
  private final CustomerLookupService lookupService;
  private final OverseaAgentService overseaAgentService;
  private final CustomerAuditService auditService;

  public CustomerTransferService(
      JdbcTemplate jdbcTemplate,
      CustomerAccessGuard accessGuard,
      CustomerLookupService lookupService,
      OverseaAgentService overseaAgentService,
      CustomerAuditService auditService
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.accessGuard = accessGuard;
    this.lookupService = lookupService;
    this.overseaAgentService = overseaAgentService;
    this.auditService = auditService;
  }

  @Transactional
  public Map<String, Object> transferCustomers(
      CustomerTransferRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireTransferManager(actor);
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
      lookupService.lockCustomer(customerId);
      CustomerRecord customer = lookupService.requireTransferCustomer(customerId, actor);
      if (!CustomerLookupService.UNIQUE_PARTY_ROLES.contains(customer.partyRole())) {
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
          overseaAgentService.syncEmployeeAgentParticipant(customer.id(), shipmentId, actor.id());
          if (transfer.previousAgentId() != null
              && transfer.previousAgentId() != target.id()) {
            overseaAgentService.removeUnusedEmployeeAgentParticipant(shipmentId, transfer.previousAgentId());
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
        overseaAgentService.syncScopesForCustomer(customer.id());
      }
      auditService.customer(
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
}
