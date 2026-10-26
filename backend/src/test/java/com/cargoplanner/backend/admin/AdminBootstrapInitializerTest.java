package com.cargoplanner.backend.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.auth.PasswordHasher;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class AdminBootstrapInitializerTest {
  private JdbcTemplate jdbcTemplate;
  private AdminBootstrapProperties properties;

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
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(64) NOT NULL UNIQUE,
          display_name VARCHAR(80) NOT NULL,
          role VARCHAR(24) NOT NULL,
          party_role VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL,
          password_salt VARCHAR(128) NOT NULL,
          password_hash VARCHAR(256) NOT NULL,
          password_iterations INT NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_admin_audit_log (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          admin_user_id BIGINT,
          action VARCHAR(80) NOT NULL,
          target_type VARCHAR(40),
          target_id BIGINT,
          detail VARCHAR(512),
          ip_address VARCHAR(64)
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_login_devices (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT NOT NULL,
          online BOOLEAN NOT NULL DEFAULT FALSE,
          session_token_hash VARCHAR(64),
          revoked_at TIMESTAMP
        )
        """);

    jdbcTemplate.execute("CREATE TABLE cp_security_migrations (migration_key VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    properties = new AdminBootstrapProperties();
  }

  @Test
  void createsNoKnownDefaultAndRequiresExplicitStrongSecret() throws Exception {
    initializer().run(null);
    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_users", Integer.class))
        .isZero();

    properties.setEnabled(true);
    properties.setUsername("initial-admin");
    properties.setPassword("weak");
    assertThatThrownBy(() -> initializer().run(null))
        .isInstanceOf(IllegalStateException.class);

    properties.setPassword("Drewes!Initial9Secret");
    properties.setDisplayName("Initial Administrator");
    initializer().run(null);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT role FROM cp_users WHERE username = 'initial-admin'",
        String.class
    )).isEqualTo("ADMIN");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_admin_audit_log WHERE action = 'BOOTSTRAP_ADMIN'",
        Integer.class
    )).isEqualTo(1);

    String schema = Files.readString(Path.of("sql", "schema.sql"));
    assertThat(schema).doesNotContain("Admin@123456");
    assertThat(schema).doesNotContain("INSERT INTO cp_users");
  }

  @Test
  void neverBootstrapsIntoANonEmptyUserTable() {
    jdbcTemplate.update(
        """
        INSERT INTO cp_users (
          username, display_name, role, party_role, status,
          password_salt, password_hash, password_iterations
        ) VALUES ('employee', 'Existing User', 'EMPLOYEE', 'SHIPPER', 'ACTIVE', 'salt', 'hash', 1)
        """
    );
    properties.setEnabled(true);
    properties.setUsername("initial-admin");
    properties.setPassword("Drewes!Initial9Secret");
    initializer().run(null);

    assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_users", Integer.class))
        .isEqualTo(1);
  }

  @Test
  void bootstrapRetainsExplicitStartupOrderingAfterFlyway() {
    assertThat(AdminBootstrapInitializer.class.getAnnotation(Order.class).value()).isPositive();
  }

  @Test
  void refusesToStartWithTheLegacyKnownAdministratorCredential() {
    insertLegacyAdministrator();

    assertThatThrownBy(() -> initializer().run(null))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("legacy fixed credential")
        .hasMessageContaining("APP_BOOTSTRAP_ADMIN_ENABLED");
  }

  @Test
  void rotatesSingleLegacyAdministratorThroughExplicitBootstrap() {
    insertLegacyAdministrator();
    Long adminId = jdbcTemplate.queryForObject(
        "SELECT id FROM cp_users WHERE username = 'admin'",
        Long.class
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_login_devices (user_id, online, session_token_hash)
        VALUES (?, TRUE, 'existing-session')
        """,
        adminId
    );
    properties.setEnabled(true);
    properties.setUsername("admin");
    properties.setPassword("Fresh!Deploy9Secret");

    initializer().run(null);

    String salt = jdbcTemplate.queryForObject(
        "SELECT password_salt FROM cp_users WHERE id = ?",
        String.class,
        adminId
    );
    String hash = jdbcTemplate.queryForObject(
        "SELECT password_hash FROM cp_users WHERE id = ?",
        String.class,
        adminId
    );
    Integer iterations = jdbcTemplate.queryForObject(
        "SELECT password_iterations FROM cp_users WHERE id = ?",
        Integer.class,
        adminId
    );
    PasswordHasher hasher = new PasswordHasher();
    assertThat(hasher.verify("Fresh!Deploy9Secret", salt, hash, iterations)).isTrue();
    assertThat(hasher.verify("Admin@123456", salt, hash, iterations)).isFalse();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_admin_audit_log WHERE action = 'MIGRATE_LEGACY_ADMIN_PASSWORD'",
        Integer.class
    )).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_security_migrations",
        Integer.class
    )).isEqualTo(1);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_login_devices WHERE online = TRUE OR session_token_hash IS NOT NULL",
        Integer.class
    )).isZero();
  }

  @Test
  void doesNotTreatTheIterationCountAloneAsACompromisedPassword() {
    PasswordHasher.PasswordHash safeHash = new PasswordHasher().hash("Different!Safe9Secret");
    jdbcTemplate.update(
        """
        INSERT INTO cp_users (
          username, display_name, role, party_role, status,
          password_salt, password_hash, password_iterations
        ) VALUES ('employee', 'Existing User', 'EMPLOYEE', 'SHIPPER', 'ACTIVE', ?, ?, ?)
        """,
        safeHash.salt(),
        safeHash.hash(),
        safeHash.iterations()
    );

    initializer().run(null);

    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_security_migrations",
        Integer.class
    )).isEqualTo(1);
  }

  @Test
  void explainsWhenBootstrapPasswordContainsTheUsername() {
    properties.setEnabled(true);
    properties.setUsername("admin");
    properties.setPassword("Admin@123456");

    assertThatThrownBy(() -> initializer().run(null))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("must not contain APP_BOOTSTRAP_ADMIN_USERNAME");
  }

  private void insertLegacyAdministrator() {
    jdbcTemplate.update(
        """
        INSERT INTO cp_users (
          username, display_name, role, party_role, status,
          password_salt, password_hash, password_iterations
        ) VALUES (
          'admin', 'Legacy Administrator', 'ADMIN', 'AGENT', 'ACTIVE',
          'Y2FyZ28tcGxhbm5lci1hZG1pbg==',
          '4rg2oHHTUKOtWfBp95e6uxvLAMP2iD51D+wNazHYt34=', 120000
        )
        """
    );
  }

  private AdminBootstrapInitializer initializer() {
    return new AdminBootstrapInitializer(jdbcTemplate, new PasswordHasher(), properties);
  }
}
