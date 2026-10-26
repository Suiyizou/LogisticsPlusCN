package com.cargoplanner.backend.auth;

import com.cargoplanner.backend.common.ClientInfo;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Persists rejected authentication attempts after the account transaction releases its locks. */
@Service
public class AuthFailureAuditService {
  private final JdbcTemplate jdbc;
  private final TransactionTemplate transaction;

  public AuthFailureAuditService(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
    this.jdbc = jdbc;
    this.transaction = new TransactionTemplate(transactionManager);
    this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  public void record(
      Long userId, String username, String eventType, String deviceId,
      String ip, String userAgent, String message
  ) {
    Runnable persist = () -> transaction.executeWithoutResult(ignored -> jdbc.update(
        """
        INSERT INTO cp_login_events (user_id, username, event_type, device_id, ip_address, user_agent, message)
        SELECT u.id, ?, ?, ?, ?, ?, ?
        FROM (SELECT 1 AS marker) attempt
        LEFT JOIN cp_users u ON u.id = ?
        """,
        ClientInfo.trim(username, 64), eventType,
        ClientInfo.trim(deviceId == null || deviceId.isBlank() ? null : deviceId, 128),
        ClientInfo.trim(ip, 64), ClientInfo.trim(userAgent, 512), ClientInfo.trim(message, 255), userId
    ));
    if (TransactionSynchronizationManager.isActualTransactionActive()
        && TransactionSynchronizationManager.isSynchronizationActive()) {
      // Writing from REQUIRES_NEW before completion would block on the login transaction's
      // SELECT FOR UPDATE: cp_login_events has a foreign key back to that locked account.
      TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
        @Override
        public void afterCompletion(int status) {
          persist.run();
        }
      });
    } else {
      persist.run();
    }
  }
}
