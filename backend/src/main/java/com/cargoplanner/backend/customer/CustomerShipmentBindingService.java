package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import com.cargoplanner.backend.shipment.ShipmentBatchDeleteRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Locale;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 客户-票单绑定、发布与解绑。
 *
 * <p>从 {@code BusinessCustomerService} 拆出：为单个/批量票单建立客户绑定、删除票单、
 * 设置发布状态、解绑，以及客户侧票单列表。运单解析/权限/行锁走 {@link ShipmentLookupService}，
 * 角色唯一性走 {@link CustomerShipmentAccessPolicy}，代理范围同步走 {@link OverseaAgentService}。
 */
@Service
public class CustomerShipmentBindingService {
  private final JdbcTemplate jdbcTemplate;
  private final CustomerAccessGuard accessGuard;
  private final CustomerLookupService lookupService;
  private final ShipmentLookupService shipmentLookupService;
  private final CustomerShipmentAccessPolicy accessPolicy;
  private final OverseaAgentService overseaAgentService;
  private final CustomerAuditService auditService;
  private final ObjectMapper objectMapper;

  public CustomerShipmentBindingService(
      JdbcTemplate jdbcTemplate,
      CustomerAccessGuard accessGuard,
      CustomerLookupService lookupService,
      ShipmentLookupService shipmentLookupService,
      CustomerShipmentAccessPolicy accessPolicy,
      OverseaAgentService overseaAgentService,
      CustomerAuditService auditService,
      ObjectMapper objectMapper
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.accessGuard = accessGuard;
    this.lookupService = lookupService;
    this.shipmentLookupService = shipmentLookupService;
    this.accessPolicy = accessPolicy;
    this.overseaAgentService = overseaAgentService;
    this.auditService = auditService;
    this.objectMapper = objectMapper;
  }

  public Map<String, Object> listShipments(String customerPublicId, AuthenticatedUser actor) {
    CustomerRecord customer = lookupService.requireAccessibleCustomer(customerPublicId, actor);
    List<Map<String, Object>> items = jdbcTemplate.query(
        shipmentLookupService.shipmentBindingSelect()
            + " WHERE a.customer_id = ? ORDER BY a.assigned_at DESC, s.id DESC",
        shipmentLookupService::mapBinding,
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
    CustomerRecord customer = lookupService.requireManaged(customerPublicId, actor);
    ShipmentRecord shipment = shipmentLookupService.resolveShipment(request);
    shipmentLookupService.requireShipmentAssignmentAuthority(shipment, actor);
    lookupService.lockShipment(shipment.id());
    accessPolicy.ensureShipmentRoleAvailable(shipment.id(), customer.id(), customer.partyRole());
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
    overseaAgentService.syncScopeForShipment(customer.id(), shipment.id());
    overseaAgentService.syncEmployeeAgentParticipant(customer.id(), shipment.id(), actor.id());
    auditService.customer(
        actor,
        "BIND_CUSTOMER_SHIPMENT",
        customer.id(),
        "Bound shipment " + shipment.publicId(),
        ipAddress
    );
    return shipmentLookupService.requireBinding(customer.id(), shipment.publicId());
  }

  @Transactional
  public Map<String, Object> bindShipments(
      String customerPublicId,
      CustomerShipmentBatchBindingRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = lookupService.requireManaged(customerPublicId, actor);
    List<String> shipmentIds = ShipmentReferences.normalizeShipmentIds(
        request == null ? null : request.shipmentIds()
    );
    int bound = 0;
    int skipped = 0;
    List<String> boundShipmentIds = new ArrayList<>();
    for (String shipmentPublicId : shipmentIds) {
      ShipmentRecord shipment = shipmentLookupService.requireShipment(shipmentPublicId);
      shipmentLookupService.requireShipmentAssignmentAuthority(shipment, actor);
      lookupService.lockShipment(shipment.id());
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
      accessPolicy.ensureShipmentRoleAvailable(shipment.id(), customer.id(), customer.partyRole());
      jdbcTemplate.update(
          """
          INSERT INTO cp_customer_shipment_access (
            customer_id, shipment_id, relationship_role, publication_status, assigned_by
          ) VALUES (?, ?, ?, 'DRAFT', ?)
          """,
          customer.id(), shipment.id(), customer.partyRole(), actor.id()
      );
      overseaAgentService.syncScopeForShipment(customer.id(), shipment.id());
      overseaAgentService.syncEmployeeAgentParticipant(customer.id(), shipment.id(), actor.id());
      bound++;
      boundShipmentIds.add(shipment.publicId());
    }
    auditService.customer(
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
    accessGuard.requireManager(actor);
    List<String> shipmentIds = ShipmentReferences.normalizeShipmentIds(
        request == null ? null : request.shipmentIds()
    );
    List<ShipmentRecord> shipmentsToDelete = new ArrayList<>();
    for (String shipmentPublicId : shipmentIds) {
      ShipmentRecord shipment = shipmentLookupService.requireShipment(shipmentPublicId);
      shipmentLookupService.requireShipmentAssignmentAuthority(shipment, actor);
      shipmentsToDelete.add(shipment);
    }
    for (ShipmentRecord shipment : shipmentsToDelete) {
      auditService.shipment(
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

  @Transactional
  public Map<String, Object> setShipmentPublication(
      String customerPublicId,
      String shipmentPublicId,
      ShipmentPublicationRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = lookupService.requireManaged(customerPublicId, actor);
    ShipmentRecord shipment = shipmentLookupService.requireShipment(shipmentPublicId);
    shipmentLookupService.requireShipmentAssignmentAuthority(shipment, actor);
    boolean published = request != null && Boolean.TRUE.equals(request.published());
    shipmentLookupService.requireBinding(customer.id(), shipment.publicId());
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
    overseaAgentService.syncScopeForShipment(customer.id(), shipment.id());
    overseaAgentService.syncEmployeeAgentParticipant(customer.id(), shipment.id(), actor.id());
    auditService.customer(
        actor,
        published ? "PUBLISH_CUSTOMER_SHIPMENT" : "WITHDRAW_CUSTOMER_SHIPMENT",
        customer.id(),
        (published ? "Published shipment " : "Withdrew shipment ") + shipment.publicId(),
        ipAddress
    );
    return shipmentLookupService.requireBinding(customer.id(), shipment.publicId());
  }

  @Transactional
  public Map<String, Object> unbindShipment(
      String customerPublicId,
      String shipmentPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = lookupService.requireManaged(customerPublicId, actor);
    ShipmentRecord shipment = shipmentLookupService.requireShipment(shipmentPublicId);
    int affected = jdbcTemplate.update(
        "DELETE FROM cp_customer_shipment_access WHERE customer_id = ? AND shipment_id = ?",
        customer.id(),
        shipment.id()
    );
    if (affected == 0) throw new ApiException(HttpStatus.NOT_FOUND, "Customer shipment binding not found");
    overseaAgentService.syncScopeForShipment(customer.id(), shipment.id());
    overseaAgentService.syncEmployeeAgentParticipant(customer.id(), shipment.id(), actor.id());
    auditService.customer(
        actor,
        "UNBIND_CUSTOMER_SHIPMENT",
        customer.id(),
        "Unbound shipment " + shipment.publicId(),
        ipAddress
    );
    return Map.of("unbound", true, "shipmentId", shipment.publicId());
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
}
