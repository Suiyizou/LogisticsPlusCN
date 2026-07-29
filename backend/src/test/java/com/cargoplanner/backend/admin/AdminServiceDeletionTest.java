package com.cargoplanner.backend.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.cargoplanner.backend.auth.AuthService;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.common.RequestStats;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class AdminServiceDeletionTest {
  private JdbcTemplate jdbcTemplate;
  private AdminService service;
  private AuthenticatedUser administrator;

  @BeforeEach
  void setUp() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1",
        "sa",
        ""
    );
    jdbcTemplate = new JdbcTemplate(dataSource);
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_users (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(64) NOT NULL UNIQUE,
          display_name VARCHAR(80) NOT NULL,
          role VARCHAR(32) NOT NULL,
          party_role VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL,
          password_salt VARCHAR(128) NOT NULL,
          password_hash VARCHAR(256) NOT NULL,
          password_iterations INT NOT NULL,
          created_by BIGINT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login_at TIMESTAMP
        )
        """
    );
    jdbcTemplate.execute(
        "CREATE TABLE cp_login_devices (id BIGINT PRIMARY KEY, user_id BIGINT NOT NULL)"
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_customer_employee_assignments (
          customer_id BIGINT PRIMARY KEY,
          employee_user_id BIGINT NOT NULL
        )
        """
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_shipment_participants (
          shipment_id BIGINT NOT NULL,
          user_id BIGINT NOT NULL,
          PRIMARY KEY (shipment_id, user_id)
        )
        """
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_customers (
          id BIGINT PRIMARY KEY,
          responsible_agent_id BIGINT NOT NULL,
          status VARCHAR(20) NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_shipments (
          id BIGINT PRIMARY KEY,
          responsible_agent_id BIGINT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_admin_audit_log (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          admin_user_id BIGINT,
          action VARCHAR(80),
          target_type VARCHAR(40),
          target_id BIGINT,
          detail VARCHAR(512),
          ip_address VARCHAR(64)
        )
        """
    );
    PasswordHasher hasher = new PasswordHasher();
    PasswordHasher.PasswordHash password = hasher.hash("SecurePass123");
    jdbcTemplate.update(
        """
        INSERT INTO cp_users (
          id, username, display_name, role, party_role, status,
          password_salt, password_hash, password_iterations
        ) VALUES
          (1, 'admin', 'Administrator', 'ADMIN', 'AGENT', 'ACTIVE', ?, ?, ?),
          (2, 'sales', 'Sales User', 'BUSINESS', 'AGENT', 'ACTIVE', ?, ?, ?),
          (3, 'disabled-agent', 'Disabled Agent', 'OVERSEA_AGENT', 'AGENT', 'DISABLED', ?, ?, ?)
        """,
        password.salt(), password.hash(), password.iterations(),
        password.salt(), password.hash(), password.iterations(),
        password.salt(), password.hash(), password.iterations()
    );
    jdbcTemplate.update("INSERT INTO cp_login_devices (id, user_id) VALUES (10, 2)");
    jdbcTemplate.update(
        "INSERT INTO cp_customer_employee_assignments (customer_id, employee_user_id) VALUES (20, 2)"
    );
    jdbcTemplate.update(
        "INSERT INTO cp_shipment_participants (shipment_id, user_id) VALUES (30, 2)"
    );
    jdbcTemplate.update(
        "INSERT INTO cp_customers (id, responsible_agent_id, status) VALUES (40, 2, 'ACTIVE')"
    );
    jdbcTemplate.update(
        "INSERT INTO cp_shipments (id, responsible_agent_id) VALUES (50, 2)"
    );
    service = new AdminService(
        jdbcTemplate,
        hasher,
        mock(RequestStats.class),
        mock(AuthService.class)
    );
    administrator = new AuthenticatedUser(
        1L,
        "admin",
        "Administrator",
        "ADMIN",
        "ACTIVE"
    );
  }

  @Test
  void deletionRemovesAccountFromManagementWithoutTurningItIntoDisabledAccount() {
    Map<String, Object> response = service.deleteEmployee(
        2L,
        administrator,
        "127.0.0.1"
    );

    assertThat(response)
        .containsEntry("deleted", true)
        .containsEntry("status", "DELETED")
        .containsEntry("username", "sales");
    assertThat(jdbcTemplate.queryForMap(
        "SELECT username, status FROM cp_users WHERE id = 2"
    )).satisfies(row -> {
      assertThat(row.get("STATUS")).isEqualTo("DELETED");
      assertThat(row.get("USERNAME").toString()).startsWith("deleted_user_");
    });
    assertThat(service.listEmployees())
        .extracting(row -> row.get("username"))
        .containsExactly("admin", "disabled-agent");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_login_devices WHERE user_id = 2",
        Integer.class
    )).isZero();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_customer_employee_assignments WHERE employee_user_id = 2",
        Integer.class
    )).isZero();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_participants WHERE user_id = 2",
        Integer.class
    )).isZero();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT action FROM cp_admin_audit_log WHERE target_id = 2",
        String.class
    )).isEqualTo("DELETE_USER");

    Map<String, Object> replacement = service.createEmployee(
        new CreateEmployeeRequest(
            "replacement-sales",
            "Replacement Sales",
            "SecurePass123",
            "BUSINESS",
            "AGENT"
        ),
        administrator,
        "127.0.0.1"
    );
    assertThat(jdbcTemplate.queryForObject(
        "SELECT responsible_agent_id FROM cp_customers WHERE id = 40",
        Long.class
    )).isEqualTo(replacement.get("id"));
    assertThat(jdbcTemplate.queryForObject(
        "SELECT responsible_agent_id FROM cp_shipments WHERE id = 50",
        Long.class
    )).isEqualTo(replacement.get("id"));
  }
}
