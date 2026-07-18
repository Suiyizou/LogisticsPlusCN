CREATE DATABASE IF NOT EXISTS cargo_planner
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE cargo_planner;

CREATE TABLE IF NOT EXISTS cp_users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL,
  role ENUM('ADMIN', 'EMPLOYEE', 'BUSINESS') NOT NULL DEFAULT 'EMPLOYEE',
  party_role VARCHAR(20) NOT NULL DEFAULT 'AGENT',
  status ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
  password_salt VARCHAR(128) NOT NULL,
  password_hash VARCHAR(256) NOT NULL,
  password_iterations INT NOT NULL DEFAULT 120000,
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  INDEX idx_cp_users_role_status (role, status),
  CONSTRAINT fk_cp_users_created_by FOREIGN KEY (created_by) REFERENCES cp_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_security_migrations (
  migration_key VARCHAR(100) PRIMARY KEY,
  applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_login_devices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  device_name VARCHAR(128) NULL,
  mac_address VARCHAR(64) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  session_token_hash CHAR(64) NULL,
  online TINYINT(1) NOT NULL DEFAULT 0,
  logged_in_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cp_login_devices_user_device (user_id, device_id),
  INDEX idx_cp_login_devices_online (online, last_seen_at),
  INDEX idx_cp_login_devices_token (session_token_hash),
  CONSTRAINT fk_cp_login_devices_user FOREIGN KEY (user_id) REFERENCES cp_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_login_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  username VARCHAR(64) NULL,
  event_type ENUM('LOGIN_SUCCESS', 'LOGIN_FAIL', 'LOGOUT', 'KICK', 'DEVICE_LIMIT') NOT NULL,
  device_id VARCHAR(128) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  message VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cp_login_events_user_time (user_id, created_at),
  INDEX idx_cp_login_events_type_time (event_type, created_at),
  CONSTRAINT fk_cp_login_events_user FOREIGN KEY (user_id) REFERENCES cp_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Single-row database mutex used to serialize capacity reservations across
-- backend instances that share the shipment-file volume.
CREATE TABLE IF NOT EXISTS cp_shipment_file_storage_lock (
  id TINYINT PRIMARY KEY,
  lock_name VARCHAR(64) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO cp_shipment_file_storage_lock (id, lock_name)
VALUES (1, 'shipment-file-capacity')
ON DUPLICATE KEY UPDATE lock_name = VALUES(lock_name);

CREATE TABLE IF NOT EXISTS cp_admin_audit_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  admin_user_id BIGINT NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40) NULL,
  target_id BIGINT NULL,
  detail VARCHAR(512) NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cp_admin_audit_admin_time (admin_user_id, created_at),
  CONSTRAINT fk_cp_admin_audit_user FOREIGN KEY (admin_user_id) REFERENCES cp_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_excel_cleaning_tasks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_no VARCHAR(40) NOT NULL UNIQUE,
  source_channel ENUM('MANUAL', 'AGENT') NOT NULL DEFAULT 'AGENT',
  original_file_name VARCHAR(255) NOT NULL,
  status ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  row_count INT NOT NULL DEFAULT 0,
  valid_count INT NOT NULL DEFAULT 0,
  issue_count INT NOT NULL DEFAULT 0,
  cleaned_count INT NOT NULL DEFAULT 0,
  cleaned_json LONGTEXT NULL,
  issues_json LONGTEXT NULL,
  agent_notes TEXT NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  INDEX idx_cp_excel_cleaning_tasks_status_time (status, created_at),
  INDEX idx_cp_excel_cleaning_tasks_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_workspace_files (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  owner_display_name VARCHAR(80) NOT NULL,
  owner_folder VARCHAR(160) NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  normalized_file_name VARCHAR(255) NOT NULL,
  version_no INT NOT NULL DEFAULT 1,
  stored_relative_path VARCHAR(512) NOT NULL,
  content_type VARCHAR(160) NOT NULL DEFAULT 'application/octet-stream',
  extension VARCHAR(20) NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  source_channel VARCHAR(40) NOT NULL DEFAULT 'USER_UPLOAD',
  expires_at DATETIME(6) NOT NULL,
  last_accessed_at DATETIME(6) NULL,
  reuse_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_cp_workspace_files_user_name_version (user_id, normalized_file_name, version_no),
  INDEX idx_cp_workspace_files_user_time (user_id, created_at),
  INDEX idx_cp_workspace_files_expiry (expires_at),
  INDEX idx_cp_workspace_files_user_hash (user_id, sha256),
  CONSTRAINT fk_cp_workspace_files_user FOREIGN KEY (user_id) REFERENCES cp_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_text_recognition_tasks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_no VARCHAR(40) NOT NULL UNIQUE,
  source_channel ENUM('LOCAL', 'AGENT') NOT NULL DEFAULT 'AGENT',
  source_name VARCHAR(255) NOT NULL DEFAULT 'pasted-text',
  status ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  raw_text LONGTEXT NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  valid_count INT NOT NULL DEFAULT 0,
  issue_count INT NOT NULL DEFAULT 0,
  cleaned_count INT NOT NULL DEFAULT 0,
  cleaned_json LONGTEXT NULL,
  issues_json LONGTEXT NULL,
  agent_notes TEXT NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  INDEX idx_cp_text_recognition_tasks_status_time (status, created_at),
  INDEX idx_cp_text_recognition_tasks_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_system_settings (
  setting_key VARCHAR(120) PRIMARY KEY,
  setting_value LONGTEXT NULL,
  description VARCHAR(255) NULL,
  updated_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cp_system_settings_updated_at (updated_at),
  CONSTRAINT fk_cp_system_settings_updated_by FOREIGN KEY (updated_by) REFERENCES cp_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO cp_system_settings (setting_key, setting_value, description)
SELECT 'llm.enabled', 'true', 'Whether text recognition should call the configured LLM first'
WHERE NOT EXISTS (SELECT 1 FROM cp_system_settings WHERE setting_key = 'llm.enabled');

INSERT INTO cp_system_settings (setting_key, setting_value, description)
SELECT 'llm.base_url', 'https://api.deepseek.com', 'OpenAI-compatible base URL for text recognition'
WHERE NOT EXISTS (SELECT 1 FROM cp_system_settings WHERE setting_key = 'llm.base_url');

INSERT INTO cp_system_settings (setting_key, setting_value, description)
SELECT 'llm.model', 'deepseek-v4-flash', 'LLM model name for text recognition'
WHERE NOT EXISTS (SELECT 1 FROM cp_system_settings WHERE setting_key = 'llm.model');

INSERT INTO cp_system_settings (setting_key, setting_value, description)
SELECT 'llm.api_key', '', 'API key for the configured OpenAI-compatible LLM provider'
WHERE NOT EXISTS (SELECT 1 FROM cp_system_settings WHERE setting_key = 'llm.api_key');

-- No administrator credential is seeded here. Production administrators must
-- be provisioned explicitly with a deployment-specific secret.
