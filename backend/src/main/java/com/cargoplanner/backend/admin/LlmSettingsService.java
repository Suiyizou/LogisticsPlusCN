package com.cargoplanner.backend.admin;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LlmSettingsService {
  private static final String KEY_ENABLED = "llm.enabled";
  private static final String KEY_BASE_URL = "llm.base_url";
  private static final String KEY_MODEL = "llm.model";
  private static final String KEY_API_KEY = "llm.api_key";
  private static final String DEFAULT_MODEL = "deepseek-v4-flash";

  private final JdbcTemplate jdbcTemplate;
  private final String defaultBaseUrl;
  private final String defaultModel;
  private final String defaultApiKey;
  private volatile boolean tableReady = false;

  public LlmSettingsService(
      JdbcTemplate jdbcTemplate,
      @Value("${spring.ai.openai.base-url:https://api.deepseek.com}") String defaultBaseUrl,
      @Value("${spring.ai.openai.chat.options.model:deepseek-v4-flash}") String defaultModel,
      @Value("${spring.ai.openai.api-key:}") String defaultApiKey
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.defaultBaseUrl = defaultBaseUrl;
    this.defaultModel = defaultModel;
    this.defaultApiKey = defaultApiKey;
  }

  public Map<String, Object> publicSettings() {
    LlmRuntimeSettings settings = runtimeSettings();
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("enabled", settings.enabled());
    result.put("baseUrl", settings.baseUrl());
    result.put("model", settings.model());
    result.put("apiKeyConfigured", settings.hasApiKey());
    result.put("apiKeyPreview", apiKeyPreview(settings.apiKey()));
    result.put("provider", "OpenAI-compatible HTTP");
    return result;
  }

  public LlmRuntimeSettings runtimeSettings() {
    ensureTable();
    Map<String, String> values = loadValues();
    String apiKey = firstNonBlank(values.get(KEY_API_KEY), defaultApiKey);
    return new LlmRuntimeSettings(
        Boolean.parseBoolean(firstNonBlank(values.get(KEY_ENABLED), "true")),
        firstNonBlank(values.get(KEY_BASE_URL), defaultBaseUrl, "https://api.deepseek.com"),
        normalizeModel(firstNonBlank(values.get(KEY_MODEL), defaultModel, DEFAULT_MODEL)),
        apiKey
    );
  }

  @Transactional
  public Map<String, Object> updateSettings(LlmSettingsRequest request, AuthenticatedUser admin, String ip) {
    ensureTable();
    if (request == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "LLM settings are required");
    }
    if (request.enabled() != null) {
      upsert(KEY_ENABLED, String.valueOf(request.enabled()), admin.id());
    }
    if (request.baseUrl() != null) {
      String baseUrl = clean(request.baseUrl());
      if (baseUrl.isBlank() || !baseUrl.matches("^https?://.+")) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Base URL must start with http:// or https://");
      }
      upsert(KEY_BASE_URL, baseUrl.replaceAll("/+$", ""), admin.id());
    }
    if (request.model() != null) {
      String model = normalizeModel(request.model());
      if (model.isBlank()) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Model is required");
      }
      upsert(KEY_MODEL, model, admin.id());
    }
    if (Boolean.TRUE.equals(request.clearApiKey())) {
      upsert(KEY_API_KEY, "", admin.id());
    } else if (request.apiKey() != null && !request.apiKey().isBlank()) {
      upsert(KEY_API_KEY, clean(request.apiKey()), admin.id());
    }
    audit(admin.id(), ip);
    return publicSettings();
  }

  private void ensureTable() {
    if (tableReady) return;
    synchronized (this) {
      if (tableReady) return;
      jdbcTemplate.execute(
          """
          CREATE TABLE IF NOT EXISTS cp_system_settings (
            setting_key VARCHAR(120) PRIMARY KEY,
            setting_value LONGTEXT NULL,
            description VARCHAR(255) NULL,
            updated_by BIGINT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_cp_system_settings_updated_at (updated_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
          """
      );
      seedDefaults();
      tableReady = true;
    }
  }

  private void seedDefaults() {
    upsertIfMissing(KEY_ENABLED, "true", "Whether text recognition should call the configured LLM first");
    upsertIfMissing(KEY_BASE_URL, firstNonBlank(defaultBaseUrl, "https://api.deepseek.com"), "OpenAI-compatible base URL for text recognition");
    upsertIfMissing(KEY_MODEL, normalizeModel(firstNonBlank(defaultModel, DEFAULT_MODEL)), "LLM model name for text recognition");
    upsertIfMissing(KEY_API_KEY, firstNonBlank(defaultApiKey, ""), "API key for the configured OpenAI-compatible LLM provider");
  }

  private Map<String, String> loadValues() {
    List<Map<String, Object>> rows = jdbcTemplate.queryForList(
        """
        SELECT setting_key, setting_value
        FROM cp_system_settings
        WHERE setting_key IN (?, ?, ?, ?)
        """,
        KEY_ENABLED,
        KEY_BASE_URL,
        KEY_MODEL,
        KEY_API_KEY
    );
    Map<String, String> values = new LinkedHashMap<>();
    for (Map<String, Object> row : rows) {
      values.put(String.valueOf(row.get("setting_key")), clean(row.get("setting_value")));
    }
    return values;
  }

  private void upsertIfMissing(String key, String value, String description) {
    Integer count = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_system_settings WHERE setting_key = ?",
        Integer.class,
        key
    );
    if (count == null || count == 0) {
      jdbcTemplate.update(
          "INSERT INTO cp_system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)",
          key,
          value,
          description
      );
    }
  }

  private void upsert(String key, String value, Long adminId) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_system_settings (setting_key, setting_value, updated_by)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)
        """,
        key,
        value,
        adminId
    );
  }

  private void audit(Long adminId, String ip) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (admin_user_id, action, target_type, target_id, detail, ip_address)
        VALUES (?, 'UPDATE_LLM_SETTINGS', 'SYSTEM', NULL, 'Updated LLM settings', ?)
        """,
        adminId,
        ClientInfo.trim(ip, 64)
    );
  }

  private String apiKeyPreview(String apiKey) {
    String value = clean(apiKey);
    if (value.isBlank()) return "";
    if (value.length() <= 8) return "****";
    return value.substring(0, 4) + "..." + value.substring(value.length() - 4);
  }

  private String normalizeModel(Object value) {
    String model = clean(value);
    if ("deepseekv4-flash".equalsIgnoreCase(model)) {
      return DEFAULT_MODEL;
    }
    return model;
  }

  private String firstNonBlank(String... values) {
    for (String value : values) {
      String text = clean(value);
      if (!text.isBlank()) return text;
    }
    return "";
  }

  private String clean(Object value) {
    return value == null ? "" : String.valueOf(value).trim();
  }

  public record LlmRuntimeSettings(
      boolean enabled,
      String baseUrl,
      String model,
      String apiKey
  ) {
    public boolean hasApiKey() {
      return apiKey != null && !apiKey.isBlank();
    }
  }
}
