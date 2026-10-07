package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 客户与票单绑定的关系角色约束。
 *
 * <p>“同一票单只能有一个 SHIPPER / CONSIGNEE 客户”的校验同时被客户建档（校验既有绑定）、
 * 票单绑定/解绑和客户端匹配使用，抽成共享策略组件，避免跨服务复制。
 */
@Component
public class CustomerShipmentAccessPolicy {
  private final JdbcTemplate jdbcTemplate;

  public CustomerShipmentAccessPolicy(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  /** 校验目标票单是否已存在同角色的其他客户。 */
  public void ensureShipmentRoleAvailable(long shipmentId, long customerId, String role) {
    if (!CustomerLookupService.UNIQUE_PARTY_ROLES.contains(role)) return;
    Integer conflictCount =
        jdbcTemplate.queryForObject(
            """
            SELECT COUNT(*) FROM cp_customer_shipment_access
            WHERE shipment_id = ? AND relationship_role = ? AND customer_id <> ?
            """,
            Integer.class,
            shipmentId,
            role,
            customerId);
    if (conflictCount != null && conflictCount > 0) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment already has a " + role + " customer");
    }
  }

  /** 客户身份变更时，校验其所有已有绑定是否仍满足角色唯一性。 */
  public void ensureRoleAvailableForExistingBindings(long customerId, String role) {
    if (!CustomerLookupService.UNIQUE_PARTY_ROLES.contains(role)) return;
    Integer conflictCount =
        jdbcTemplate.queryForObject(
            """
            SELECT COUNT(*)
            FROM cp_customer_shipment_access own_access
            JOIN cp_customer_shipment_access other_access
              ON other_access.shipment_id = own_access.shipment_id
             AND other_access.customer_id <> own_access.customer_id
             AND other_access.relationship_role = ?
            WHERE own_access.customer_id = ?
            """,
            Integer.class,
            role,
            customerId);
    if (conflictCount != null && conflictCount > 0) {
      throw new ApiException(
          HttpStatus.CONFLICT, "One or more shipments already have a " + role + " customer");
    }
  }
}
