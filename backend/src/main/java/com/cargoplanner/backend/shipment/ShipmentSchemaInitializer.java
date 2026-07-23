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
        "cp_customers",
        "client_code",
        "ALTER TABLE cp_customers ADD COLUMN client_code VARCHAR(64) NULL AFTER display_name"
    );
    addColumnIfMissing(
        "cp_customers",
        "remark",
        "ALTER TABLE cp_customers ADD COLUMN remark VARCHAR(500) NULL AFTER status"
    );
    addColumnIfMissing(
        "cp_customers",
        "responsible_agent_id",
        "ALTER TABLE cp_customers ADD COLUMN responsible_agent_id BIGINT NULL AFTER created_by"
    );
    jdbcTemplate.update(
        "UPDATE cp_customers SET responsible_agent_id = created_by WHERE responsible_agent_id IS NULL"
    );
    jdbcTemplate.execute(
        "ALTER TABLE cp_customers MODIFY responsible_agent_id BIGINT NOT NULL"
    );
    addIndexIfMissing(
        "cp_customers",
        "idx_cp_customers_responsible_status",
        "ALTER TABLE cp_customers ADD INDEX idx_cp_customers_responsible_status (responsible_agent_id, status, created_at)"
    );
    addIndexIfMissing(
        "cp_customers",
        "uk_cp_customers_client_code",
        "ALTER TABLE cp_customers ADD UNIQUE INDEX uk_cp_customers_client_code (client_code)"
    );
    addConstraintIfMissing(
        "cp_customers",
        "fk_cp_customers_responsible_agent",
        "ALTER TABLE cp_customers ADD CONSTRAINT fk_cp_customers_responsible_agent FOREIGN KEY (responsible_agent_id) REFERENCES cp_users(id)"
    );
    addColumnIfMissing(
        "cp_shipments",
        "responsible_agent_id",
        "ALTER TABLE cp_shipments ADD COLUMN responsible_agent_id BIGINT NULL AFTER created_by"
    );
    jdbcTemplate.update(
        "UPDATE cp_shipments SET responsible_agent_id = created_by WHERE responsible_agent_id IS NULL"
    );
    addIndexIfMissing(
        "cp_shipments",
        "idx_cp_shipments_responsible_agent",
        "ALTER TABLE cp_shipments ADD INDEX idx_cp_shipments_responsible_agent (responsible_agent_id, updated_at)"
    );
    addConstraintIfMissing(
        "cp_shipments",
        "fk_cp_shipments_responsible_agent",
        "ALTER TABLE cp_shipments ADD CONSTRAINT fk_cp_shipments_responsible_agent FOREIGN KEY (responsible_agent_id) REFERENCES cp_users(id) ON DELETE SET NULL"
    );
    addColumnIfMissing(
        "cp_shipments",
        "business_note",
        "ALTER TABLE cp_shipments ADD COLUMN business_note TEXT NULL AFTER tracking_status"
    );
    addColumnIfMissing(
        "cp_shipments",
        "job_number",
        "ALTER TABLE cp_shipments ADD COLUMN job_number VARCHAR(160) NULL AFTER business_note"
    );
    addColumnIfMissing(
        "cp_shipments",
        "client_po_number",
        "ALTER TABLE cp_shipments ADD COLUMN client_po_number VARCHAR(160) NULL AFTER job_number"
    );
    addColumnIfMissing(
        "cp_shipments",
        "client_name_code",
        "ALTER TABLE cp_shipments ADD COLUMN client_name_code VARCHAR(160) NULL AFTER client_po_number"
    );
    addColumnIfMissing(
        "cp_shipments",
        "original_bill_of_lading",
        "ALTER TABLE cp_shipments ADD COLUMN original_bill_of_lading VARCHAR(64) NULL AFTER client_name_code"
    );
    addColumnIfMissing(
        "cp_shipments",
        "last_refresh_result",
        "ALTER TABLE cp_shipments ADD COLUMN last_refresh_result VARCHAR(16) NULL AFTER original_bill_of_lading"
    );
    addColumnIfMissing(
        "cp_shipments",
        "last_refresh_error_code",
        "ALTER TABLE cp_shipments ADD COLUMN last_refresh_error_code VARCHAR(120) NULL AFTER last_refresh_result"
    );
    addColumnIfMissing(
        "cp_shipments",
        "last_refresh_error",
        "ALTER TABLE cp_shipments ADD COLUMN last_refresh_error VARCHAR(1000) NULL AFTER last_refresh_error_code"
    );
    addColumnIfMissing(
        "cp_shipments",
        "last_refresh_attempts",
        "ALTER TABLE cp_shipments ADD COLUMN last_refresh_attempts INT NOT NULL DEFAULT 0 AFTER last_refresh_error"
    );
    addColumnIfMissing(
        "cp_shipments",
        "last_refresh_proxy_attempts",
        "ALTER TABLE cp_shipments ADD COLUMN last_refresh_proxy_attempts INT NOT NULL DEFAULT 0 AFTER last_refresh_attempts"
    );
    addColumnIfMissing(
        "cp_shipments",
        "last_refresh_at",
        "ALTER TABLE cp_shipments ADD COLUMN last_refresh_at DATETIME(6) NULL AFTER last_refresh_proxy_attempts"
    );
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
    addColumnIfMissing(
        "cp_customer_shipment_access",
        "publication_status",
        "ALTER TABLE cp_customer_shipment_access ADD COLUMN publication_status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED' AFTER relationship_role"
    );
    addColumnIfMissing(
        "cp_customer_shipment_access",
        "published_at",
        "ALTER TABLE cp_customer_shipment_access ADD COLUMN published_at DATETIME(6) NULL AFTER assigned_at"
    );
    addColumnIfMissing(
        "cp_customer_shipment_access",
        "published_by",
        "ALTER TABLE cp_customer_shipment_access ADD COLUMN published_by BIGINT NULL AFTER published_at"
    );
    addColumnIfMissing(
        "cp_tracking_snapshots",
        "invalidated_at",
        "ALTER TABLE cp_tracking_snapshots ADD COLUMN invalidated_at DATETIME(6) NULL AFTER created_at"
    );
    addColumnIfMissing(
        "cp_tracking_snapshots",
        "invalidated_by",
        "ALTER TABLE cp_tracking_snapshots ADD COLUMN invalidated_by BIGINT NULL AFTER invalidated_at"
    );
    addColumnIfMissing(
        "cp_tracking_snapshots",
        "invalidation_reason",
        "ALTER TABLE cp_tracking_snapshots ADD COLUMN invalidation_reason VARCHAR(500) NULL AFTER invalidated_by"
    );
    addColumnIfMissing(
        "cp_tracking_snapshots",
        "queried_by",
        "ALTER TABLE cp_tracking_snapshots ADD COLUMN queried_by BIGINT NULL AFTER query_reference_no"
    );
    addColumnIfMissing(
        "cp_tracking_snapshots",
        "queried_by_username",
        "ALTER TABLE cp_tracking_snapshots ADD COLUMN queried_by_username VARCHAR(128) NULL AFTER queried_by"
    );
    migrateLegacyShipmentBusinessFieldsForMySql();
    removeInvalidDiscoveredShipmentReferencesForMySql();
    upgradeSnapshotUserQueryIndexForMySql();
    migrateLegacyOverseaAgentCustomersForMySql();
    migrateLegacyFileVisibilityForMySql();
  }

  private void migrateLegacyOverseaAgentCustomersForMySql() {
    jdbcTemplate.update(
        "UPDATE cp_customers SET party_role = 'OVERSEA_AGENT' "
            + "WHERE UPPER(party_role) = 'AGENT'"
    );
    jdbcTemplate.update(
        "UPDATE cp_customer_shipment_access SET relationship_role = 'OVERSEA_AGENT' "
            + "WHERE UPPER(relationship_role) = 'AGENT'"
    );
  }

  private void removeInvalidDiscoveredShipmentReferencesForMySql() {
    jdbcTemplate.update(
        """
        DELETE FROM cp_shipment_references
        WHERE primary_reference = 0
          AND reference_type = 'BILLOFLADING'
          AND UPPER(COALESCE(reference_no_normalized, reference_no_raw, ''))
              REGEXP 'NOTREADY|NOTAVAILABLE|NORECORD|UNKNOWN|PENDING'
        """
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

  private void migrateLegacyFileVisibilityForMySql() {
    jdbcTemplate.update(
        """
        INSERT IGNORE INTO cp_shipment_file_visibility_roles (
          shipment_file_id, visibility_role, created_at
        )
        SELECT f.id,
               CASE
                 WHEN UPPER(f.visibility) IN ('INTERNAL', 'INTERNAL_ONLY') THEN 'OVERSEA_AGENT'
                 WHEN UPPER(COALESCE(a.relationship_role, c.party_role, '')) = 'CONSIGNEE'
                   THEN 'CONSIGNEE'
                 WHEN UPPER(COALESCE(a.relationship_role, c.party_role, '')) = 'AGENT'
                   THEN 'OVERSEA_AGENT'
                 ELSE 'SHIPPER'
               END,
               f.created_at
        FROM cp_shipment_files f
        LEFT JOIN cp_customers c ON c.id = f.target_customer_id
        LEFT JOIN cp_customer_shipment_access a
          ON a.customer_id = f.target_customer_id AND a.shipment_id = f.shipment_id
        WHERE (UPPER(f.visibility) IN ('INTERNAL', 'INTERNAL_ONLY')
               OR f.target_customer_id IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM cp_shipment_file_visibility_roles existing
            WHERE existing.shipment_file_id = f.id
          )
        """
    );
    jdbcTemplate.update(
        """
        INSERT IGNORE INTO cp_shipment_file_visibility_roles (
          shipment_file_id, visibility_role, created_at
        )
        SELECT f.id, legacy_role.visibility_role, f.created_at
        FROM cp_shipment_files f
        JOIN (
          SELECT 'SHIPPER' AS visibility_role
          UNION ALL SELECT 'CONSIGNEE'
        ) legacy_role
        WHERE UPPER(f.visibility) = 'PARTIES'
          AND f.target_customer_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM cp_shipment_file_visibility_roles existing
            WHERE existing.shipment_file_id = f.id
          )
        """
    );
  }

  private void migrateLegacyShipmentBusinessFieldsForMySql() {
    jdbcTemplate.update(
        """
        UPDATE cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        SET s.job_number = COALESCE(
              s.job_number,
              NULLIF(JSON_UNQUOTE(JSON_EXTRACT(
                t.snapshot_json, '$.references.business.forwarderJobNumber'
              )), 'null')
            ),
            s.client_po_number = COALESCE(
              s.client_po_number,
              NULLIF(JSON_UNQUOTE(JSON_EXTRACT(
                t.snapshot_json, '$.references.business.clientPoNumber'
              )), 'null')
            ),
            s.client_name_code = COALESCE(
              s.client_name_code,
              NULLIF(JSON_UNQUOTE(JSON_EXTRACT(
                t.snapshot_json, '$.references.business.clientNameCode'
              )), 'null')
            ),
            s.original_bill_of_lading = COALESCE(
              s.original_bill_of_lading,
              NULLIF(JSON_UNQUOTE(JSON_EXTRACT(
                t.snapshot_json, '$.references.business.originalBillOfLading'
              )), 'null'),
              NULLIF(JSON_UNQUOTE(JSON_EXTRACT(
                t.snapshot_json, '$.references.originalBillOfLading'
              )), 'null'),
              NULLIF(JSON_UNQUOTE(JSON_EXTRACT(
                t.snapshot_json, '$.tracking.originalNumber'
              )), 'null')
            )
        WHERE JSON_VALID(t.snapshot_json)
        """
    );
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

  private void upgradeSnapshotUserQueryIndexForMySql() {
    Integer legacyUnique = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cp_tracking_snapshots'
          AND INDEX_NAME = 'uk_cp_tracking_snapshots_user_query' AND NON_UNIQUE = 0
        """,
        Integer.class
    );
    if (legacyUnique != null && legacyUnique > 0) {
      jdbcTemplate.execute(
          "ALTER TABLE cp_tracking_snapshots DROP INDEX uk_cp_tracking_snapshots_user_query"
      );
    }
    addIndexIfMissing(
        "cp_tracking_snapshots",
        "idx_cp_tracking_snapshots_user_query",
        "ALTER TABLE cp_tracking_snapshots ADD INDEX idx_cp_tracking_snapshots_user_query "
            + "(queried_by, query_reference_type, query_reference_no, invalidated_at)"
    );
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
        CREATE TABLE IF NOT EXISTS cp_tracking_credentials (
          carrier_code VARCHAR(32) PRIMARY KEY,
          encrypted_session_cookie LONGTEXT NOT NULL,
          browser_user_agent VARCHAR(512) NULL,
          updated_by BIGINT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX idx_cp_tracking_credentials_updated_at (updated_at),
          CONSTRAINT fk_cp_tracking_credentials_updated_by FOREIGN KEY (updated_by) REFERENCES cp_users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_shipments (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          public_id CHAR(36) NOT NULL UNIQUE,
          carrier_code VARCHAR(32) NOT NULL,
          current_snapshot_id BIGINT NULL,
          tracking_status VARCHAR(80) NULL,
          business_note TEXT NULL,
          job_number VARCHAR(160) NULL,
          client_po_number VARCHAR(160) NULL,
          client_name_code VARCHAR(160) NULL,
          original_bill_of_lading VARCHAR(64) NULL,
          last_refresh_result VARCHAR(16) NULL,
          last_refresh_error_code VARCHAR(120) NULL,
          last_refresh_error VARCHAR(1000) NULL,
          last_refresh_attempts INT NOT NULL DEFAULT 0,
          last_refresh_proxy_attempts INT NOT NULL DEFAULT 0,
          last_refresh_at DATETIME(6) NULL,
          last_tracked_at DATETIME(6) NULL,
          fresh_until DATETIME(6) NULL,
          created_by BIGINT NULL,
          responsible_agent_id BIGINT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX idx_cp_shipments_carrier_time (carrier_code, last_tracked_at),
          INDEX idx_cp_shipments_fresh_until (fresh_until),
          INDEX idx_cp_shipments_responsible_agent (responsible_agent_id, updated_at),
          CONSTRAINT fk_cp_shipments_created_by FOREIGN KEY (created_by) REFERENCES cp_users(id) ON DELETE SET NULL,
          CONSTRAINT fk_cp_shipments_responsible_agent FOREIGN KEY (responsible_agent_id) REFERENCES cp_users(id) ON DELETE SET NULL
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
          queried_by BIGINT NULL,
          queried_by_username VARCHAR(128) NULL,
          source_channel VARCHAR(32) NULL,
          snapshot_json LONGTEXT NOT NULL,
          strategy_json LONGTEXT NULL,
          payload_sha256 CHAR(64) NOT NULL,
          fetched_at DATETIME(6) NOT NULL,
          fresh_until DATETIME(6) NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          invalidated_at DATETIME(6) NULL,
          invalidated_by BIGINT NULL,
          invalidation_reason VARCHAR(500) NULL,
          INDEX idx_cp_tracking_snapshots_shipment_time (shipment_id, fetched_at),
          INDEX idx_cp_tracking_snapshots_fresh_until (fresh_until),
          INDEX idx_cp_tracking_snapshots_user_query (queried_by, query_reference_type, query_reference_no, invalidated_at),
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
          client_code VARCHAR(64) NULL,
          party_role VARCHAR(20) NOT NULL,
          customer_code_hash CHAR(64) NOT NULL UNIQUE,
          customer_code_prefix VARCHAR(16) NOT NULL,
          customer_code_mode VARCHAR(20) NOT NULL DEFAULT 'RANDOM',
          provisioning_source VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
          status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          remark VARCHAR(500) NULL,
          created_by BIGINT NOT NULL,
          responsible_agent_id BIGINT NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX idx_cp_customers_creator_status (created_by, status, created_at),
          INDEX idx_cp_customers_responsible_status (responsible_agent_id, status, created_at),
          UNIQUE KEY uk_cp_customers_client_code (client_code),
          INDEX idx_cp_customers_code_prefix (customer_code_prefix),
          CONSTRAINT fk_cp_customers_created_by FOREIGN KEY (created_by) REFERENCES cp_users(id),
          CONSTRAINT fk_cp_customers_responsible_agent FOREIGN KEY (responsible_agent_id) REFERENCES cp_users(id)
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
        CREATE TABLE IF NOT EXISTS cp_oversea_agent_customers (
          customer_id BIGINT NOT NULL,
          oversea_agent_customer_id BIGINT NOT NULL,
          assigned_by BIGINT NOT NULL,
          assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (customer_id),
          INDEX idx_cp_oversea_agent_customers_agent (oversea_agent_customer_id, assigned_at),
          CONSTRAINT fk_cp_oversea_agent_customers_customer FOREIGN KEY (customer_id) REFERENCES cp_customers(id) ON DELETE CASCADE,
          CONSTRAINT fk_cp_oversea_agent_customers_agent FOREIGN KEY (oversea_agent_customer_id) REFERENCES cp_customers(id) ON DELETE CASCADE,
          CONSTRAINT fk_cp_oversea_agent_customers_assigned_by FOREIGN KEY (assigned_by) REFERENCES cp_users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_customer_shipment_access (
          customer_id BIGINT NOT NULL,
          shipment_id BIGINT NOT NULL,
          relationship_role VARCHAR(20) NOT NULL,
          publication_status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
          assigned_by BIGINT NOT NULL,
          assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          published_at DATETIME(6) NULL,
          published_by BIGINT NULL,
          PRIMARY KEY (customer_id, shipment_id),
          INDEX idx_cp_customer_shipment_access_shipment (shipment_id, customer_id),
          CONSTRAINT fk_cp_customer_shipment_customer FOREIGN KEY (customer_id) REFERENCES cp_customers(id) ON DELETE CASCADE,
          CONSTRAINT fk_cp_customer_shipment_shipment FOREIGN KEY (shipment_id) REFERENCES cp_shipments(id) ON DELETE CASCADE,
          CONSTRAINT fk_cp_customer_shipment_assigned_by FOREIGN KEY (assigned_by) REFERENCES cp_users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_customer_transfer_log (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          batch_id CHAR(36) NOT NULL,
          customer_id BIGINT NOT NULL,
          from_agent_id BIGINT NOT NULL,
          to_agent_id BIGINT NOT NULL,
          initiated_by BIGINT NOT NULL,
          retained_previous_access TINYINT(1) NOT NULL DEFAULT 0,
          shipment_count INT NOT NULL DEFAULT 0,
          ip_address VARCHAR(64) NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          UNIQUE KEY uk_cp_customer_transfer_batch_customer (batch_id, customer_id),
          INDEX idx_cp_customer_transfer_customer_time (customer_id, created_at),
          INDEX idx_cp_customer_transfer_agents_time (from_agent_id, to_agent_id, created_at),
          CONSTRAINT fk_cp_customer_transfer_customer FOREIGN KEY (customer_id) REFERENCES cp_customers(id),
          CONSTRAINT fk_cp_customer_transfer_from_agent FOREIGN KEY (from_agent_id) REFERENCES cp_users(id),
          CONSTRAINT fk_cp_customer_transfer_to_agent FOREIGN KEY (to_agent_id) REFERENCES cp_users(id),
          CONSTRAINT fk_cp_customer_transfer_initiated_by FOREIGN KEY (initiated_by) REFERENCES cp_users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_shipment_client_match_queue (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          shipment_id BIGINT NOT NULL,
          imported_client_code VARCHAR(160) NOT NULL,
          match_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
          match_reason VARCHAR(64) NOT NULL,
          requested_by BIGINT NULL,
          matched_customer_id BIGINT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          resolved_at DATETIME(6) NULL,
          UNIQUE KEY uk_cp_shipment_client_match_queue_shipment (shipment_id),
          INDEX idx_cp_shipment_client_match_queue_status (match_status, requested_by, updated_at),
          CONSTRAINT fk_cp_client_match_shipment FOREIGN KEY (shipment_id) REFERENCES cp_shipments(id) ON DELETE CASCADE,
          CONSTRAINT fk_cp_client_match_requested_by FOREIGN KEY (requested_by) REFERENCES cp_users(id) ON DELETE SET NULL,
          CONSTRAINT fk_cp_client_match_customer FOREIGN KEY (matched_customer_id) REFERENCES cp_customers(id) ON DELETE SET NULL
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
        CREATE TABLE IF NOT EXISTS cp_shipment_file_comments (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          public_id CHAR(36) NOT NULL UNIQUE,
          shipment_id BIGINT NOT NULL,
          author_user_id BIGINT NULL,
          author_customer_id BIGINT NULL,
          author_display_name_snapshot VARCHAR(120) NOT NULL,
          author_role_snapshot VARCHAR(24) NOT NULL,
          body VARCHAR(2000) NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX idx_cp_shipment_file_comments_shipment_time (shipment_id, created_at, id),
          CONSTRAINT fk_cp_shipment_file_comments_shipment FOREIGN KEY (shipment_id) REFERENCES cp_shipments(id) ON DELETE CASCADE,
          CONSTRAINT fk_cp_shipment_file_comments_user FOREIGN KEY (author_user_id) REFERENCES cp_users(id) ON DELETE SET NULL,
          CONSTRAINT fk_cp_shipment_file_comments_customer FOREIGN KEY (author_customer_id) REFERENCES cp_customers(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS cp_shipment_file_visibility_roles (
          shipment_file_id BIGINT NOT NULL,
          visibility_role VARCHAR(24) NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (shipment_file_id, visibility_role),
          INDEX idx_cp_shipment_file_visibility_role (visibility_role, shipment_file_id),
          CONSTRAINT fk_cp_shipment_file_visibility_file
            FOREIGN KEY (shipment_file_id) REFERENCES cp_shipment_files(id) ON DELETE CASCADE
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
