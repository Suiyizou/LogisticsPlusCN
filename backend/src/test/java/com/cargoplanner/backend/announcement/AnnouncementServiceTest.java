package com.cargoplanner.backend.announcement;

import static org.assertj.core.api.Assertions.assertThat;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class AnnouncementServiceTest {
  private JdbcTemplate jdbcTemplate;
  private AnnouncementService service;
  private AuthenticatedUser admin;
  private AuthenticatedUser employee;
  private CustomerPrincipal customer;

  @BeforeEach
  void setUp() throws Exception {
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
          username VARCHAR(64) NOT NULL,
          display_name VARCHAR(80) NOT NULL,
          role VARCHAR(32) NOT NULL
        )
        """
    );
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_admin_audit_log (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          admin_user_id BIGINT,
          action VARCHAR(64),
          target_type VARCHAR(64),
          target_id BIGINT,
          detail VARCHAR(512),
          ip_address VARCHAR(64)
        )
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_users (id, username, display_name, role) VALUES
          (1, 'admin', 'Administrator', 'ADMIN'),
          (2, 'employee', 'Employee', 'BUSINESS')
        """
    );
    new AnnouncementSchemaInitializer(jdbcTemplate).run(null);
    Clock clock = Clock.fixed(
        Instant.parse("2026-07-28T02:00:00Z"),
        ZoneId.of("Asia/Shanghai")
    );
    service = new AnnouncementService(jdbcTemplate, clock);
    admin = new AuthenticatedUser(1, "admin", "Administrator", "ADMIN", "ACTIVE");
    employee = new AuthenticatedUser(2, "employee", "Employee", "BUSINESS", "ACTIVE");
    customer = new CustomerPrincipal(
        20, "customer-public", "customer", "Customer", "SHIPPER", "ACTIVE"
    );
  }

  @Test
  void deliversOnlyTodaysPublishedAudienceAndTracksReadsIdempotently() {
    long allId = createPublished("All users", "ALL", LocalDate.parse("2026-07-28"));
    long employeeId = createPublished("Employees", "EMPLOYEE", LocalDate.parse("2026-07-28"));
    long customerId = createPublished("Customers", "CUSTOMER", LocalDate.parse("2026-07-28"));
    createPublished("Tomorrow", "ALL", LocalDate.parse("2026-07-29"));

    Map<String, Object> employeeToday = service.todayForEmployee(employee);
    Map<String, Object> customerToday = service.todayForCustomer(customer);

    assertThat(titles(employeeToday)).containsExactly("Employees", "All users");
    assertThat(titles(customerToday)).containsExactly("Customers", "All users");
    assertThat(employeeToday.get("unreadCount")).isEqualTo(2L);
    assertThat(customerToday.get("unreadCount")).isEqualTo(2L);

    assertThat(service.markReadForEmployee(allId, employee).get("read")).isEqualTo(true);
    assertThat(service.markReadForEmployee(allId, employee).get("read")).isEqualTo(true);
    assertThat(service.markReadForCustomer(customerId, customer).get("read")).isEqualTo(true);

    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_announcement_reads",
        Integer.class
    )).isEqualTo(2);
    assertThat(service.todayForEmployee(employee).get("unreadCount")).isEqualTo(1L);
    assertThat(service.todayForCustomer(customer).get("unreadCount")).isEqualTo(1L);
    assertThat(employeeId).isPositive();
  }

  @Test
  void adminCrudSupportsPaginationPublishingAndDisabling() {
    Map<String, Object> created = service.create(
        new AnnouncementRequest(
            "Draft notice",
            "## Maintenance",
            "https://example.test/banner.png",
            "cargo-maintenance",
            "EMPLOYEE",
            LocalDate.parse("2026-07-28"),
            null
        ),
        admin,
        "127.0.0.1"
    );
    long id = ((Number) created.get("id")).longValue();

    assertThat(created.get("status")).isEqualTo("DRAFT");
    assertThat(service.publish(id, admin, "127.0.0.1").get("status")).isEqualTo("PUBLISHED");
    assertThat(service.listAdmin(admin, 0, 1, "PUBLISHED"))
        .containsEntry("total", 1L)
        .containsEntry("pageSize", 1);
    assertThat(service.disable(id, admin, "127.0.0.1").get("status")).isEqualTo("DISABLED");
    assertThat(service.todayForEmployee(employee).get("total")).isEqualTo(0);
  }

  @Test
  void deletePhysicallyRemovesAnnouncementAndItsReadReceipts() {
    long id = createPublished("Delete me", "ALL", LocalDate.parse("2026-07-28"));
    service.markReadForEmployee(id, employee);

    assertThat(service.delete(id, admin, "127.0.0.1"))
        .containsEntry("id", id)
        .containsEntry("deleted", true);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_announcements WHERE id = ?",
        Integer.class,
        id
    )).isZero();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_announcement_reads WHERE announcement_id = ?",
        Integer.class,
        id
    )).isZero();
  }

  private long createPublished(String title, String audience, LocalDate displayDate) {
    Map<String, Object> created = service.create(
        new AnnouncementRequest(
            title,
            "**" + title + "**",
            null,
            null,
            audience,
            displayDate,
            "PUBLISHED"
        ),
        admin,
        "127.0.0.1"
    );
    return ((Number) created.get("id")).longValue();
  }

  @SuppressWarnings("unchecked")
  private List<String> titles(Map<String, Object> response) {
    return ((List<Map<String, Object>>) response.get("items"))
        .stream()
        .map(item -> String.valueOf(item.get("title")))
        .toList();
  }
}
