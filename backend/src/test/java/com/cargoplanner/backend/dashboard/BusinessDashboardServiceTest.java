package com.cargoplanner.backend.dashboard;

import static org.assertj.core.api.Assertions.assertThat;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class BusinessDashboardServiceTest {
  private JdbcTemplate jdbcTemplate;
  private BusinessDashboardService service;
  private AuthenticatedUser business;
  private AuthenticatedUser admin;

  @BeforeEach
  void setUp() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1",
        "sa",
        ""
    );
    jdbcTemplate = new JdbcTemplate(dataSource);
    createSchema();
    Clock clock = Clock.fixed(
        Instant.parse("2026-07-28T04:00:00Z"),
        ZoneId.of("Asia/Shanghai")
    );
    service = new BusinessDashboardService(jdbcTemplate, clock);
    business = new AuthenticatedUser(1, "sales", "Sales", "BUSINESS", "ACTIVE");
    admin = new AuthenticatedUser(99, "admin", "Administrator", "ADMIN", "ACTIVE");
    seedData();
  }

  @Test
  void businessStatsUseResponsibleScopeAndExcludeNewShipmentsFromUpdatedCount() {
    Map<String, Object> result = service.todayStats(business);

    assertThat(result)
        .containsEntry("date", "2026-07-28")
        .containsEntry("scope", "RESPONSIBLE_AGENT")
        .containsEntry("newShipments", 1L)
        .containsEntry("updatedShipments", 1L)
        .containsEntry("followUpFiles", 1L)
        .containsEntry("messages", 1L)
        .containsEntry("customerLogins", 2L)
        .containsEntry("shipmentTotal", 2L)
        .containsEntry("customerTotal", 1L)
        .containsEntry("activeAgentCount", 1L);
    assertThat((Iterable<?>) result.get("dailyTrend")).hasSize(7);
    assertThat((Iterable<?>) result.get("shipmentStatusDistribution")).hasSize(2);
  }

  @Test
  void administratorReceivesGlobalTodayStats() {
    assertThat(service.todayStats(admin))
        .containsEntry("scope", "GLOBAL")
        .containsEntry("newShipments", 2L)
        .containsEntry("updatedShipments", 1L)
        .containsEntry("followUpFiles", 2L)
        .containsEntry("messages", 2L)
        .containsEntry("customerLogins", 3L)
        .containsEntry("shipmentTotal", 3L)
        .containsEntry("customerTotal", 2L)
        .containsEntry("activeAgentCount", 1L);
  }

  private void createSchema() {
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_shipments (
          id BIGINT PRIMARY KEY,
          responsible_agent_id BIGINT,
          tracking_status VARCHAR(80),
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        )
        """
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_shipment_files (
          id BIGINT PRIMARY KEY,
          shipment_id BIGINT NOT NULL,
          status VARCHAR(20) NOT NULL,
          created_at TIMESTAMP NOT NULL
        )
        """
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_shipment_file_comments (
          id BIGINT PRIMARY KEY,
          shipment_id BIGINT NOT NULL,
          created_at TIMESTAMP NOT NULL
        )
        """
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_customers (
          id BIGINT PRIMARY KEY,
          responsible_agent_id BIGINT NOT NULL,
          party_role VARCHAR(20) NOT NULL DEFAULT 'SHIPPER',
          status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        )
        """
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_users (
          id BIGINT PRIMARY KEY,
          role VARCHAR(24) NOT NULL,
          status VARCHAR(20) NOT NULL
        )
        """
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_customer_sessions (
          id BIGINT PRIMARY KEY,
          customer_id BIGINT NOT NULL,
          created_at TIMESTAMP NOT NULL
        )
        """
    );
  }

  private void seedData() {
    Timestamp yesterday = Timestamp.from(Instant.parse("2026-07-27T04:00:00Z"));
    Timestamp today = Timestamp.from(Instant.parse("2026-07-28T03:00:00Z"));
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipments (id, responsible_agent_id, created_at, updated_at) VALUES
          (10, 1, ?, ?),
          (11, 1, ?, ?),
          (12, 2, ?, ?)
        """,
        today, today,
        yesterday, today,
        today, today
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_files (id, shipment_id, status, created_at) VALUES
          (100, 10, 'READY', ?),
          (101, 12, 'READY', ?),
          (102, 10, 'DELETED', ?)
        """,
        today, today, today
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_file_comments (id, shipment_id, created_at) VALUES
          (200, 10, ?),
          (201, 12, ?)
        """,
        today, today
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_customers (id, responsible_agent_id) VALUES
          (300, 1),
          (301, 2)
        """
    );
    jdbcTemplate.update(
        "INSERT INTO cp_users (id, role, status) VALUES (500, 'OVERSEA_AGENT', 'ACTIVE')"
    );
    jdbcTemplate.update("UPDATE cp_shipments SET tracking_status = 'IN_TRANSIT' WHERE id = 10");
    jdbcTemplate.update("UPDATE cp_shipments SET tracking_status = 'DELIVERED' WHERE id = 11");
    jdbcTemplate.update(
        """
        INSERT INTO cp_customer_sessions (id, customer_id, created_at) VALUES
          (400, 300, ?),
          (401, 300, ?),
          (402, 301, ?)
        """,
        today, today, today
    );
  }
}
