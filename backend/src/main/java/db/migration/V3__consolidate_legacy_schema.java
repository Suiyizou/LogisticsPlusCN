package db.migration;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.CRC32;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/** Frozen legacy upgrade. Add a new migration instead of changing this class after release. */
public final class V3__consolidate_legacy_schema extends BaseJavaMigration {
  private JdbcTemplate jdbcTemplate;

  @Override
  public Integer getChecksum() {
    try (InputStream input = getClass().getResourceAsStream("/db/migration/V3__legacy_schema_manifest.properties")) {
      if (input == null) throw new IllegalStateException("Missing immutable V3 migration manifest");
      CRC32 checksum = new CRC32();
      checksum.update(new String(input.readAllBytes(), StandardCharsets.UTF_8)
          .replace("\r\n", "\n").getBytes(StandardCharsets.UTF_8));
      return (int) checksum.getValue();
    } catch (IOException error) {
      throw new IllegalStateException("Cannot read V3 migration checksum", error);
    }
  }

  @Override
  public boolean canExecuteInTransaction() {
    // MySQL DDL commits implicitly; do not advertise atomic rollback for this historical upgrade.
    return false;
  }

  @Override
  public void migrate(Context context) throws Exception {
    if (!context.getConnection().getMetaData().getDatabaseProductName().equalsIgnoreCase("MySQL")) {
      throw new IllegalStateException("V3 legacy upgrade requires MySQL; use a real MySQL migration test");
    }
    jdbcTemplate = new JdbcTemplate(new SingleConnectionDataSource(context.getConnection(), true));
    // V1 creates all missing tables. These operations upgrade previously existing table definitions.
    extendUserSchemaForMySql();
    upgradeCustomerHandoverSchemaForMySql();
    upgradeCustomerFileSchemaForMySql();
    upgradeAdminAuditSchemaForMySql();
    normalizeKnownLegacyShape();
    upgradeCustomerCredentials();
    upgradeRefreshJobs();
    jdbcTemplate.update("""
        INSERT INTO cp_shipment_file_storage_lock (id, lock_name)
        VALUES (1, 'shipment-file-capacity')
        ON DUPLICATE KEY UPDATE lock_name = VALUES(lock_name)
        """);
  }

  /**
   * Keeps handover reads compatible with databases that briefly ran an earlier draft of the
   * handover tables. CREATE TABLE IF NOT EXISTS cannot add columns to those installations.
   */
  private void upgradeCustomerHandoverSchemaForMySql() {
    addColumnIfMissing(
        "cp_customer_handover_requests",
        "shipment_count",
        "ALTER TABLE cp_customer_handover_requests "
            + "ADD COLUMN shipment_count INT NOT NULL DEFAULT 0 AFTER customer_count"
    );
    addColumnIfMissing(
        "cp_customer_handover_requests",
        "request_ip",
        "ALTER TABLE cp_customer_handover_requests "
            + "ADD COLUMN request_ip VARCHAR(64) NULL AFTER shipment_count"
    );
    addColumnIfMissing(
        "cp_customer_handover_requests",
        "reviewed_by",
        "ALTER TABLE cp_customer_handover_requests "
            + "ADD COLUMN reviewed_by BIGINT NULL AFTER request_ip"
    );
    addColumnIfMissing(
        "cp_customer_handover_requests",
        "review_comment",
        "ALTER TABLE cp_customer_handover_requests "
            + "ADD COLUMN review_comment VARCHAR(500) NULL AFTER reviewed_by"
    );
    addColumnIfMissing(
        "cp_customer_handover_requests",
        "review_ip",
        "ALTER TABLE cp_customer_handover_requests "
            + "ADD COLUMN review_ip VARCHAR(64) NULL AFTER review_comment"
    );
    addColumnIfMissing(
        "cp_customer_handover_requests",
        "approved_batch_id",
        "ALTER TABLE cp_customer_handover_requests "
            + "ADD COLUMN approved_batch_id CHAR(36) NULL AFTER review_ip"
    );
    addColumnIfMissing(
        "cp_customer_handover_requests",
        "updated_at",
        "ALTER TABLE cp_customer_handover_requests "
            + "ADD COLUMN updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) "
            + "ON UPDATE CURRENT_TIMESTAMP(6) AFTER created_at"
    );
    addColumnIfMissing(
        "cp_customer_handover_requests",
        "reviewed_at",
        "ALTER TABLE cp_customer_handover_requests "
            + "ADD COLUMN reviewed_at DATETIME(6) NULL AFTER updated_at"
    );
    addColumnIfMissing(
        "cp_customer_handover_request_items",
        "shipment_count",
        "ALTER TABLE cp_customer_handover_request_items "
            + "ADD COLUMN shipment_count INT NOT NULL DEFAULT 0 AFTER source_agent_id"
    );
    addColumnIfMissing(
        "cp_customer_handover_request_items",
        "transferred_at",
        "ALTER TABLE cp_customer_handover_request_items "
            + "ADD COLUMN transferred_at DATETIME(6) NULL AFTER shipment_count"
    );
    addIndexIfMissing(
        "cp_customer_handover_requests",
        "idx_cp_customer_handover_status_time",
        "ALTER TABLE cp_customer_handover_requests "
            + "ADD INDEX idx_cp_customer_handover_status_time (status, created_at)"
    );
    addIndexIfMissing(
        "cp_customer_handover_request_items",
        "idx_cp_customer_handover_item_customer",
        "ALTER TABLE cp_customer_handover_request_items "
            + "ADD INDEX idx_cp_customer_handover_item_customer (customer_id, request_id)"
    );
  }

