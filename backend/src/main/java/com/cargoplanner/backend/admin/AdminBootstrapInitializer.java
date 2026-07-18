package com.cargoplanner.backend.admin;

import com.cargoplanner.backend.auth.PasswordHasher;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Creates the first administrator only when deployment explicitly opts in. */
@Component
@Order(100)
public class AdminBootstrapInitializer implements ApplicationRunner {
  private static final Logger LOGGER = LoggerFactory.getLogger(AdminBootstrapInitializer.class);

  private final JdbcTemplate jdbcTemplate;
  private final PasswordHasher passwordHasher;
  private final AdminBootstrapProperties properties;

  public AdminBootstrapInitializer(
      JdbcTemplate jdbcTemplate,
      PasswordHasher passwordHasher,
      AdminBootstrapProperties properties
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.passwordHasher = passwordHasher;
    this.properties = properties;
  }

  @Override
  @Transactional
  public void run(ApplicationArguments args) {
    BootstrapSettings bootstrap = readBootstrapSettings();
    boolean migratedLegacyAdministrator = auditAndMigrateLegacyDefaultCredential(bootstrap);
    if (migratedLegacyAdministrator || bootstrap == null) return;

    String username = bootstrap.username();
    String password = bootstrap.password();
    String displayName = bootstrap.displayName();

    Integer userCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_users", Integer.class);
    if (userCount != null && userCount > 0) {
      LOGGER.info("Administrator bootstrap skipped because cp_users is not empty");
      return;
    }

    PasswordHasher.PasswordHash passwordHash = passwordHasher.hash(password);
    try {
      jdbcTemplate.update(
          """
          INSERT INTO cp_users (
            username, display_name, role, party_role, status,
            password_salt, password_hash, password_iterations
          ) VALUES (?, ?, 'ADMIN', 'AGENT', 'ACTIVE', ?, ?, ?)
          """,
          username,
          displayName,
          passwordHash.salt(),
          passwordHash.hash(),
          passwordHash.iterations()
      );
    } catch (DuplicateKeyException concurrentBootstrap) {
      Integer existing = jdbcTemplate.queryForObject(
          "SELECT COUNT(*) FROM cp_users WHERE username = ? AND role = 'ADMIN'",
          Integer.class,
          username
      );
      if (existing == null || existing == 0) throw concurrentBootstrap;
      return;
    }

    Long adminId = jdbcTemplate.queryForObject(
        "SELECT id FROM cp_users WHERE username = ?",
        Long.class,
        username
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (
          admin_user_id, action, target_type, target_id, detail, ip_address
        ) VALUES (?, 'BOOTSTRAP_ADMIN', 'USER', ?, ?, NULL)
        """,
        adminId,
        adminId,
        "Explicit deployment bootstrap created administrator " + username
    );
    LOGGER.warn(
        "Initial administrator '{}' was created from explicit bootstrap configuration; "
            + "disable bootstrap and rotate/remove the deployment secret now",
        username
    );
  }

  private BootstrapSettings readBootstrapSettings() {
    if (!properties.isEnabled()) return null;
    String username = normalizeUsername(properties.getUsername());
    String password = properties.getPassword() == null ? "" : properties.getPassword();
    String displayName = normalizeDisplayName(properties.getDisplayName());
    validatePassword(password, username);
    return new BootstrapSettings(username, password, displayName);
  }

  private boolean auditAndMigrateLegacyDefaultCredential(BootstrapSettings bootstrap) {
    jdbcTemplate.execute(
        """
        CREATE TABLE IF NOT EXISTS cp_security_migrations (
          migration_key VARCHAR(100) PRIMARY KEY,
          applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    );
    Integer alreadyAudited = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_security_migrations WHERE migration_key = ?",
        Integer.class,
        "reject-active-legacy-fixed-passwords-v1"
    );
    if (alreadyAudited != null && alreadyAudited > 0) return false;

    var credentials = jdbcTemplate.query(
        """
        SELECT id, username, role, password_salt, password_hash, password_iterations
        FROM cp_users
        WHERE status = 'ACTIVE' AND password_iterations = ?
        """,
        (rs, rowNumber) -> new StoredCredential(
            rs.getLong("id"),
            rs.getString("username"),
            rs.getString("role"),
            rs.getString("password_salt"),
            rs.getString("password_hash"),
            rs.getInt("password_iterations")
        ),
        PasswordHasher.DEFAULT_ITERATIONS
    );
    var compromisedCredentials = credentials.stream()
        .filter(this::usesKnownLegacyPassword)
        .toList();
    if (compromisedCredentials.isEmpty()) {
      markLegacyCredentialAuditComplete();
      return false;
    }
    if (bootstrap == null || compromisedCredentials.size() != 1) {
      throw legacyCredentialMigrationRequired(compromisedCredentials);
    }

    StoredCredential migrationTarget = compromisedCredentials.get(0);
    if (!"ADMIN".equals(migrationTarget.role())
        || !migrationTarget.username().equalsIgnoreCase(bootstrap.username())) {
      throw legacyCredentialMigrationRequired(compromisedCredentials);
    }

    PasswordHasher.PasswordHash passwordHash = passwordHasher.hash(bootstrap.password());
    int updated = jdbcTemplate.update(
        """
        UPDATE cp_users
        SET password_salt = ?, password_hash = ?, password_iterations = ?
        WHERE id = ? AND status = 'ACTIVE'
        """,
        passwordHash.salt(),
        passwordHash.hash(),
        passwordHash.iterations(),
        migrationTarget.id()
    );
    if (updated != 1) {
      throw new IllegalStateException("Legacy administrator password migration was not applied");
    }
    jdbcTemplate.update(
        """
        UPDATE cp_login_devices
        SET online = 0, session_token_hash = NULL, revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
        """,
        migrationTarget.id()
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (
          admin_user_id, action, target_type, target_id, detail, ip_address
        ) VALUES (?, 'MIGRATE_LEGACY_ADMIN_PASSWORD', 'USER', ?, ?, NULL)
        """,
        migrationTarget.id(),
        migrationTarget.id(),
        "Rotated known legacy fixed credential through explicit deployment bootstrap"
    );
    markLegacyCredentialAuditComplete();
    LOGGER.warn(
        "Legacy administrator '{}' was migrated to an explicit deployment password; "
            + "disable bootstrap and remove the deployment secret now",
        migrationTarget.username()
    );
    return true;
  }

  private IllegalStateException legacyCredentialMigrationRequired(
      List<StoredCredential> compromisedCredentials
  ) {
    String usernames = compromisedCredentials.stream()
        .map(StoredCredential::username)
        .reduce((left, right) -> left + ", " + right)
        .orElse("unknown");
    return new IllegalStateException(
        "Unsafe legacy fixed credential is still active for: "
            + usernames
            + "; for a single existing administrator, set APP_BOOTSTRAP_ADMIN_ENABLED=true, "
            + "APP_BOOTSTRAP_ADMIN_USERNAME to that exact username, and "
            + "APP_BOOTSTRAP_ADMIN_PASSWORD to a strong password that does not contain the "
            + "username, then restart once. Rotate or disable multiple/non-admin accounts "
            + "before startup"
    );
  }

  private void markLegacyCredentialAuditComplete() {
    try {
      jdbcTemplate.update(
          "INSERT INTO cp_security_migrations (migration_key) VALUES (?)",
          "reject-active-legacy-fixed-passwords-v1"
      );
    } catch (DuplicateKeyException concurrentAudit) {
      LOGGER.debug("Legacy fixed-password audit was completed by another application instance");
    }
  }

  private boolean usesKnownLegacyPassword(StoredCredential credential) {
    try {
      return passwordHasher.verify(
          "123456",
          credential.salt(),
          credential.hash(),
          credential.iterations()
      ) || passwordHasher.verify(
          "Admin@123456",
          credential.salt(),
          credential.hash(),
          credential.iterations()
      );
    } catch (IllegalArgumentException invalidStoredCredential) {
      return false;
    }
  }

  private String normalizeUsername(String value) {
    String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    if (!normalized.matches("[a-z0-9][a-z0-9._-]{2,63}")) {
      throw new IllegalStateException(
          "APP_BOOTSTRAP_ADMIN_USERNAME must contain 3-64 safe username characters"
      );
    }
    return normalized;
  }

  private String normalizeDisplayName(String value) {
    String normalized = value == null ? "" : value.trim();
    if (normalized.isBlank() || normalized.length() > 80) {
      throw new IllegalStateException("APP_BOOTSTRAP_ADMIN_DISPLAY_NAME must contain 1-80 characters");
    }
    return normalized;
  }

  private void validatePassword(String password, String username) {
    boolean hasUpper = password.chars().anyMatch(Character::isUpperCase);
    boolean hasLower = password.chars().anyMatch(Character::isLowerCase);
    boolean hasDigit = password.chars().anyMatch(Character::isDigit);
    boolean hasSymbol = password.chars().anyMatch(value -> !Character.isLetterOrDigit(value));
    if (password.length() < 12 || password.length() > 128
        || !hasUpper || !hasLower || !hasDigit || !hasSymbol) {
      throw new IllegalStateException(
          "APP_BOOTSTRAP_ADMIN_PASSWORD must be 12-128 characters and include upper, lower, "
              + "digit, and symbol"
      );
    }
    if (password.toLowerCase(Locale.ROOT).contains(username)) {
      throw new IllegalStateException(
          "APP_BOOTSTRAP_ADMIN_PASSWORD must not contain APP_BOOTSTRAP_ADMIN_USERNAME"
      );
    }
  }

  private record BootstrapSettings(String username, String password, String displayName) {}

  private record StoredCredential(
      long id,
      String username,
      String role,
      String salt,
      String hash,
      int iterations
  ) {}
}
