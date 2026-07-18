package com.cargoplanner.backend.workspacefile;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Ensures existing installations receive the file metadata table on the next backend start. */
@Component
public class WorkspaceFileSchemaInitializer implements ApplicationRunner {
  private final JdbcTemplate jdbcTemplate;

  public WorkspaceFileSchemaInitializer(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public void run(ApplicationArguments args) {
    jdbcTemplate.execute("""
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """);
  }
}
