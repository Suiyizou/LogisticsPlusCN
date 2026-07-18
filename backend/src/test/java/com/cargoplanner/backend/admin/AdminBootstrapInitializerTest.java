package com.cargoplanner.backend.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.shipment.ShipmentSchemaInitializer;
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
  void runsAfterAdditiveSchemaInitialization() {
    assertThat(ShipmentSchemaInitializer.class.getAnnotation(Order.class).value())
        .isLessThan(AdminBootstrapInitializer.class.getAnnotation(Order.class).value());
  }

  @Test
  void refusesToStartWithTheLegacyKnownAdministratorCredential() {
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

    assertThatThrownBy(() -> initializer().run(null))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("legacy fixed credential");
  }

  private AdminBootstrapInitializer initializer() {
    return new AdminBootstrapInitializer(jdbcTemplate, new PasswordHasher(), properties);
  }
}
