package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class ShipmentAccessService {
  public static final String OVERSEA_AGENT = "OVERSEA_AGENT";
  public static final String SHIPPER = "SHIPPER";
  public static final String CONSIGNEE = "CONSIGNEE";
  public static final Set<String> FILE_VISIBILITY_ROLES = Set.of(
      OVERSEA_AGENT, SHIPPER, CONSIGNEE
  );

  private final JdbcTemplate jdbcTemplate;

  public ShipmentAccessService(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public ShipmentAccess requireAccess(String shipmentPublicId, AuthenticatedUser user) {
    if (user == null) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Sign in is required to access shipment files");
    }
    ShipmentIdentity shipment = requireShipment(shipmentPublicId);
    if (user.isAdmin()) {
      return new ShipmentAccess(
          shipment.id(), shipment.publicId(), "ADMIN", FILE_VISIBILITY_ROLES, true, true
      );
    }
    List<String> roles = jdbcTemplate.query(
        """
        SELECT participant_role
        FROM cp_shipment_participants
        WHERE shipment_id = ? AND user_id = ?
        """,
        (rs, rowNumber) -> rs.getString("participant_role"),
        shipment.id(),
        user.id()
    );
    boolean isResponsibleAgent = user.isBusiness()
        && shipment.responsibleAgentId() != null
        && shipment.responsibleAgentId() == user.id();
    if (roles.isEmpty() && !isResponsibleAgent) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Shipment file access has not been granted");
    }
    Set<String> fileRoles = new LinkedHashSet<>();
    if (user.isBusiness()) {
      // An internal business/operator account represents the overseas agent party. Do not
      // leak the implementation-level BUSINESS/OPERATOR names into file visibility rules.
      fileRoles.add(OVERSEA_AGENT);
    } else {
      roles.stream().map(ShipmentAccessService::normalizeFileRole)
          .filter(role -> role != null)
          .forEach(fileRoles::add);
    }
    return new ShipmentAccess(
        shipment.id(),
        shipment.publicId(),
        roles.isEmpty() ? "OPERATOR" : roles.get(0),
        Set.copyOf(fileRoles),
        user.isBusiness(),
        false
    );
  }

  public ShipmentAccess requireCustomerAccess(
      String shipmentPublicId,
      CustomerPrincipal customer
  ) {
    if (customer == null) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Customer sign in is required");
    }
    ShipmentIdentity shipment = requireShipment(shipmentPublicId);
    List<String> relationshipRoles = jdbcTemplate.query(
        """
        SELECT a.relationship_role
        FROM cp_customer_shipment_access a
        JOIN cp_customers c ON c.id = a.customer_id
        WHERE a.shipment_id = ? AND a.customer_id = ? AND c.status = 'ACTIVE'
          AND a.publication_status = 'PUBLISHED'
        """,
        (rs, rowNumber) -> rs.getString("relationship_role"),
        shipment.id(),
        customer.id()
    );
    if (relationshipRoles.isEmpty()
        && OVERSEA_AGENT.equalsIgnoreCase(customer.partyRole())) {
      Integer linkedAccess = jdbcTemplate.queryForObject(
          """
          SELECT COUNT(*)
          FROM cp_oversea_agent_customers link
          JOIN cp_customers linked_customer ON linked_customer.id = link.customer_id
          JOIN cp_customer_shipment_access a ON a.customer_id = link.customer_id
          WHERE link.oversea_agent_customer_id = ?
            AND a.shipment_id = ?
            AND a.publication_status = 'PUBLISHED'
            AND linked_customer.status = 'ACTIVE'
          """,
          Integer.class,
          customer.id(), shipment.id()
      );
      if (linkedAccess != null && linkedAccess > 0) relationshipRoles = List.of(OVERSEA_AGENT);
    }
    if (relationshipRoles.isEmpty()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Shipment has not been assigned to this customer");
    }
    String fileRole = normalizeFileRole(relationshipRoles.get(0));
    if (fileRole == null) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Customer shipment role cannot access files");
    }
    return new ShipmentAccess(
        shipment.id(), shipment.publicId(), relationshipRoles.get(0), Set.of(fileRole), false, false
    );
  }

  public boolean hasAccess(String shipmentPublicId, AuthenticatedUser user) {
    if (user == null) return false;
    try {
      requireAccess(shipmentPublicId, user);
      return true;
    } catch (ApiException ignored) {
      return false;
    }
  }

  public boolean hasCustomerAccess(String shipmentPublicId, CustomerPrincipal customer) {
    if (customer == null) return false;
    try {
      requireCustomerAccess(shipmentPublicId, customer);
      return true;
    } catch (ApiException ignored) {
      return false;
    }
  }

  public ShipmentIdentity requireShipment(String shipmentPublicId) {
    if (shipmentPublicId == null || shipmentPublicId.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment id is required");
    }
    List<ShipmentIdentity> shipments = jdbcTemplate.query(
        "SELECT id, public_id, responsible_agent_id FROM cp_shipments WHERE public_id = ?",
        (rs, rowNumber) -> new ShipmentIdentity(
            rs.getLong("id"),
            rs.getString("public_id"),
            nullableLong(rs, "responsible_agent_id")
        ),
        shipmentPublicId.trim()
    );
    if (shipments.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Shipment not found");
    }
    return shipments.get(0);
  }

  private Long nullableLong(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
    long value = rs.getLong(column);
    return rs.wasNull() ? null : value;
  }

  static String normalizeFileRole(String value) {
    if (value == null || value.isBlank()) return null;
    String normalized = value.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
    if ("AGENT".equals(normalized) || "OVERSEAS_AGENT".equals(normalized)) {
      return OVERSEA_AGENT;
    }
    return FILE_VISIBILITY_ROLES.contains(normalized) ? normalized : null;
  }

  public record ShipmentIdentity(long id, String publicId, Long responsibleAgentId) {}

  public record ShipmentAccess(
      long shipmentId,
      String shipmentPublicId,
      String participantRole,
      Set<String> fileRoles,
      boolean canManageFiles,
      boolean administrative
  ) {}
}
