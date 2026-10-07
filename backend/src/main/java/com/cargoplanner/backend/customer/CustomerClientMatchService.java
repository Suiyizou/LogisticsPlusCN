package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 运单导入的客户端匹配队列：待匹配列表与人工解决。
 */
@Service
public class CustomerClientMatchService {
  private final JdbcTemplate jdbcTemplate;
  private final CustomerAccessGuard accessGuard;
  private final ShipmentLookupService shipmentLookupService;
  private final CustomerShipmentAccessPolicy accessPolicy;
  private final OverseaAgentService overseaAgentService;
  private final CustomerAuditService auditService;
  private final CustomerLookupService lookupService;

  public CustomerClientMatchService(
      JdbcTemplate jdbcTemplate,
      CustomerAccessGuard accessGuard,
      ShipmentLookupService shipmentLookupService,
      CustomerShipmentAccessPolicy accessPolicy,
      OverseaAgentService overseaAgentService,
      CustomerAuditService auditService,
      CustomerLookupService lookupService
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.accessGuard = accessGuard;
    this.shipmentLookupService = shipmentLookupService;
    this.accessPolicy = accessPolicy;
    this.overseaAgentService = overseaAgentService;
    this.auditService = auditService;
    this.lookupService = lookupService;
  }

  public Map<String, Object> listPendingClientMatches(AuthenticatedUser actor) {
    accessGuard.requireManager(actor);
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
    accessGuard.requireManager(actor);
    if (request == null || request.customerId() == null || request.customerId().isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Customer is required to resolve the Client Code match");
    }
    CustomerRecord customer = lookupService.requireManaged(request.customerId(), actor);
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
    accessPolicy.ensureShipmentRoleAvailable(match.shipmentId(), customer.id(), customer.partyRole());
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
    overseaAgentService.syncScopeForShipment(customer.id(), match.shipmentId());
    overseaAgentService.syncEmployeeAgentParticipant(customer.id(), match.shipmentId(), actor.id());
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
    auditService.customer(actor, "RESOLVE_CLIENT_CODE_MATCH", customer.id(),
        "Bound pending shipment " + match.shipmentPublicId(), ipAddress);
    return shipmentLookupService.requireBinding(customer.id(), match.shipmentPublicId());
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
    value.put("createdAt", ShipmentRowMappers.instantString(rs, "created_at"));
    value.put("updatedAt", ShipmentRowMappers.instantString(rs, "updated_at"));
    return value;
  }

private record PendingClientMatch(long id, long shipmentId, String shipmentPublicId) {}
}
