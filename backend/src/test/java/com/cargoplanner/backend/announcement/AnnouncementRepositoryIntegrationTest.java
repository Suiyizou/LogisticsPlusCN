package com.cargoplanner.backend.announcement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.announcement.persistence.AnnouncementAuditMapper;
import com.cargoplanner.backend.announcement.persistence.AnnouncementMapper;
import com.cargoplanner.backend.announcement.persistence.AnnouncementReadMapper;
import com.cargoplanner.backend.announcement.persistence.AnnouncementRepository;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import com.cargoplanner.backend.persistence.MyBatisTestSupport;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;

class AnnouncementRepositoryIntegrationTest {
  private static final AuthenticatedUser ADMIN =
      new AuthenticatedUser(1, "admin", "Administrator", "ADMIN", "ACTIVE");
  private static final AuthenticatedUser EMPLOYEE =
      new AuthenticatedUser(2, "business", "Business", "BUSINESS", "ACTIVE");
  private static final CustomerPrincipal CUSTOMER =
      new CustomerPrincipal(20, "customer", "customer", "Customer", "SHIPPER", "ACTIVE");
  private static final LocalDate DATE = LocalDate.of(2026, 10, 14);
  private JdbcTemplate jdbc;
  private AnnouncementService service;

  @BeforeEach
  void setup() {
    var dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
    jdbc = new JdbcTemplate(dataSource);
    jdbc.execute("CREATE TABLE cp_users (id BIGINT PRIMARY KEY)");
    jdbc.update("INSERT INTO cp_users VALUES (1), (2)");
    jdbc.execute("""
        CREATE TABLE cp_admin_audit_log (id BIGINT AUTO_INCREMENT PRIMARY KEY,
          admin_user_id BIGINT, action VARCHAR(64), target_type VARCHAR(64),
          target_id BIGINT, detail VARCHAR(512), ip_address VARCHAR(64))
        """);
    new ResourceDatabasePopulator(new ClassPathResource("fixtures/announcement-schema.sql"))
        .execute(dataSource);
    var session = MyBatisTestSupport.session(dataSource,
        AnnouncementMapper.class, AnnouncementReadMapper.class, AnnouncementAuditMapper.class);
    var repository = new AnnouncementRepository(session.getMapper(AnnouncementMapper.class),
        session.getMapper(AnnouncementReadMapper.class), session.getMapper(AnnouncementAuditMapper.class));
    var target = new AnnouncementService(repository,
        Clock.fixed(Instant.parse("2026-10-14T02:00:00Z"), ZoneId.of("Asia/Shanghai")));
    var proxy = new ProxyFactory(target);
    proxy.setProxyTargetClass(true);
    proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(dataSource),
        new AnnotationTransactionAttributeSource()));
    service = (AnnouncementService) proxy.getProxy();
  }

  @Test
  void generatedPaginationKeepsZeroBasedContractAndStableOrdering() {
    long first = create("First", "ALL");
    long second = create("Second", "ALL");
    var page = service.listAdmin(ADMIN, 1, 1, "PUBLISHED");
    assertThat(page).containsEntry("page", 1).containsEntry("pageSize", 1).containsEntry("total", 2L);
    assertThat(page.get("items").toString()).contains("id=" + first).doesNotContain("id=" + second);
    assertThat(service.listAdmin(ADMIN, 9, 1, null).get("items")).asList().isEmpty();
  }

  @Test
  void omittedAndNullOptionalTextRetainsButBlankExplicitlyClearsInGeneratedUpdate() {
    var created = service.create(new AnnouncementRequest(
        "Notice", "Body", "https://example.test/a.png", "illustration", "ALL", DATE, "DRAFT"),
        ADMIN, "127.0.0.1");
    long id = ((Number) created.get("id")).longValue();
    var retained = service.update(id,
        new AnnouncementRequest(null, null, null, null, null, null, null), ADMIN, null);
    assertThat(retained).containsEntry("imageUrl", "https://example.test/a.png")
        .containsEntry("illustrationRef", "illustration");
    var cleared = service.update(id,
        new AnnouncementRequest(null, null, " ", "", null, null, null), ADMIN, null);
    assertThat(cleared).containsEntry("imageUrl", null).containsEntry("illustrationRef", null);
    assertThat(jdbc.queryForObject("SELECT image_url FROM cp_announcements WHERE id = ?",
        String.class, id)).isNull();
  }

  @Test
  void customerCannotReadEmployeeAudienceOrOtherCustomersReceipt() {
    long internal = create("Internal", "EMPLOYEE");
    long all = create("Everyone", "ALL");
    assertThatThrownBy(() -> service.markReadForCustomer(internal, CUSTOMER))
        .isInstanceOf(ApiException.class);
    service.markReadForCustomer(all, CUSTOMER);
    var other = new CustomerPrincipal(21, "other", "other", "Other", "SHIPPER", "ACTIVE");
    assertThat(service.todayForCustomer(other)).containsEntry("unreadCount", 1L);
    assertThat(service.todayForEmployee(EMPLOYEE)).containsEntry("unreadCount", 2L);
  }

  @Test
  void nonAdminCannotUseCrudAndUnauthorizedAttemptDoesNotWriteAudit() {
    assertThatThrownBy(() -> service.create(
        new AnnouncementRequest("Blocked", "Body", null, null, "ALL", DATE, "DRAFT"),
        EMPLOYEE, null)).isInstanceOf(ApiException.class);
    assertThatThrownBy(() -> service.listAdmin(EMPLOYEE, 0, 10, null))
        .isInstanceOf(ApiException.class);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_announcements", Integer.class)).isZero();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_admin_audit_log", Integer.class)).isZero();
  }

  @Test
  void generatedInsertAndAuditShareRealSpringTransaction() {
    jdbc.execute("ALTER TABLE cp_admin_audit_log ADD CONSTRAINT reject_create CHECK (action <> 'CREATE_ANNOUNCEMENT')");
    assertThatThrownBy(() -> create("Must rollback", "ALL")).isInstanceOf(RuntimeException.class);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_announcements", Integer.class)).isZero();
  }

  @Test
  void generatedDeleteRollsBackReceiptsWhenAuditFails() {
    long id = create("Retain on failure", "ALL");
    service.markReadForCustomer(id, CUSTOMER);
    jdbc.execute("ALTER TABLE cp_admin_audit_log ADD CONSTRAINT reject_delete CHECK (action <> 'DELETE_ANNOUNCEMENT')");
    assertThatThrownBy(() -> service.delete(id, ADMIN, null)).isInstanceOf(RuntimeException.class);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_announcements", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_announcement_reads", Integer.class)).isEqualTo(1);
  }

  private long create(String title, String audience) {
    return ((Number) service.create(new AnnouncementRequest(
        title, "Body", null, null, audience, DATE, "PUBLISHED"), ADMIN, null).get("id")).longValue();
  }
}
