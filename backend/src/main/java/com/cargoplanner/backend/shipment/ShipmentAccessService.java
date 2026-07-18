package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class ShipmentAccessService {
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
      return new ShipmentAccess(shipment.id(), shipment.publicId(), "ADMIN", true);
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
    boolean isShipmentCreator = user.isBusiness()
        && shipment.createdBy() != null
        && shipment.createdBy() == user.id();
    boolean managesCustomerRelationship = user.isBusiness() && managesCustomerRelationship(
        shipment.id(), user.id()
    );
    if (roles.isEmpty() && !managesCustomerRelationship && !isShipmentCreator) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Shipment file access has not been granted");
    }
    return new ShipmentAccess(
        shipment.id(),
        shipment.publicId(),
        roles.isEmpty() ? "OPERATOR" : roles.get(0),
        user.isBusiness()
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
    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*)
        FROM cp_customer_shipment_access a
        JOIN cp_customers c ON c.id = a.customer_id
        WHERE a.shipment_id = ? AND a.customer_id = ? AND c.status = 'ACTIVE'
        """,
        Integer.class,
        shipment.id(),
        customer.id()
    );
    if (count == null || count == 0) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Shipment has not been assigned to this customer");
    }
    return new ShipmentAccess(shipment.id(), shipment.publicId(), "CUSTOMER", false);
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

  private boolean managesCustomerRelationship(long shipmentId, long businessUserId) {
    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*)
        FROM cp_customer_shipment_access a
        JOIN cp_customers c ON c.id = a.customer_id
        WHERE a.shipment_id = ? AND c.created_by = ? AND c.status = 'ACTIVE'
        """,
        Integer.class,
        shipmentId,
        businessUserId
    );
    return count != null && count > 0;
  }

  public ShipmentIdentity requireShipment(String shipmentPublicId) {
    if (shipmentPublicId == null || shipmentPublicId.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment id is required");
    }
    List<ShipmentIdentity> shipments = jdbcTemplate.query(
        "SELECT id, public_id, created_by FROM cp_shipments WHERE public_id = ?",
        (rs, rowNumber) -> new ShipmentIdentity(
            rs.getLong("id"),
            rs.getString("public_id"),
            nullableLong(rs, "created_by")
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

  public record ShipmentIdentity(long id, String publicId, Long createdBy) {}

  public record ShipmentAccess(
      long shipmentId,
      String shipmentPublicId,
      String participantRole,
      boolean canManageFiles
  ) {}
}
