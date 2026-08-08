package com.cargoplanner.backend.shipment;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Additive schema kept separate from customer/auth migrations. */
@Component
@Order(1)
public class ShipmentAutoRefreshSchemaInitializer implements ApplicationRunner {
  private final JdbcTemplate jdbcTemplate;

  public ShipmentAutoRefreshSchemaInitializer(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public void run(ApplicationArguments args) {
    jdbcTemplate.execute("""
        CREATE TABLE IF NOT EXISTS cp_tracking_refresh_jobs (
          shipment_id BIGINT PRIMARY KEY,
          auto_refresh_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          refresh_scope VARCHAR(24) NOT NULL DEFAULT 'FULL',
          supplemental_sources VARCHAR(128) NULL,
          terminal_status VARCHAR(40) NULL,
          next_attempt_at DATETIME(6) NULL,
          lease_token CHAR(36) NULL,
          lease_until DATETIME(6) NULL,
          failure_count INT NOT NULL DEFAULT 0,
          last_error VARCHAR(500) NULL,
          last_attempt_at DATETIME(6) NULL,
          last_success_at DATETIME(6) NULL,
          created_at DATETIME(6) NOT NULL,
          updated_at DATETIME(6) NOT NULL,
          INDEX idx_cp_tracking_refresh_due (auto_refresh_enabled, next_attempt_at),
          INDEX idx_cp_tracking_refresh_lease (lease_until),
          CONSTRAINT fk_cp_tracking_refresh_shipment
            FOREIGN KEY (shipment_id) REFERENCES cp_shipments(id) ON DELETE CASCADE
        )
        """);
    addColumnIfMissing(
        "refresh_scope",
        "ALTER TABLE cp_tracking_refresh_jobs "
            + "ADD COLUMN refresh_scope VARCHAR(24) NOT NULL DEFAULT 'FULL' AFTER auto_refresh_enabled"
    );
    addColumnIfMissing(
        "supplemental_sources",
        "ALTER TABLE cp_tracking_refresh_jobs "
            + "ADD COLUMN supplemental_sources VARCHAR(128) NULL AFTER refresh_scope"
    );
  }

  private void addColumnIfMissing(String column, String sql) {
    try {
      jdbcTemplate.execute(sql);
    } catch (DataAccessException error) {
      String message = String.valueOf(error.getMostSpecificCause().getMessage()).toLowerCase();
      if (message.contains("duplicate column") || message.contains("already exists")) return;
      throw error;
    }
  }
}