  private void upgradeAdminAuditSchemaForMySql() {
    Integer tableCount = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cp_admin_audit_log'
        """,
        Integer.class
    );
    if (tableCount == null || tableCount == 0) return;
    addColumnIfMissing("cp_admin_audit_log", "username_snapshot",
        "ALTER TABLE cp_admin_audit_log ADD COLUMN username_snapshot VARCHAR(100) NULL AFTER ip_address");
    addColumnIfMissing("cp_admin_audit_log", "role_snapshot",
        "ALTER TABLE cp_admin_audit_log ADD COLUMN role_snapshot VARCHAR(32) NULL AFTER username_snapshot");
    addColumnIfMissing("cp_admin_audit_log", "http_method",
        "ALTER TABLE cp_admin_audit_log ADD COLUMN http_method VARCHAR(12) NULL AFTER role_snapshot");
    addColumnIfMissing("cp_admin_audit_log", "request_path",
        "ALTER TABLE cp_admin_audit_log ADD COLUMN request_path VARCHAR(255) NULL AFTER http_method");
    addColumnIfMissing("cp_admin_audit_log", "http_status",
        "ALTER TABLE cp_admin_audit_log ADD COLUMN http_status INT NULL AFTER request_path");
    addColumnIfMissing("cp_admin_audit_log", "success",
        "ALTER TABLE cp_admin_audit_log ADD COLUMN success TINYINT(1) NULL AFTER http_status");
    addColumnIfMissing("cp_admin_audit_log", "duration_ms",
        "ALTER TABLE cp_admin_audit_log ADD COLUMN duration_ms BIGINT NULL AFTER success");
    addColumnIfMissing("cp_admin_audit_log", "request_id",
        "ALTER TABLE cp_admin_audit_log ADD COLUMN request_id VARCHAR(64) NULL AFTER duration_ms");
    addColumnIfMissing("cp_admin_audit_log", "user_agent",
        "ALTER TABLE cp_admin_audit_log ADD COLUMN user_agent VARCHAR(255) NULL AFTER request_id");
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
    if (!columnTypes.isEmpty()) {
      String currentType = columnTypes.get(0);
      if (currentType.contains("'EMPLOYEE'")) {
        jdbcTemplate.execute(
            "ALTER TABLE cp_users MODIFY role ENUM('ADMIN','EMPLOYEE','BUSINESS','OVERSEA_AGENT') NOT NULL DEFAULT 'OVERSEA_AGENT'"
        );
        jdbcTemplate.update("UPDATE cp_users SET role = 'OVERSEA_AGENT' WHERE role = 'EMPLOYEE'");
      }
      jdbcTemplate.execute(
          "ALTER TABLE cp_users MODIFY role ENUM('ADMIN','BUSINESS','OVERSEA_AGENT') NOT NULL DEFAULT 'OVERSEA_AGENT'"
      );
    }
    List<String> statusColumnTypes = jdbcTemplate.query(
        """
        SELECT COLUMN_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cp_users' AND COLUMN_NAME = 'status'
        """,
        (rs, rowNumber) -> rs.getString("COLUMN_TYPE")
    );
    if (!statusColumnTypes.isEmpty() && !statusColumnTypes.get(0).contains("'DELETED'")) {
      jdbcTemplate.execute(
          "ALTER TABLE cp_users MODIFY status ENUM('ACTIVE','DISABLED','DELETED') NOT NULL DEFAULT 'ACTIVE'"
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
    List<String> loginEventTypes = jdbcTemplate.query(
        """
        SELECT COLUMN_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'cp_login_events'
          AND COLUMN_NAME = 'event_type'
        """,
        (rs, rowNumber) -> rs.getString("COLUMN_TYPE")
    );
    if (!loginEventTypes.isEmpty()
        && (!loginEventTypes.get(0).contains("'PASSWORD_CHANGED'")
            || !loginEventTypes.get(0).contains("'PASSWORD_CHANGE_FAIL'"))) {
      jdbcTemplate.execute(
          """
          ALTER TABLE cp_login_events MODIFY event_type ENUM(
            'LOGIN_SUCCESS','LOGIN_FAIL','LOGOUT','KICK','DEVICE_LIMIT',
            'PASSWORD_CHANGED','PASSWORD_CHANGE_FAIL'
          ) NOT NULL
          """
      );
    }
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
        "cp_customer_sessions",
        "scope_customer_id",
        "ALTER TABLE cp_customer_sessions ADD COLUMN scope_customer_id BIGINT NULL AFTER customer_id"
    );
    jdbcTemplate.update(
        """
        UPDATE cp_customer_sessions customer_session
        JOIN cp_customers customer_account
          ON customer_account.id = customer_session.customer_id
        SET customer_session.scope_customer_id = customer_session.customer_id
        WHERE customer_session.scope_customer_id IS NULL
          AND UPPER(customer_account.party_role) <> 'OVERSEA_AGENT'
        """
    );
    addIndexIfMissing(
        "cp_customer_sessions",
        "idx_cp_customer_sessions_scope",
        "ALTER TABLE cp_customer_sessions ADD INDEX idx_cp_customer_sessions_scope (scope_customer_id, revoked_at, expires_at)"
    );
    addConstraintIfMissing(
        "cp_customer_sessions",
        "fk_cp_customer_sessions_scope",
        "ALTER TABLE cp_customer_sessions ADD CONSTRAINT fk_cp_customer_sessions_scope FOREIGN KEY (scope_customer_id) REFERENCES cp_customers(id) ON DELETE CASCADE"
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
    addIndexIfMissing(
        "cp_shipments",
        "idx_cp_shipments_responsible_created",
        "ALTER TABLE cp_shipments ADD INDEX idx_cp_shipments_responsible_created (responsible_agent_id, created_at)"
    );
    addIndexIfMissing(
        "cp_shipments",
        "idx_cp_shipments_created_at",
        "ALTER TABLE cp_shipments ADD INDEX idx_cp_shipments_created_at (created_at)"
    );
    addIndexIfMissing(
        "cp_shipments",
        "idx_cp_shipments_updated_at",
        "ALTER TABLE cp_shipments ADD INDEX idx_cp_shipments_updated_at (updated_at)"
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
    addIndexIfMissing(
        "cp_shipments",
        "idx_cp_shipments_refresh_result_updated",
        "ALTER TABLE cp_shipments ADD INDEX idx_cp_shipments_refresh_result_updated (last_refresh_result, updated_at)"
    );
    addIndexIfMissing(
        "cp_shipments",
        "idx_cp_shipments_responsible_refresh",
        "ALTER TABLE cp_shipments ADD INDEX idx_cp_shipments_responsible_refresh (responsible_agent_id, last_refresh_result, updated_at)"
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
    enforceTrackingSnapshotOwnerForMySql();
    migrateLegacyShipmentBusinessFieldsForMySql();
    removeInvalidDiscoveredShipmentReferencesForMySql();
    upgradeSnapshotUserQueryIndexForMySql();
    migrateLegacyOverseaAgentCustomersForMySql();
    migrateOverseaAgentShipmentScopesForMySql();
    migrateLegacyFileVisibilityForMySql();
  }

  private void enforceTrackingSnapshotOwnerForMySql() {
    jdbcTemplate.update(
        """
        UPDATE cp_tracking_snapshots tracking_snapshot
        JOIN cp_shipments shipment ON shipment.id = tracking_snapshot.shipment_id
        SET tracking_snapshot.queried_by = COALESCE(
          shipment.responsible_agent_id,
          shipment.created_by
        )
        WHERE tracking_snapshot.queried_by IS NULL
          AND COALESCE(shipment.responsible_agent_id, shipment.created_by) IS NOT NULL
        """
    );
    Integer missingOwnerCount = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_tracking_snapshots WHERE queried_by IS NULL",
        Integer.class
    );
    if (missingOwnerCount != null && missingOwnerCount > 0) {
      throw new IllegalStateException(
          "Cannot require cp_tracking_snapshots.queried_by: "
              + missingOwnerCount + " legacy snapshots have no resolvable owner"
      );
    }
    jdbcTemplate.execute(
        "ALTER TABLE cp_tracking_snapshots MODIFY queried_by BIGINT NOT NULL"
    );
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

  private void migrateOverseaAgentShipmentScopesForMySql() {
    jdbcTemplate.update(
        """
        INSERT IGNORE INTO cp_oversea_agent_shipment_scopes (
          shipment_id, oversea_agent_customer_id, represented_customer_id,
          status, assigned_by, assigned_at, updated_at
        )
        SELECT shipment_access.shipment_id,
               link.oversea_agent_customer_id, link.customer_id,
               'ACTIVE', link.assigned_by,
               GREATEST(shipment_access.assigned_at, link.assigned_at),
               CURRENT_TIMESTAMP(6)
        FROM cp_oversea_agent_customers link
        JOIN cp_customer_shipment_access shipment_access
          ON shipment_access.customer_id = link.customer_id
        """
    );
    jdbcTemplate.update(
        """
        UPDATE cp_customer_sessions customer_session
        JOIN cp_customers agent ON agent.id = customer_session.customer_id
        SET customer_session.revoked_at =
              COALESCE(customer_session.revoked_at, CURRENT_TIMESTAMP(6))
        WHERE customer_session.scope_customer_id IS NOT NULL
          AND UPPER(agent.party_role) = 'OVERSEA_AGENT'
        """
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

  private void normalizeKnownLegacyShape() {
    addIndexIfMissing("cp_admin_audit_log", "idx_cp_admin_audit_request_time",
        "ALTER TABLE cp_admin_audit_log ADD INDEX idx_cp_admin_audit_request_time (request_id, created_at)");
    // Preserve the known historical customer lookup index on fresh installations too.
    addIndexIfMissing("cp_customers", "idx_cp_customers_creator_client_code",
        "ALTER TABLE cp_customers ADD INDEX idx_cp_customers_creator_client_code (created_by, client_code, status)");
    String usernameNullable = jdbcTemplate.queryForObject("""
        SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cp_tracking_snapshots' AND COLUMN_NAME='queried_by_username'
        """, String.class);
    if ("NO".equalsIgnoreCase(usernameNullable)) {
      // Owner id is mandatory; a historical display-name snapshot may be absent.
      jdbcTemplate.execute("ALTER TABLE cp_tracking_snapshots MODIFY queried_by_username VARCHAR(128) NULL");
    }
  }

  private void upgradeCustomerCredentials() {
    addColumnIfMissing("cp_customers", "password_salt",
        "ALTER TABLE cp_customers ADD COLUMN password_salt VARCHAR(64) NULL AFTER party_role");
    addColumnIfMissing("cp_customers", "password_hash",
        "ALTER TABLE cp_customers ADD COLUMN password_hash VARCHAR(128) NULL AFTER password_salt");
    addColumnIfMissing("cp_customers", "password_iterations",
        "ALTER TABLE cp_customers ADD COLUMN password_iterations INT NULL AFTER password_hash");
    addColumnIfMissing("cp_customers", "customer_code_mode",
        "ALTER TABLE cp_customers ADD COLUMN customer_code_mode VARCHAR(20) NOT NULL DEFAULT 'RANDOM' AFTER customer_code_prefix");
    addColumnIfMissing("cp_customers", "provisioning_source",
        "ALTER TABLE cp_customers ADD COLUMN provisioning_source VARCHAR(20) NOT NULL DEFAULT 'MANUAL' AFTER customer_code_mode");
    String nullable = jdbcTemplate.queryForObject("""
        SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cp_customer_sessions' AND COLUMN_NAME = 'scope_customer_id'
        """, String.class);
    if ("NO".equalsIgnoreCase(nullable)) {
      jdbcTemplate.execute("ALTER TABLE cp_customer_sessions MODIFY COLUMN scope_customer_id BIGINT NULL");
    }
  }

  private void upgradeRefreshJobs() {
    addColumnIfMissing("cp_tracking_refresh_jobs", "refresh_scope",
        "ALTER TABLE cp_tracking_refresh_jobs ADD COLUMN refresh_scope VARCHAR(24) NOT NULL DEFAULT 'FULL' AFTER auto_refresh_enabled");
    addColumnIfMissing("cp_tracking_refresh_jobs", "supplemental_sources",
        "ALTER TABLE cp_tracking_refresh_jobs ADD COLUMN supplemental_sources VARCHAR(128) NULL AFTER refresh_scope");
  }
}
