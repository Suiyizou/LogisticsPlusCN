package com.cargoplanner.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.common.ApiException;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

@SpringJUnitConfig(AuthFailureAuditTransactionTest.Config.class)
class AuthFailureAuditTransactionTest {
  @Autowired private AuthService auth;
  @Autowired private AuthFailureAuditService failureAudit;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private PlatformTransactionManager transactionManager;
  private final MockHttpServletRequest request = new MockHttpServletRequest();

  @BeforeEach
  void setUp() {
    jdbc.execute("DROP ALL OBJECTS");
    jdbc.execute("""
        CREATE TABLE cp_users (
          id BIGINT PRIMARY KEY, username VARCHAR(64), display_name VARCHAR(80),
          role VARCHAR(20), party_role VARCHAR(20), status VARCHAR(20), password_salt VARCHAR(128),
          password_hash VARCHAR(256), password_iterations INT, last_login_at TIMESTAMP)
        """);
    jdbc.execute("""
        CREATE TABLE cp_login_devices (
          id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT, device_id VARCHAR(128),
          device_name VARCHAR(128), mac_address VARCHAR(64), ip_address VARCHAR(64),
          user_agent VARCHAR(512), session_token_hash VARCHAR(64), online BOOLEAN,
          logged_in_at TIMESTAMP, last_seen_at TIMESTAMP, revoked_at TIMESTAMP,
          UNIQUE(user_id, device_id))
        """);
    jdbc.execute("""
        CREATE TABLE cp_login_events (
          id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT, username VARCHAR(64),
          event_type VARCHAR(40), device_id VARCHAR(128), ip_address VARCHAR(64),
          user_agent VARCHAR(512), message VARCHAR(255),
          FOREIGN KEY(user_id) REFERENCES cp_users(id))
        """);
    var hash = new PasswordHasher().hash("Audit!Password9");
    jdbc.update("""
        INSERT INTO cp_users VALUES
        (1, 'operator', 'Operator', 'BUSINESS', 'AGENT', 'ACTIVE', ?, ?, ?, NULL)
        """, hash.salt(), hash.hash(), hash.iterations());
    assertThat(AopUtils.isAopProxy(auth)).isTrue();
  }

  @Test
  void badPasswordPersistsFailureButRollsBackSessionExpiry() {
    jdbc.update("""
        INSERT INTO cp_login_devices (user_id, device_id, online, logged_in_at, session_token_hash)
        VALUES (1, 'expired-device', TRUE, TIMESTAMP '2000-01-01 00:00:00', 'original')
        """);
    reject("operator", "Incorrect!Password9", HttpStatus.UNAUTHORIZED);
    assertThat(count("LOGIN_FAIL")).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT online FROM cp_login_devices", Boolean.class)).isTrue();
    assertThat(jdbc.queryForObject("SELECT last_login_at FROM cp_users", Object.class)).isNull();
    assertThat(jdbc.queryForObject("SELECT message FROM cp_login_events", String.class))
        .doesNotContain("Incorrect!Password9", "Audit!Password9");
  }

  @ParameterizedTest
  @ValueSource(strings = {"DISABLED", "DELETED", "UNKNOWN"})
  void rejectedAccountsLeaveAuditWithoutCreatingSessions(String status) {
    if (!"UNKNOWN".equals(status)) jdbc.update("UPDATE cp_users SET status = ?", status);
    reject("UNKNOWN".equals(status) ? "missing" : "operator", "Audit!Password9", HttpStatus.UNAUTHORIZED);
    assertThat(count("LOGIN_FAIL")).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_login_devices", Integer.class)).isZero();
  }

  @Test
  void deviceLimitRejectionIsAuditedAndKeepsIssuedTokens() {
    var first = login("one");
    login("two");
    assertThatThrownBy(() -> login("three")).isInstanceOfSatisfying(ApiException.class,
        error -> assertThat(error.status()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    assertThat(count("DEVICE_LIMIT")).isEqualTo(1);
    assertThat(count("LOGIN_SUCCESS")).isEqualTo(2);
    assertThat(auth.authenticate(first.token(), request).username()).isEqualTo("operator");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_login_devices", Integer.class)).isEqualTo(2);
  }

  @Test
  void rejectedPasswordChangeIsAuditedAndDoesNotChangePassword() {
    var first = login("one");
    assertThatThrownBy(() -> auth.changeOwnPassword(first.user(),
        new ChangeOwnPasswordRequest("Incorrect!Password9", "Replacement9!Password"), first.token(), request))
        .isInstanceOf(ApiException.class);
    assertThat(count("PASSWORD_CHANGE_FAIL")).isEqualTo(1);
    assertThat(login("one").user().username()).isEqualTo("operator");
  }

  @Test
  void deferredEventSurvivesDeletionOfItsAccountInTheCompletingTransaction() {
    new TransactionTemplate(transactionManager).executeWithoutResult(ignored -> {
      failureAudit.record(1L, "operator", "LOGIN_FAIL", null, null, null, "Synthetic failure");
      assertThat(count("LOGIN_FAIL")).isZero();
      jdbc.update("DELETE FROM cp_users WHERE id = 1");
    });
    assertThat(count("LOGIN_FAIL")).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT user_id FROM cp_login_events", Long.class)).isNull();
    assertThat(jdbc.queryForObject("SELECT username FROM cp_login_events", String.class)).isEqualTo("operator");
  }

  private void reject(String username, String password, HttpStatus status) {
    assertThatThrownBy(() -> auth.login(new LoginRequest(username, password, "attempt", "Test", null), request))
        .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.status()).isEqualTo(status));
  }

  private LoginResponse login(String device) {
    return auth.login(new LoginRequest("operator", "Audit!Password9", device, "Test", null), request);
  }

  private int count(String type) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM cp_login_events WHERE event_type = ?", Integer.class, type);
  }

  @Configuration
  @EnableTransactionManagement
  static class Config {
    @Bean DataSource dataSource() {
      return new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID()
          + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
    }
    @Bean JdbcTemplate jdbc(DataSource ds) { return new JdbcTemplate(ds); }
    @Bean PlatformTransactionManager transactionManager(DataSource ds) { return new DataSourceTransactionManager(ds); }
    @Bean AuthFailureAuditService audit(JdbcTemplate jdbc, PlatformTransactionManager tm) {
      return new AuthFailureAuditService(jdbc, tm);
    }
    @Bean AuthService auth(JdbcTemplate jdbc, AuthFailureAuditService audit) {
      return new AuthService(jdbc, new PasswordHasher(), audit, 2, 6);
    }
  }
}
