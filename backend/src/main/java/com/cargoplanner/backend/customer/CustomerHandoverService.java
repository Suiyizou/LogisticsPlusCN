package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 客户交接领域服务。
 *
 * <p>从 {@code BusinessCustomerService} 拆出的直接交接与审批交接：申请、列表、详情、
 * 批准、驳回，以及交接请求查询/校验/审计。共享能力通过 {@link CustomerAccessGuard}、
 * {@link CustomerAuditService}、{@link CustomerLookupService} 组合注入，SQL 暂保留
 * JdbcTemplate（后续按 T05 迁到 Mapper）。
 *
 * <p>事务边界与原实现一致：直接交接、批准、驳回仍为 {@code @Transactional}。
 */
@Service
public class CustomerHandoverService {
  private final JdbcTemplate jdbcTemplate;
  private final CustomerAccessGuard accessGuard;
  private final CustomerAuditService auditService;
  private final CustomerLookupService lookupService;

  public CustomerHandoverService(
      JdbcTemplate jdbcTemplate,
      CustomerAccessGuard accessGuard,
      CustomerAuditService auditService,
      CustomerLookupService lookupService
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.accessGuard = accessGuard;
    this.auditService = auditService;
    this.lookupService = lookupService;
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
      lookupService.lockCustomer(customerId);
      CustomerRecord customer = lookupService.requireManaged(customerId, actor);
      if (!CustomerLookupService.UNIQUE_PARTY_ROLES.contains(customer.partyRole())) {
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
      auditService.customer(
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
    accessGuard.requireManager(actor);
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
    accessGuard.requireManager(actor);
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
    accessGuard.requireAdministrator(admin);
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
      if (!CustomerLookupService.UNIQUE_PARTY_ROLES.contains(approvalTarget.partyRole())) {
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
      auditService.customer(
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
    accessGuard.requireAdministrator(admin);
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

  private Long nullableLong(ResultSet rs, String column) throws SQLException {
    long value = rs.getLong(column);
    return rs.wasNull() ? null : value;
  }

  private String instantString(ResultSet rs, String column) throws SQLException {
    Timestamp value = rs.getTimestamp(column);
    return value == null ? null : value.toInstant().toString();
  }
}
