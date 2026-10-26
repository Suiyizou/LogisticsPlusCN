package com.cargoplanner.backend.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.spy;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.shipment.SecretValueCodec;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class LlmSettingsServiceTest {
  private static final String ENV_KEY = "sk-environment-synthetic-only";
  private static final String SAVED_KEY = "sk-saved-synthetic-only";
  private static final AuthenticatedUser ADMIN =
      new AuthenticatedUser(1, "admin", "Administrator", "ADMIN", "ACTIVE", "AGENT");
  @TempDir Path temporaryDirectory;
  private JdbcTemplate jdbc;
  private LlmSettingsService service;

  @BeforeEach
  void setUp() {
    jdbc = spy(new JdbcTemplate(new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "")));
    jdbc.execute("""
        CREATE TABLE cp_system_settings (
          setting_key VARCHAR(120) PRIMARY KEY, setting_value CLOB,
          description VARCHAR(255), updated_by BIGINT)
        """);
    jdbc.execute("""
        CREATE TABLE cp_admin_audit_log (
          admin_user_id BIGINT, action VARCHAR(100), target_type VARCHAR(40),
          target_id BIGINT, detail VARCHAR(512), ip_address VARCHAR(64))
        """);
    doAnswer(invocation -> {
      if (invocation.<String>getArgument(0).contains("ENGINE=InnoDB")) return null;
      return invocation.callRealMethod();
    }).when(jdbc).execute(anyString());
    service = restarted();
  }

  @Test
  void environmentKeyIsUsedOnlyWhenNoExplicitSettingExistsAndIsNeverSeeded() {
    assertThat(service.runtimeSettings().apiKey()).isEqualTo(ENV_KEY);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_system_settings WHERE setting_key='llm.api_key'",
        Integer.class)).isZero();
  }

  @Test
  void clearOverridesEnvironmentAndRemainsClearedAfterRestart() {
    assertThat(service.updateSettings(new LlmSettingsRequest(null, null, null, null, true), ADMIN, null))
        .containsEntry("apiKeyConfigured", false).containsEntry("apiKeyPreview", "");
    assertThat(restarted().runtimeSettings().apiKey()).isEmpty();
  }

  @Test
  void savedKeyIsEncryptedAndCanBeReadAfterRestart() {
    service.updateSettings(new LlmSettingsRequest(null, null, null, SAVED_KEY, false), ADMIN, null);
    assertThat(storedKey()).startsWith("{aes-gcm}v1:").doesNotContain(SAVED_KEY);
    assertThat(restarted().runtimeSettings().apiKey()).isEqualTo(SAVED_KEY);
    assertThat(service.publicSettings().toString()).doesNotContain(SAVED_KEY, ENV_KEY);
    assertThat(service.runtimeSettings().toString()).doesNotContain(SAVED_KEY).contains("<redacted>");
  }

  @Test
  void legacyPlaintextIsEncryptedOnFirstLoadWithoutChangingEffectiveValue() {
    jdbc.update("INSERT INTO cp_system_settings (setting_key, setting_value) VALUES ('llm.api_key', ?)", SAVED_KEY);
    assertThat(service.runtimeSettings().apiKey()).isEqualTo(SAVED_KEY);
    assertThat(storedKey()).startsWith("{aes-gcm}v1:").doesNotContain(SAVED_KEY);
    assertThat(restarted().runtimeSettings().apiKey()).isEqualTo(SAVED_KEY);
  }

  @Test
  void legacyConversionDoesNotOverwriteConcurrentKeyUpdateDifferingOnlyInCase() {
    jdbc.update("INSERT INTO cp_system_settings (setting_key, setting_value) VALUES ('llm.api_key', ?)", SAVED_KEY);
    var codec = spy(new SecretValueCodec(temporaryDirectory.resolve("backend.key").toString()));
    doAnswer(invocation -> {
      jdbc.update("UPDATE cp_system_settings SET setting_value=? WHERE setting_key='llm.api_key'", SAVED_KEY.toUpperCase());
      return invocation.callRealMethod();
    }).when(codec).encrypt(anyString(), anyString());
    service = new LlmSettingsService(jdbc, codec, "http://127.0.0.1:9", "test-model", ENV_KEY);
    assertThat(service.runtimeSettings().apiKey()).isEqualTo(SAVED_KEY.toUpperCase());
    assertThat(storedKey()).isEqualTo(SAVED_KEY.toUpperCase());
  }

  @Test
  void legacyNullAndEmptyValuesAreExplicitClear() {
    jdbc.update("INSERT INTO cp_system_settings (setting_key, setting_value) VALUES ('llm.api_key', NULL)");
    assertThat(service.runtimeSettings().apiKey()).isEmpty();
    jdbc.update("UPDATE cp_system_settings SET setting_value='' WHERE setting_key='llm.api_key'");
    assertThat(restarted().runtimeSettings().apiKey()).isEmpty();
  }

  @Test
  void blankKeyInputKeepsExistingKeyWhileClearTakesPrecedence() {
    service.updateSettings(new LlmSettingsRequest(null, null, null, SAVED_KEY, false), ADMIN, null);
    String encrypted = storedKey();
    service.updateSettings(new LlmSettingsRequest(false, null, null, " ", false), ADMIN, null);
    assertThat(storedKey()).isEqualTo(encrypted);
    assertThat(service.runtimeSettings().apiKey()).isEqualTo(SAVED_KEY);
    service.updateSettings(new LlmSettingsRequest(null, null, null, SAVED_KEY, true), ADMIN, null);
    assertThat(storedKey()).isEmpty();
    assertThat(service.runtimeSettings().apiKey()).isEmpty();
  }

  @Test
  void corruptCiphertextFailsClosedInsteadOfUsingEnvironmentKey() {
    jdbc.update("INSERT INTO cp_system_settings (setting_key, setting_value) VALUES ('llm.api_key', '{aes-gcm}v1:bad:bad')");
    assertThatThrownBy(() -> service.runtimeSettings()).isInstanceOf(IllegalStateException.class);
  }

  @Test
  void versionedMigrationRemovesOnlyUntouchedEmptyBaselineSeed() throws Exception {
    jdbc.update("INSERT INTO cp_system_settings (setting_key, setting_value) VALUES ('llm.api_key', '')");
    applyKeyMigration();
    assertThat(service.runtimeSettings().apiKey()).isEqualTo(ENV_KEY);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_system_settings WHERE setting_key='llm.api_key'",
        Integer.class)).isZero();
  }

  @Test
  void versionedMigrationPreservesAnAdministratorsHistoricalClear() throws Exception {
    jdbc.update("INSERT INTO cp_system_settings (setting_key, setting_value, updated_by) VALUES ('llm.api_key', '', 1)");
    applyKeyMigration();
    assertThat(service.runtimeSettings().apiKey()).isEmpty();
    assertThat(storedKey()).isEmpty();
  }

  private void applyKeyMigration() throws Exception {
    try (var stream = getClass().getResourceAsStream("/db/migration/V2__llm_key_inheritance.sql")) {
      jdbc.execute(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
    }
  }

  private LlmSettingsService restarted() {
    return new LlmSettingsService(jdbc, new SecretValueCodec(temporaryDirectory.resolve("backend.key").toString()),
        "http://127.0.0.1:9", "test-model", ENV_KEY);
  }

  private String storedKey() {
    return jdbc.queryForObject("SELECT setting_value FROM cp_system_settings WHERE setting_key='llm.api_key'", String.class);
  }
}
