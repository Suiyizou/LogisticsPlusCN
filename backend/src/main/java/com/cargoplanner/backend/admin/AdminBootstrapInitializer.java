package com.cargoplanner.backend.admin;

import com.cargoplanner.backend.auth.PasswordHasher;
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
    rejectActiveLegacyDefaultCredential();
    if (!properties.isEnabled()) return;

    String username = normalizeUsername(properties.getUsername());
    String password = properties.getPassword() == null ? "" : properties.getPassword();
    String displayName = normalizeDisplayName(properties.getDisplayName());
    validatePassword(password, username);

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

  private void rejectActiveLegacyDefaultCredential() {
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
    if (alreadyAudited != null && alreadyAudited > 0) return;

    var credentials = jdbcTemplate.query(
        """
        SELECT username, password_salt, password_hash, password_iterations
        FROM cp_users
        WHERE status = 'ACTIVE' AND password_iterations = 120000
        """,
        (rs, rowNumber) -> new StoredCredential(
            rs.getString("username"),
            rs.getString("password_salt"),
            rs.getString("password_hash"),
            rs.getInt("password_iterations")
        )
    );
    var compromisedUsers = credentials.stream()
        .filter(this::usesKnownLegacyPassword)
        .map(StoredCredential::username)
        .toList();
    if (!compromisedUsers.isEmpty()) {
      throw new IllegalStateException(
          "Unsafe legacy fixed credential is still active for: "
              + String.join(", ", compromisedUsers)
              + "; rotate or disable it before startup"
      );
    }
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
    if (password.length() < 12 || !hasUpper || !hasLower || !hasDigit || !hasSymbol
        || password.toLowerCase(Locale.ROOT).contains(username)) {
      throw new IllegalStateException(
          "APP_BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters and include upper, lower, digit, and symbol"
      );
    }
  }

  private record StoredCredential(String username, String salt, String hash, int iterations) {}
}
