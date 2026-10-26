package com.cargoplanner.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.common.ApiException;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.mock.web.MockHttpServletRequest;

class AuthServicePasswordChangeTest {
  private JdbcTemplate jdbcTemplate;
  private AuthService authService;
  private MockHttpServletRequest request;

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
          role VARCHAR(20) NOT NULL,
          party_role VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL,
          password_salt VARCHAR(128) NOT NULL,
          password_hash VARCHAR(256) NOT NULL,
          password_iterations INT NOT NULL,
          last_login_at TIMESTAMP
        )
        """
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_login_devices (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT NOT NULL,
          device_id VARCHAR(128) NOT NULL,
          device_name VARCHAR(128),
          mac_address VARCHAR(64),
          ip_address VARCHAR(64),
          user_agent VARCHAR(512),
          session_token_hash CHAR(64),
          online BOOLEAN NOT NULL DEFAULT FALSE,
          logged_in_at TIMESTAMP,
          last_seen_at TIMESTAMP,
          revoked_at TIMESTAMP,
          UNIQUE (user_id, device_id)
        )
        """
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_login_events (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT,
          username VARCHAR(64),
          event_type VARCHAR(40) NOT NULL,
          device_id VARCHAR(128),
          ip_address VARCHAR(64),
          user_agent VARCHAR(512),
          message VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    );
    PasswordHasher passwordHasher = new PasswordHasher();
    PasswordHasher.PasswordHash hash = passwordHasher.hash("OldSecure!234");
    jdbcTemplate.update(
        """
        INSERT INTO cp_users (
          username, display_name, role, party_role, status,
          password_salt, password_hash, password_iterations
        ) VALUES ('operator', 'Operator', 'BUSINESS', 'AGENT', 'ACTIVE', ?, ?, ?)
        """,
        hash.salt(),
        hash.hash(),
        hash.iterations()
    );
    authService = new AuthService(jdbcTemplate, passwordHasher, new AuthFailureAuditService(jdbcTemplate, new DataSourceTransactionManager(dataSource)), 5, 6);
    request = new MockHttpServletRequest();
    request.setRemoteAddr("127.0.0.1");
    request.addHeader("User-Agent", "Password change test");
  }

  @Test
  void changesOwnPasswordAndRevokesOtherDevicesOnly() {
    LoginResponse first = authService.login(
        new LoginRequest("operator", "OldSecure!234", "device-a", "Primary", null),
        request
    );
    LoginResponse second = authService.login(
        new LoginRequest("operator", "OldSecure!234", "device-b", "Secondary", null),
        request
    );

    authService.changeOwnPassword(
        first.user(),
        new ChangeOwnPasswordRequest("OldSecure!234", "operator2026"),
        first.token(),
        request
    );

    assertThat(authService.authenticate(first.token(), request).username()).isEqualTo("operator");
    assertThatThrownBy(() -> authService.authenticate(second.token(), request))
        .isInstanceOfSatisfying(ApiException.class, error ->
            assertThat(error.status()).isEqualTo(HttpStatus.UNAUTHORIZED)
        );
    assertThatThrownBy(() -> authService.login(
        new LoginRequest("operator", "OldSecure!234", "device-c", "Old password", null),
        request
    )).isInstanceOfSatisfying(ApiException.class, error ->
        assertThat(error.status()).isEqualTo(HttpStatus.UNAUTHORIZED)
    );
    assertThat(authService.login(
        new LoginRequest("operator", "operator2026", "device-c", "New password", null),
        request
    ).user().role()).isEqualTo("BUSINESS");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_login_events WHERE event_type = 'PASSWORD_CHANGED'",
        Integer.class
    )).isEqualTo(1);
  }

  @Test
  void rejectsLoginsForLogicallyDeletedAndDisabledAccounts() {
    for (String status : new String[] {"DELETED", "DISABLED"}) {
      jdbcTemplate.update("UPDATE cp_users SET status = ? WHERE username = 'operator'", status);

      assertThatThrownBy(() -> authService.login(
          new LoginRequest("operator", "OldSecure!234", "device-" + status, status, null),
          request
      )).isInstanceOfSatisfying(ApiException.class, error ->
          assertThat(error.status()).isEqualTo(HttpStatus.UNAUTHORIZED)
      );

      jdbcTemplate.update("UPDATE cp_users SET status = 'ACTIVE' WHERE username = 'operator'");
    }

    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_login_devices",
        Integer.class
    )).isZero();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_login_events WHERE event_type = 'LOGIN_FAIL'",
        Integer.class
    )).isEqualTo(2);
  }

  @Test
  void rejectsExistingTokenAsSoonAsAccountIsLogicallyDeleted() {
    LoginResponse login = authService.login(
        new LoginRequest("operator", "OldSecure!234", "device-a", "Primary", null),
        request
    );
    jdbcTemplate.update("UPDATE cp_users SET status = 'DELETED' WHERE username = 'operator'");

    assertThatThrownBy(() -> authService.authenticate(login.token(), request))
        .isInstanceOfSatisfying(ApiException.class, error ->
            assertThat(error.status()).isEqualTo(HttpStatus.UNAUTHORIZED)
        );
  }
}
