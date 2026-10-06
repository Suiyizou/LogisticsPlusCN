package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ClientInfo;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 客户域审计写入。
 *
 * <p>从 {@code BusinessCustomerService} 抽出的横切关注点。只写入接口级审计字段，
 * 不记录请求体、密码、令牌或 Cookie；detail / ip 截断规则与原实现一致。
 */
@Service
public class CustomerAuditService {
  private final JdbcTemplate jdbcTemplate;

  public CustomerAuditService(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public void record(
      AuthenticatedUser actor,
      String action,
      String targetType,
      long targetId,
      String detail,
      String ipAddress
  ) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (
          admin_user_id, action, target_type, target_id, detail, ip_address
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        actor.id(),
        action,
        targetType,
        targetId,
        ClientInfo.trim(detail, 512),
        ClientInfo.trim(ipAddress, 64)
    );
  }

  public void customer(
      AuthenticatedUser actor,
      String action,
      long targetId,
      String detail,
      String ipAddress
  ) {
    record(actor, action, "CUSTOMER", targetId, detail, ipAddress);
  }

  public void shipment(
      AuthenticatedUser actor,
      String action,
      long targetId,
      String detail,
      String ipAddress
  ) {
    record(actor, action, "SHIPMENT", targetId, detail, ipAddress);
  }
}
