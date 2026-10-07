package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 票单查询与访问判定（共享）。
 *
 * <p>从 {@code BusinessCustomerService} 抽出的运单解析/行锁/绑定读取：按 public_id 或引用号
 * 解析运单、读取客户-票单绑定与可绑定票单、校验票单操作权限。绑定、创建、变更与客户端匹配
 * 等域服务共用，避免重复与循环依赖。
 */
@Service
public class ShipmentLookupService {
  public final JdbcTemplate jdbcTemplate;

  public ShipmentLookupService(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public ShipmentRecord resolveShipment(CustomerShipmentBindingRequest request) {
    if (request == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment binding is required");
    if (request.shipmentId() != null && !request.shipmentId().isBlank()) {
      return requireShipment(request.shipmentId());
    }
    String carrier = ShipmentReferences.normalizeCode(request.carrier(), "COSCO");
    String type = ShipmentReferences.normalizeCode(request.referenceType(), "BOOKING");
    if (!"BOOKING".equals(type)) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Shipment binding must use the booking number"
      );
    }
    String reference = ShipmentReferences.normalizeReference(request.referenceNo());
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

  public ShipmentRecord findShipmentByReference(
      String carrier,
      String referenceType,
      String referenceNo
  ) {
    String normalized = ShipmentReferences.normalizeReference(referenceNo);
    boolean sharedCoscoIdentity = ShipmentReferences.isSharedCoscoNumericIdentity(
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

  public ShipmentRecord requireShipment(String publicId) {
    List<ShipmentRecord> shipments = jdbcTemplate.query(
        "SELECT id, public_id, carrier_code, responsible_agent_id FROM cp_shipments WHERE public_id = ?",
        this::mapShipment,
        publicId == null ? null : publicId.trim()
    );
    if (shipments.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Shipment not found");
    return shipments.get(0);
  }

  public Map<String, Object> requireBinding(long customerId, String shipmentPublicId) {
    List<Map<String, Object>> values = jdbcTemplate.query(
        shipmentBindingSelect() + " WHERE a.customer_id = ? AND s.public_id = ?",
        this::mapBinding,
        customerId,
        shipmentPublicId
    );
    if (values.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Customer shipment binding not found");
    return values.get(0);
  }

  public Map<String, Object> requireAvailableShipment(
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

  public String shipmentBindingSelect() {
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

  public String availableShipmentSelect() {
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

  public ShipmentRecord mapShipment(ResultSet rs, int rowNumber) throws SQLException {
    return new ShipmentRecord(
        rs.getLong("id"),
        rs.getString("public_id"),
        rs.getString("carrier_code"),
        nullableLong(rs, "responsible_agent_id")
    );
  }

  public void requireShipmentAssignmentAuthority(
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

  public Map<String, Object> mapBinding(ResultSet rs, int rowNumber) throws SQLException {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("shipmentId", rs.getString("shipment_public_id"));
    value.put("carrier", rs.getString("carrier_code"));
    value.put("referenceType", rs.getString("reference_type"));
    value.put("referenceNo", rs.getString("reference_no_raw"));
    value.put("trackingStatus", rs.getString("tracking_status"));
    value.put("note", rs.getString("business_note"));
    value.put("lastTrackedAt", ShipmentRowMappers.instantString(rs, "last_tracked_at"));
    value.put("freshUntil", ShipmentRowMappers.instantString(rs, "fresh_until"));
    value.put("createdAt", ShipmentRowMappers.instantString(rs, "created_at"));
    value.put("updatedAt", ShipmentRowMappers.instantString(rs, "updated_at"));
    value.put("relationshipRole", rs.getString("relationship_role"));
    value.put("publicationStatus", rs.getString("publication_status"));
    value.put("publishedAt", ShipmentRowMappers.instantString(rs, "published_at"));
    value.put("publishedBy", nullableLong(rs, "published_by"));
    value.put("assignedAt", ShipmentRowMappers.instantString(rs, "assigned_at"));
    value.put("assignedBy", nullableLong(rs, "assigned_by"));
    value.put("assignedByDisplayName", rs.getString("assigned_by_display_name"));
    ShipmentRowMappers.putRefreshOutcome(value, rs);
    return value;
  }

  public Map<String, Object> mapAvailableShipment(ResultSet rs, int rowNumber) throws SQLException {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("shipmentId", rs.getString("shipment_public_id"));
    value.put("carrier", rs.getString("carrier_code"));
    value.put("referenceType", rs.getString("reference_type"));
    value.put("referenceNo", rs.getString("reference_no_raw"));
    value.put("trackingStatus", rs.getString("tracking_status"));
    value.put("note", rs.getString("business_note"));
    value.put("lastTrackedAt", ShipmentRowMappers.instantString(rs, "last_tracked_at"));
    value.put("createdAt", ShipmentRowMappers.instantString(rs, "created_at"));
    value.put("updatedAt", ShipmentRowMappers.instantString(rs, "updated_at"));
    ShipmentRowMappers.putRefreshOutcome(value, rs);
    value.put("customerCount", rs.getLong("customer_count"));
    List<String> boundRoles = new java.util.ArrayList<>();
    if (rs.getLong("shipper_count") > 0) boundRoles.add("SHIPPER");
    if (rs.getLong("consignee_count") > 0) boundRoles.add("CONSIGNEE");
    if (rs.getLong("agent_count") > 0) boundRoles.add("OVERSEA_AGENT");
    value.put("boundRoles", boundRoles);
    return value;
  }

  private Long nullableLong(ResultSet rs, String column) throws SQLException {
    long value = rs.getLong(column);
    return rs.wasNull() ? null : value;
  }
}
