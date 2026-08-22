package com.cargoplanner.backend.workspacefile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockMultipartFile;

class WorkspaceFileServiceTest {
  @TempDir
  Path temporaryDirectory;

  private JdbcTemplate jdbcTemplate;
  private WorkspaceFileService service;
  private MutableClock clock;
  private AuthenticatedUser alice;
  private AuthenticatedUser bob;

  @BeforeEach
  void setUp() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1",
        "sa",
        ""
    );
    jdbcTemplate = new JdbcTemplate(dataSource);
    jdbcTemplate.execute("""
        CREATE TABLE cp_users (
          id BIGINT PRIMARY KEY,
          display_name VARCHAR(80) NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_workspace_files (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT NOT NULL,
          owner_display_name VARCHAR(80) NOT NULL,
          owner_folder VARCHAR(160) NOT NULL,
          original_file_name VARCHAR(255) NOT NULL,
          normalized_file_name VARCHAR(255) NOT NULL,
          version_no INT NOT NULL,
          stored_relative_path VARCHAR(512) NOT NULL,
          content_type VARCHAR(160) NOT NULL,
          extension VARCHAR(20) NOT NULL,
          size_bytes BIGINT NOT NULL,
          sha256 CHAR(64) NOT NULL,
          source_channel VARCHAR(40) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          last_accessed_at TIMESTAMP,
          reuse_count INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL,
          UNIQUE(user_id, normalized_file_name, version_no),
          FOREIGN KEY (user_id) REFERENCES cp_users(id) ON DELETE CASCADE
        )
        """);
    jdbcTemplate.update("INSERT INTO cp_users (id, display_name) VALUES (1, 'Alice Zhang'), (2, 'Bob Li')");

    WorkspaceFileProperties properties = new WorkspaceFileProperties();
    properties.setRoot(temporaryDirectory.toString());
    properties.setRetention(Duration.ofDays(14));
    properties.setMaxFileSizeBytes(1024 * 1024);
    clock = new MutableClock(Instant.parse("2026-07-14T00:00:00Z"));
    service = new WorkspaceFileService(jdbcTemplate, properties, clock);
    alice = new AuthenticatedUser(1, "alice", "Alice Zhang", "EMPLOYEE", "ACTIVE");
    bob = new AuthenticatedUser(2, "bob", "Bob Li", "EMPLOYEE", "ACTIVE");
  }

  @Test
  void storesInsideSafeOwnerFolderAndDeduplicatesIdenticalUpload() throws Exception {
    MockMultipartFile upload = workbook("../../danger.xlsx", "same-content");

    WorkspaceFileService.SavedWorkspaceFile first = service.store(upload, alice, "QUICK_IMPORT");
    WorkspaceFileService.SavedWorkspaceFile duplicate = service.store(upload, alice, "QUICK_IMPORT");

    assertThat(first.path()).startsWith(temporaryDirectory.toAbsolutePath());
    assertThat(first.path().getParent().getFileName().toString()).isEqualTo("Alice_Zhang-u1");
    assertThat(first.record().originalFileName()).isEqualTo("danger.xlsx");
    assertThat(Files.readString(first.path())).isEqualTo("same-content");
    assertThat(duplicate.record().id()).isEqualTo(first.record().id());
    assertThat(duplicate.deduplicated()).isTrue();
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_workspace_files", Integer.class)).isEqualTo(1);
  }

  @Test
  void sameNameWithChangedContentCreatesNextVersion() {
    WorkspaceFileService.SavedWorkspaceFile first = service.store(workbook("cargo.xlsx", "v1"), alice, null);
    WorkspaceFileService.SavedWorkspaceFile second = service.store(workbook("cargo.xlsx", "v2"), alice, null);

    assertThat(second.record().id()).isNotEqualTo(first.record().id());
    assertThat(first.record().version()).isEqualTo(1);
    assertThat(second.record().version()).isEqualTo(2);
    assertThat(service.listOwned(alice, null, 0, 100, false))
        .extracting((value) -> ((java.util.List<?>) value.get("items")).size())
        .isEqualTo(2);
  }

  @Test
  void otherUserCannotReadOrDeleteAnOwnedFile() {
    WorkspaceFileService.SavedWorkspaceFile saved = service.store(workbook("private.xlsx", "secret"), alice, null);

    assertThatThrownBy(() -> service.ownedContent(saved.record().id(), bob))
        .isInstanceOf(ApiException.class)
        .satisfies((error) -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.NOT_FOUND));
    assertThatThrownBy(() -> service.deleteOwned(saved.record().id(), bob))
        .isInstanceOf(ApiException.class)
        .satisfies((error) -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.NOT_FOUND));
    assertThat(Files.exists(saved.path())).isTrue();
  }

  @Test
  void rejectsPoisonedDatabasePathInsteadOfEscapingStorageRoot() {
    WorkspaceFileService.SavedWorkspaceFile saved = service.store(workbook("cargo.xlsx", "content"), alice, null);
    jdbcTemplate.update(
        "UPDATE cp_workspace_files SET stored_relative_path = '../../outside.xlsx' WHERE id = ?",
        saved.record().id()
    );

    assertThatThrownBy(() -> service.ownedContent(saved.record().id(), alice))
        .isInstanceOf(ApiException.class)
        .satisfies((error) -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR));
  }

  @Test
  void reuseRefreshesRetentionAndCleanupRemovesExpiredRowsAndBytes() {
    WorkspaceFileService.SavedWorkspaceFile reused = service.store(workbook("reuse.xlsx", "keep"), alice, null);
    clock.advance(Duration.ofDays(13));

    Map<String, Object> refreshed = service.reuse(reused.record().id(), alice);
    assertThat(refreshed.get("reuseCount")).isEqualTo(1);
    assertThat(refreshed.get("expiresAt")).isEqualTo("2026-08-10T00:00:00Z");

    WorkspaceFileService.SavedWorkspaceFile expired = service.store(workbook("expire.xlsx", "remove"), alice, null);
    clock.advance(Duration.ofDays(15));
    int deleted = service.cleanupExpiredFiles();

    assertThat(deleted).isEqualTo(2);
    assertThat(Files.exists(reused.path())).isFalse();
    assertThat(Files.exists(expired.path())).isFalse();
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_workspace_files", Integer.class)).isZero();
  }

  @Test
  void rejectsUnsupportedFilesAndOversizedUploads() {
    assertThatThrownBy(() -> service.store(workbook("payload.exe", "x"), alice, null))
        .isInstanceOf(ApiException.class)
        .satisfies((error) -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.BAD_REQUEST));

    byte[] tooLarge = new byte[1024 * 1024 + 1];
    MockMultipartFile upload = new MockMultipartFile("file", "large.xlsx", null, tooLarge);
    assertThatThrownBy(() -> service.store(upload, alice, null))
        .isInstanceOf(ApiException.class)
        .satisfies((error) -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE));
  }

  @Test
  void cleanupDrainsMoreThanOneExpiredBatch() {
    Instant expiredAt = clock.instant().minus(Duration.ofDays(1));
    Instant createdAt = clock.instant().minus(Duration.ofDays(15));
    for (int index = 1; index <= 501; index++) {
      jdbcTemplate.update(
          """
          INSERT INTO cp_workspace_files (
            user_id, owner_display_name, owner_folder, original_file_name, normalized_file_name,
            version_no, stored_relative_path, content_type, extension, size_bytes, sha256,
            source_channel, expires_at, last_accessed_at, reuse_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
          """,
          1L,
          "Alice Zhang",
          "Alice_Zhang-u1",
          "expired.xlsx",
          "expired.xlsx",
          index,
          "Alice_Zhang-u1/expired-" + index + ".xlsx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "xlsx",
          0L,
          "0".repeat(64),
          "USER_UPLOAD",
          Timestamp.from(expiredAt),
          Timestamp.from(createdAt),
          Timestamp.from(createdAt),
          Timestamp.from(createdAt)
      );
    }

    assertThat(service.cleanupExpiredFiles()).isEqualTo(501);
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_workspace_files", Integer.class)).isZero();
  }

  private MockMultipartFile workbook(String name, String content) {
    return new MockMultipartFile(
        "file",
        name,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content.getBytes(StandardCharsets.UTF_8)
    );
  }

  private static final class MutableClock extends Clock {
    private Instant instant;

    private MutableClock(Instant instant) {
      this.instant = instant;
    }

    void advance(Duration duration) {
      instant = instant.plus(duration);
    }

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return instant;
    }
  }
}
