package com.cargoplanner.backend.shipment;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import javax.sql.DataSource;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Applies the additive shipment schema to databases created before this module existed. */
@Component
@Order(0)
public class ShipmentSchemaInitializer implements ApplicationRunner {
  private final JdbcTemplate jdbcTemplate;

  public ShipmentSchemaInitializer(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public void run(ApplicationArguments args) {
    boolean mySql = isMySql();
    if (mySql) extendUserSchemaForMySql();
    for (String statement : statements()) {
      jdbcTemplate.execute(statement);
    }
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_file_storage_lock (id, lock_name)
        VALUES (1, 'shipment-file-capacity')
        ON DUPLICATE KEY UPDATE lock_name = VALUES(lock_name)
        """
    );
    if (mySql) upgradeCustomerFileSchemaForMySql();
  }

  private boolean isMySql() {
    DataSource dataSource = jdbcTemplate.getDataSource();
    if (dataSource == null) return false;
    try (Connection connection = dataSource.getConnection()) {
      String product = connection.getMetaData().getDatabaseProductName();
      return product != null && product.toLowerCase().contains("mysql");
    } catch (SQLException error) {
      throw new IllegalStateException("Cannot inspect database schema", error);
    }
  }

  private void extendUserSchemaForMySql() {
    List<String> columnTypes = jdbcTemplate.query(
        """
        SELECT COLUMN_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cp_users' AND COLUMN_NAME = 'role'
        """,
        (rs, rowNumber) -> rs.getString("COLUMN_TYPE")
    );
    if (!columnTypes.isEmpty() && !columnTypes.get(0).contains("'BUSINESS'")) {
      jdbcTemplate.execute(
          "ALTER TABLE cp_users MODIFY role ENUM('ADMIN','EMPLOYEE','BUSINESS') NOT NULL DEFAULT 'EMPLOYEE'"
      );
    }
    addColumnIfMissing(
        "cp_users",
        "party_role",
        "ALTER TABLE cp_users ADD COLUMN party_role VARCHAR(20) NOT NULL DEFAULT 'AGENT' AFTER role"
    );
    jdbcTemplate.update(
        "UPDATE cp_users SET party_role = 'AGENT' WHERE role IN ('ADMIN', 'BUSINESS') OR party_role IS NULL"
    );
  }

  private void upgradeCustomerFileSchemaForMySql() {
    addColumnIfMissing(
        "cp_shipment_files",
        "uploader_customer_id",
        "ALTER TABLE cp_shipment_files ADD COLUMN uploader_customer_id BIGINT NULL AFTER uploader_user_id"
    );
    addColumnIfMissing(
        "cp_shipment_files",
        "deleted_by_customer_id",
        "ALTER TABLE cp_shipment_files ADD COLUMN deleted_by_customer_id BIGINT NULL AFTER deleted_by"
    );
    addColumnIfMissing(
        "cp_shipment_files",
        "target_customer_id",
        "ALTER TABLE cp_shipment_files ADD COLUMN target_customer_id BIGINT NULL AFTER uploader_customer_id"
    );
    jdbcTemplate.execute("ALTER TABLE cp_shipment_files MODIFY uploader_user_id BIGINT NULL");
    addIndexIfMissing(
        "cp_shipment_files",
        "idx_cp_shipment_files_customer_time",
        "ALTER TABLE cp_shipment_files ADD INDEX idx_cp_shipment_files_customer_time (uploader_customer_id, created_at)"
    );
    addIndexIfMissing(
        "cp_shipment_files",
        "idx_cp_shipment_files_target_customer",
        "ALTER TABLE cp_shipment_files ADD INDEX idx_cp_shipment_files_target_customer (target_customer_id, status, created_at)"
    );
    addConstraintIfMissing(
        "cp_shipment_files",
        "fk_cp_shipment_files_customer",
        "ALTER TABLE cp_shipment_files ADD CONSTRAINT fk_cp_shipment_files_customer FOREIGN KEY (uploader_customer_id) REFERENCES cp_customers(id)"
    );
    addConstraintIfMissing(
        "cp_shipment_files",
        "fk_cp_shipment_files_target_customer",
        "ALTER TABLE cp_shipment_files ADD CONSTRAINT fk_cp_shipment_files_target_customer FOREIGN KEY (target_customer_id) REFERENCES cp_customers(id) ON DELETE SET NULL"
    );
    addConstraintIfMissing(
        "cp_shipment_files",
        "fk_cp_shipment_files_deleted_customer",
        "ALTER TABLE cp_shipment_files ADD CONSTRAINT fk_cp_shipment_files_deleted_customer FOREIGN KEY (deleted_by_customer_id) REFERENCES cp_customers(id) ON DELETE SET NULL"
    );
    addConstraintIfMissing(
        "cp_shipment_files",
        "ck_cp_shipment_files_one_uploader",
        "ALTER TABLE cp_shipment_files ADD CONSTRAINT ck_cp_shipment_files_one_uploader CHECK ((uploader_user_id IS NULL) <> (uploader_customer_id IS NULL))"
    );
    addColumnIfMissing(
        "cp_shipment_file_audit",
        "actor_customer_id",
        "ALTER TABLE cp_shipment_file_audit ADD COLUMN actor_customer_id BIGINT NULL AFTER actor_user_id"
    );
    addConstraintIfMissing(
        "cp_shipment_file_audit",
        "fk_cp_shipment_file_audit_customer",
        "ALTER TABLE cp_shipment_file_audit ADD CONSTRAINT fk_cp_shipment_file_audit_customer FOREIGN KEY (actor_customer_id) REFERENCES cp_customers(id) ON DELETE SET NULL"
    );
    addColumnIfMissing(
        "cp_customer_shipment_access",
        "relationship_role",
        "ALTER TABLE cp_customer_shipment_access ADD COLUMN relationship_role VARCHAR(20) NOT NULL DEFAULT 'SHIPPER' AFTER shipment_id"
    );
  }

  private void addColumnIfMissing(String table, String column, String ddl) {
    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
        """,
        Integer.class,
        table,
        column
    );
    if (count == null || count == 0) jdbcTemplate.execute(ddl);
  }

