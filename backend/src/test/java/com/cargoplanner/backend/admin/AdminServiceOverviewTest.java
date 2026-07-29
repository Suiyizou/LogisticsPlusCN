package com.cargoplanner.backend.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.cargoplanner.backend.auth.AuthService;
import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.common.RequestStats;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class AdminServiceOverviewTest {
  private JdbcTemplate jdbcTemplate;
  private AdminService service;

  @BeforeEach
  void setUp() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1",
        "sa",
        ""
    );
    jdbcTemplate = new JdbcTemplate(dataSource);
    jdbcTemplate.execute(
        "CREATE TABLE cp_users (id BIGINT PRIMARY KEY, role VARCHAR(32), status VARCHAR(20))"
    );
    jdbcTemplate.execute(
        "CREATE TABLE cp_customers (id BIGINT PRIMARY KEY, status VARCHAR(20))"
    );
    jdbcTemplate.execute(
        "CREATE TABLE cp_login_devices (id BIGINT PRIMARY KEY, online TINYINT, revoked_at TIMESTAMP)"
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_admin_audit_log (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          action VARCHAR(80),
          created_at TIMESTAMP
        )
        """
    );
    service = new AdminService(
        jdbcTemplate,
        mock(PasswordHasher.class),
        mock(RequestStats.class),
        mock(AuthService.class)
    );
  }

  @Test
  void aggregatesExecutiveSystemMetricsAndChartSeries() {
    jdbcTemplate.update(
        """
        INSERT INTO cp_users (id, role, status) VALUES
          (1, 'ADMIN', 'ACTIVE'),
          (2, 'BUSINESS', 'ACTIVE'),
          (3, 'OVERSEA_AGENT', 'DISABLED'),
          (4, 'OVERSEA_AGENT', 'DELETED')
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_customers (id, status) VALUES
          (10, 'ACTIVE'),
          (11, 'DISABLED'),
          (12, 'DELETED')
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_login_devices (id, online, revoked_at) VALUES
          (20, 1, NULL),
          (21, 0, NULL)
        """
    );
    Timestamp now = Timestamp.valueOf(LocalDateTime.now(ZoneId.of("Asia/Shanghai")));
    jdbcTemplate.update(
        "INSERT INTO cp_admin_audit_log (action, created_at) VALUES (?, ?), (?, ?)",
        "API_REQUEST",
        now,
        "UPDATE_USER",
        now
    );

    Map<String, Object> overview = service.systemOverview();

    assertThat(overview)
        .containsEntry("totalUsers", 5L)
        .containsEntry("activeUsers", 3L)
        .containsEntry("onlineDeviceCount", 1L)
        .containsEntry("managementActions30d", 1L)
        .containsEntry("operationsToday", 2L);
    assertThat((List<?>) overview.get("activityTrend")).hasSize(7);
    assertThat((List<Map<String, Object>>) overview.get("userComposition"))
        .extracting(item -> item.get("code"))
        .contains("ADMIN", "BUSINESS", "OVERSEA_AGENT", "CUSTOMER");
    assertThat((List<Map<String, Object>>) overview.get("operationTypes"))
        .singleElement()
        .satisfies(item -> assertThat(item)
            .containsEntry("code", "UPDATE_USER")
            .containsEntry("value", 1L));
  }
}
