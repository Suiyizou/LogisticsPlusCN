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
        """
        CREATE TABLE cp_users (
          id BIGINT PRIMARY KEY,
          username VARCHAR(100),
          role VARCHAR(32),
          status VARCHAR(20)
        )
        """
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
          target_type VARCHAR(40),
          target_id BIGINT,
          admin_user_id BIGINT,
          detail VARCHAR(512),
          ip_address VARCHAR(64),
          username_snapshot VARCHAR(100),
          role_snapshot VARCHAR(32),
          http_method VARCHAR(12),
          request_path VARCHAR(255),
          http_status INT,
          success TINYINT,
          duration_ms BIGINT,
          request_id VARCHAR(64),
          user_agent VARCHAR(255),
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
        INSERT INTO cp_users (id, username, role, status) VALUES
          (1, 'admin', 'ADMIN', 'ACTIVE'),
          (2, 'operator', 'BUSINESS', 'ACTIVE'),
          (3, 'agent', 'OVERSEA_AGENT', 'DISABLED'),
          (4, 'deleted-agent', 'OVERSEA_AGENT', 'DELETED')
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
        """
        INSERT INTO cp_admin_audit_log (
          admin_user_id, action, target_type, target_id, detail, ip_address, created_at
        ) VALUES
          (?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?)
        """,
        2L,
        "API_REQUEST",
        "API",
        null,
        "GET /api/business/customers",
        "127.0.0.1",
        now,
        1L,
        "UPDATE_USER",
        "USER",
        3L,
        "Updated user agent",
        "127.0.0.1",
        now,
        2L,
        "CREATE_CUSTOMER",
        "CUSTOMER",
        10L,
        "Created customer acme",
        "127.0.0.2",
        now
    );

    Map<String, Object> overview = service.systemOverview();

    assertThat(overview)
        .containsEntry("totalUsers", 4L)
        .containsEntry("activeUsers", 3L)
        .containsEntry("onlineDeviceCount", 1L)
        .containsEntry("managementActions30d", 1L)
        .containsEntry("operationsToday", 2L);
    assertThat((List<Map<String, Object>>) overview.get("activityTrend"))
        .hasSize(7)
        .last()
        .satisfies(item -> assertThat(item)
            .containsEntry("businessActions", 1L)
            .containsEntry("managementActions", 1L)
            .doesNotContainKey("apiRequests"));
    assertThat((List<Map<String, Object>>) overview.get("userComposition"))
        .extracting(item -> item.get("code"))
        .contains("ADMIN", "BUSINESS", "OVERSEA_AGENT", "CUSTOMER");
    assertThat((List<Map<String, Object>>) overview.get("operationTypes"))
        .singleElement()
        .satisfies(item -> assertThat(item)
            .containsEntry("code", "UPDATE_USER")
            .containsEntry("value", 1L));

    Map<String, Object> auditPage = service.operationAuditPage(0, 20);
    assertThat(auditPage).containsEntry("total", 2L);
    assertThat((List<Map<String, Object>>) auditPage.get("items"))
        .extracting(item -> item.get("action"))
        .containsExactlyInAnyOrder("UPDATE_USER", "CREATE_CUSTOMER");
    assertThat((List<Map<String, Object>>) auditPage.get("items"))
        .filteredOn(item -> "CREATE_CUSTOMER".equals(item.get("action")))
        .singleElement()
        .satisfies(item -> assertThat(item)
            .containsEntry("username", "operator")
            .containsEntry("role", "BUSINESS")
            .containsEntry("category", "BUSINESS"));
  }
}