  private void addIndexIfMissing(String table, String index, String ddl) {
    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
        """,
        Integer.class,
        table,
        index
    );
    if (count == null || count == 0) jdbcTemplate.execute(ddl);
  }

  private void addConstraintIfMissing(String table, String constraint, String ddl) {
    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
        """,
        Integer.class,
        table,
        constraint
    );
    if (count == null || count == 0) jdbcTemplate.execute(ddl);
  }

  private List<String> statements() {
    return List.of(
        """
        CREATE TABLE IF NOT EXISTS cp_shipment_file_storage_lock (
          id TINYINT PRIMARY KEY,
          lock_name VARCHAR(64) NOT NULL UNIQUE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_shipments (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          public_id CHAR(36) NOT NULL UNIQUE,
          carrier_code VARCHAR(32) NOT NULL,
          current_snapshot_id BIGINT NULL,
          tracking_status VARCHAR(80) NULL,
          last_tracked_at DATETIME(6) NULL,
          fresh_until DATETIME(6) NULL,
          created_by BIGINT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX idx_cp_shipments_carrier_time (carrier_code, last_tracked_at),
          INDEX idx_cp_shipments_fresh_until (fresh_until),
          CONSTRAINT fk_cp_shipments_created_by FOREIGN KEY (created_by) REFERENCES cp_users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_shipment_references (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          shipment_id BIGINT NOT NULL,
          carrier_code VARCHAR(32) NOT NULL,
          reference_type VARCHAR(24) NOT NULL,
          reference_no_raw VARCHAR(160) NOT NULL,
          reference_no_normalized VARCHAR(128) NOT NULL,
          primary_reference TINYINT(1) NOT NULL DEFAULT 0,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          UNIQUE KEY uk_cp_shipment_reference (carrier_code, reference_type, reference_no_normalized),
          INDEX idx_cp_shipment_references_shipment (shipment_id),
          CONSTRAINT fk_cp_shipment_references_shipment FOREIGN KEY (shipment_id) REFERENCES cp_shipments(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_tracking_snapshots (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          shipment_id BIGINT NOT NULL,
          query_reference_type VARCHAR(24) NOT NULL,
          query_reference_no VARCHAR(128) NOT NULL,
          source_channel VARCHAR(32) NULL,
          snapshot_json LONGTEXT NOT NULL,
          strategy_json LONGTEXT NULL,
          payload_sha256 CHAR(64) NOT NULL,
          fetched_at DATETIME(6) NOT NULL,
          fresh_until DATETIME(6) NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX idx_cp_tracking_snapshots_shipment_time (shipment_id, fetched_at),
          INDEX idx_cp_tracking_snapshots_fresh_until (fresh_until),
          CONSTRAINT fk_cp_tracking_snapshots_shipment FOREIGN KEY (shipment_id) REFERENCES cp_shipments(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_shipment_participants (
          shipment_id BIGINT NOT NULL,
          user_id BIGINT NOT NULL,
          participant_role VARCHAR(24) NOT NULL,
          granted_by BIGINT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (shipment_id, user_id),
          INDEX idx_cp_shipment_participants_user (user_id, shipment_id),
          CONSTRAINT fk_cp_shipment_participants_shipment FOREIGN KEY (shipment_id) REFERENCES cp_shipments(id) ON DELETE CASCADE,
          CONSTRAINT fk_cp_shipment_participants_user FOREIGN KEY (user_id) REFERENCES cp_users(id) ON DELETE CASCADE,
          CONSTRAINT fk_cp_shipment_participants_granted_by FOREIGN KEY (granted_by) REFERENCES cp_users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_customers (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          public_id CHAR(36) NOT NULL UNIQUE,
          username VARCHAR(64) NOT NULL UNIQUE,
          display_name VARCHAR(80) NOT NULL,
          party_role VARCHAR(20) NOT NULL,
          customer_code_hash CHAR(64) NOT NULL UNIQUE,
          customer_code_prefix VARCHAR(16) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          created_by BIGINT NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX idx_cp_customers_creator_status (created_by, status, created_at),
          INDEX idx_cp_customers_code_prefix (customer_code_prefix),
          CONSTRAINT fk_cp_customers_created_by FOREIGN KEY (created_by) REFERENCES cp_users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_customer_sessions (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          customer_id BIGINT NOT NULL,
          session_token_hash CHAR(64) NOT NULL UNIQUE,
          expires_at DATETIME(6) NOT NULL,
          last_seen_at DATETIME(6) NOT NULL,
          revoked_at DATETIME(6) NULL,
          ip_address VARCHAR(64) NULL,
          user_agent VARCHAR(512) NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX idx_cp_customer_sessions_customer (customer_id, revoked_at, expires_at),
          INDEX idx_cp_customer_sessions_expiry (expires_at, revoked_at),
          CONSTRAINT fk_cp_customer_sessions_customer FOREIGN KEY (customer_id) REFERENCES cp_customers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_customer_shipment_access (
          customer_id BIGINT NOT NULL,
          shipment_id BIGINT NOT NULL,
          relationship_role VARCHAR(20) NOT NULL,
          assigned_by BIGINT NOT NULL,
          assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (customer_id, shipment_id),
          INDEX idx_cp_customer_shipment_access_shipment (shipment_id, customer_id),
          CONSTRAINT fk_cp_customer_shipment_customer FOREIGN KEY (customer_id) REFERENCES cp_customers(id) ON DELETE CASCADE,
          CONSTRAINT fk_cp_customer_shipment_shipment FOREIGN KEY (shipment_id) REFERENCES cp_shipments(id) ON DELETE CASCADE,
          CONSTRAINT fk_cp_customer_shipment_assigned_by FOREIGN KEY (assigned_by) REFERENCES cp_users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_shipment_files (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          public_id CHAR(36) NOT NULL UNIQUE,
          shipment_id BIGINT NOT NULL,
          uploader_user_id BIGINT NULL,
          uploader_customer_id BIGINT NULL,
          target_customer_id BIGINT NULL,
          uploader_role_snapshot VARCHAR(24) NOT NULL,
          document_category VARCHAR(32) NOT NULL DEFAULT 'RELATED',
          original_file_name VARCHAR(255) NOT NULL,
          stored_relative_path VARCHAR(512) NOT NULL UNIQUE,
          content_type VARCHAR(160) NOT NULL DEFAULT 'application/octet-stream',
          extension VARCHAR(20) NOT NULL DEFAULT '',
          size_bytes BIGINT NOT NULL,
          sha256 CHAR(64) NOT NULL,
          visibility VARCHAR(20) NOT NULL DEFAULT 'PARTIES',
          status VARCHAR(20) NOT NULL DEFAULT 'READY',
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          deleted_at DATETIME(6) NULL,
          deleted_by BIGINT NULL,
          deleted_by_customer_id BIGINT NULL,
          INDEX idx_cp_shipment_files_shipment_status_time (shipment_id, status, created_at),
          INDEX idx_cp_shipment_files_uploader_time (uploader_user_id, created_at),
          INDEX idx_cp_shipment_files_customer_time (uploader_customer_id, created_at),
          INDEX idx_cp_shipment_files_target_customer (target_customer_id, status, created_at),
          INDEX idx_cp_shipment_files_sha256 (shipment_id, sha256),
          CONSTRAINT fk_cp_shipment_files_shipment FOREIGN KEY (shipment_id) REFERENCES cp_shipments(id) ON DELETE CASCADE,
          CONSTRAINT fk_cp_shipment_files_uploader FOREIGN KEY (uploader_user_id) REFERENCES cp_users(id),
          CONSTRAINT fk_cp_shipment_files_customer FOREIGN KEY (uploader_customer_id) REFERENCES cp_customers(id),
          CONSTRAINT fk_cp_shipment_files_target_customer FOREIGN KEY (target_customer_id) REFERENCES cp_customers(id) ON DELETE SET NULL,
          CONSTRAINT fk_cp_shipment_files_deleted_by FOREIGN KEY (deleted_by) REFERENCES cp_users(id) ON DELETE SET NULL,
          CONSTRAINT fk_cp_shipment_files_deleted_customer FOREIGN KEY (deleted_by_customer_id) REFERENCES cp_customers(id) ON DELETE SET NULL,
          CONSTRAINT ck_cp_shipment_files_one_uploader CHECK ((uploader_user_id IS NULL) <> (uploader_customer_id IS NULL))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_shipment_file_audit (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          shipment_file_id BIGINT NOT NULL,
          shipment_id BIGINT NOT NULL,
          actor_user_id BIGINT NULL,
          actor_customer_id BIGINT NULL,
          action VARCHAR(32) NOT NULL,
          before_json LONGTEXT NULL,
          after_json LONGTEXT NULL,
          ip_address VARCHAR(64) NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX idx_cp_shipment_file_audit_file_time (shipment_file_id, created_at),
          INDEX idx_cp_shipment_file_audit_shipment_time (shipment_id, created_at),
          CONSTRAINT fk_cp_shipment_file_audit_file FOREIGN KEY (shipment_file_id) REFERENCES cp_shipment_files(id),
          CONSTRAINT fk_cp_shipment_file_audit_shipment FOREIGN KEY (shipment_id) REFERENCES cp_shipments(id),
          CONSTRAINT fk_cp_shipment_file_audit_actor FOREIGN KEY (actor_user_id) REFERENCES cp_users(id) ON DELETE SET NULL,
          CONSTRAINT fk_cp_shipment_file_audit_customer FOREIGN KEY (actor_customer_id) REFERENCES cp_customers(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """
    );
  }
}
