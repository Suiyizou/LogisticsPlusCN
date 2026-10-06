package com.cargoplanner.backend.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.dto.CustomerDirectoryItem;
import com.cargoplanner.backend.customer.persistence.CustomerDirectoryMapper;
import java.sql.Connection;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.apache.ibatis.executor.statement.StatementHandler;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.autoconfigure.MybatisAutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class CustomerDirectoryServiceTest {
  private static final Instant CREATED_AT = Instant.parse("2026-08-22T12:34:56.123456Z");
  private static final AuthenticatedUser ADMIN = actor(4, "ADMIN");
  private JdbcTemplate jdbc;
  private CustomerDirectoryService service;
  private CustomerDirectoryMapper mapper;
  private StatementCounter counter;

  @BeforeEach
  void setUp() {
    DataSource dataSource = dataSource();
    jdbc = new JdbcTemplate(dataSource);
    schema(jdbc);
    jdbc.update("""
        INSERT INTO cp_users (id, username, display_name, status) VALUES
          (1, 'sales-1', 'Sales One', 'ACTIVE'),
          (2, 'sales-2', 'Sales Two', 'ACTIVE'),
          (3, 'employee', 'Employee', 'ACTIVE'),
          (4, 'admin', 'Admin', 'ACTIVE'),
          (5, 'disabled-employee', 'Disabled Employee', 'DISABLED')
        """);
    counter = new StatementCounter();
    mapper = CustomerDirectoryTestSupport.mapper(dataSource, counter);
    service = new CustomerDirectoryService(mapper);
  }

  @Test
  void keepsRoleVisibilityAndExcludesInactiveOrLegacyCustomers() {
    customer(10, 1, "SHIPPER", "ACTIVE");
    customer(11, 2, "CONSIGNEE", "ACTIVE");
    customer(12, 1, "SHIPPER", "DISABLED");
    customer(13, 1, "SHIPPER", "DELETED");
    customer(14, 1, "OVERSEA_AGENT", "ACTIVE");
    jdbc.update("INSERT INTO cp_customer_employee_assignments VALUES (10, 3)");

    assertThat(service.list(ADMIN).items()).extracting(CustomerDirectoryItem::id)
        .containsExactly("public-11", "public-10");
    assertThat(service.list(actor(1, "BUSINESS")).items()).extracting(CustomerDirectoryItem::id)
        .containsExactly("public-10");
    assertThat(service.list(actor(2, "BUSINESS")).items()).extracting(CustomerDirectoryItem::id)
        .containsExactly("public-11");
    assertThat(service.list(actor(3, "OVERSEA_AGENT")).items()).extracting(CustomerDirectoryItem::id)
        .containsExactly("public-10");
    assertThat(service.list(actor(5, "OVERSEA_AGENT")).items()).isEmpty();
  }

  @Test
  void rejectsMissingAndUnsupportedIdentitiesBeforeExecutingSql() {
    customer(10, 1, "SHIPPER", "ACTIVE");
    for (String role : new String[] {"CUSTOMER", "USER", "admin", "UNKNOWN"}) {
      assertForbidden(actor(1, role));
    }
    assertForbidden(null);
    assertThat(counter.count.get()).isZero();
    // An invalid internal scope must also fail closed in the mapper.
    assertThat(mapper.findVisibleCustomers(new CustomerDirectoryScope(null, 1))).isEmpty();
  }

  @Test
  void loadsManyCustomersAndEmployeeMetadataWithOneStatement() {
    for (int id = 10; id < 30; id++) customer(id, 1, "SHIPPER", "ACTIVE");
    jdbc.update("INSERT INTO cp_customer_employee_assignments VALUES (10, 3)");
    jdbc.update("INSERT INTO cp_customer_shipment_access VALUES (10, 100, 'DRAFT'), (10, 101, 'PUBLISHED')");

    var response = service.list(ADMIN);

    assertThat(counter.count.get()).isEqualTo(1);
    assertThat(response.total()).isEqualTo(20);
    assertThat(response.items()).hasSize(20);
    CustomerDirectoryItem assigned = response.items().get(19);
    assertThat(assigned.id()).isEqualTo("public-10");
    assertThat(assigned.shipmentCount()).isEqualTo(2);
    assertThat(assigned.overseaAgentUserId()).isEqualTo(3L);
    assertThat(assigned.overseaAgentUsername()).isEqualTo("employee");
    assertThat(assigned.overseaAgentDisplayName()).isEqualTo("Employee");
    assertThat(response.items().get(0).shipmentCount()).isZero();
  }

  @Test
  void absentOrInactiveEmployeeDoesNotRemoveCustomerOrExposeEmployeeMetadata() {
    customer(10, 1, "SHIPPER", "ACTIVE");
    customer(11, 1, "SHIPPER", "ACTIVE");
    customer(12, 1, "SHIPPER", "ACTIVE");
    jdbc.update("INSERT INTO cp_customer_employee_assignments VALUES (11, 5), (12, 999)");

    var response = service.list(ADMIN);

    assertThat(response.total()).isEqualTo(3);
    for (var item : response.items()) {
      assertThat(item.overseaAgentUserId()).isNull();
      assertThat(item.overseaAgentUsername()).isNull();
      assertThat(item.overseaAgentDisplayName()).isNull();
    }
  }

  @Test
  void preservesTimestampFormatAndNullableFieldsAndOrdersNewestFirst() {
    customer(10, 1, "SHIPPER", "ACTIVE");
    customer(11, 1, "SHIPPER", "ACTIVE");
    jdbc.update("UPDATE cp_customers SET created_at = ? WHERE id = 10",
        Timestamp.from(CREATED_AT.plusSeconds(1)));

    var response = service.list(ADMIN);

    assertThat(response.items()).extracting(CustomerDirectoryItem::id)
        .containsExactly("public-10", "public-11");
    var item = response.items().get(1);
    assertThat(item.createdAt()).isEqualTo(CREATED_AT.toString());
    assertThat(item.updatedAt()).isEqualTo(CREATED_AT.toString());
    assertThat(item.createdByDisplayName()).isEqualTo("Sales One");
    assertThat(item.responsibleAgentDisplayName()).isEqualTo("Sales One");
    assertThat(item.clientCode()).isNull();
    assertThat(item.remark()).isNull();
    jdbc.update("UPDATE cp_customers SET created_at = NULL, updated_at = NULL WHERE id = 11");
    var withoutDates = service.list(ADMIN).items().get(1);
    assertThat(withoutDates.createdAt()).isNull();
    assertThat(withoutDates.updatedAt()).isNull();
  }

  @Test
  void springBootDiscoversMapperAndXmlWithoutManualFactorySetup() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(MybatisAutoConfiguration.class))
        .withUserConfiguration(MapperConfiguration.class)
        .withPropertyValues("mybatis.mapper-locations=classpath*:mappers/**/*.xml")
        .run(context -> {
          assertThat(context).hasSingleBean(CustomerDirectoryMapper.class);
          assertThat(context).hasSingleBean(CustomerDirectoryService.class);
          assertThat(context.getBean(CustomerDirectoryService.class).list(ADMIN).total()).isZero();
        });
  }

  private void assertForbidden(AuthenticatedUser actor) {
    assertThatThrownBy(() -> service.list(actor)).isInstanceOfSatisfying(ApiException.class,
        error -> assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN));
  }

  private void customer(long id, long owner, String partyRole, String status) {
    jdbc.update("""
        INSERT INTO cp_customers (id, public_id, username, display_name, party_role,
          customer_code_prefix, customer_code_mode, provisioning_source, status,
          created_by, responsible_agent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'PREFIX', 'RANDOM', 'MANUAL', ?, 1, ?, ?, ?)
        """, id, "public-" + id, "customer-" + id, "Customer " + id, partyRole,
        status, owner, Timestamp.from(CREATED_AT), Timestamp.from(CREATED_AT));
  }

  private static AuthenticatedUser actor(long id, String role) {
    return new AuthenticatedUser(id, "user-" + id, "User " + id, role, "ACTIVE");
  }

  private static DataSource dataSource() {
    return new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
  }

  private static void schema(JdbcTemplate jdbc) {
    jdbc.execute("""
        CREATE TABLE cp_users (id BIGINT PRIMARY KEY, username VARCHAR(64),
          display_name VARCHAR(80), status VARCHAR(20))
        """);
    jdbc.execute("""
        CREATE TABLE cp_customers (id BIGINT PRIMARY KEY, public_id VARCHAR(36),
          username VARCHAR(64), display_name VARCHAR(80), client_code VARCHAR(64),
          party_role VARCHAR(20), customer_code_prefix VARCHAR(16), customer_code_mode VARCHAR(20),
          provisioning_source VARCHAR(20), status VARCHAR(20), remark VARCHAR(500),
          created_by BIGINT, responsible_agent_id BIGINT,
          created_at TIMESTAMP(6), updated_at TIMESTAMP(6))
        """);
    jdbc.execute("""
        CREATE TABLE cp_customer_employee_assignments (customer_id BIGINT PRIMARY KEY,
          employee_user_id BIGINT NOT NULL)
        """);
    jdbc.execute("""
        CREATE TABLE cp_customer_shipment_access (customer_id BIGINT, shipment_id BIGINT,
          publication_status VARCHAR(20), PRIMARY KEY (customer_id, shipment_id))
        """);
  }

  @Configuration(proxyBeanMethods = false)
  @AutoConfigurationPackage
  @Import(CustomerDirectoryService.class)
  static class MapperConfiguration {
    @Bean
    DataSource testDataSource() {
      DataSource source = dataSource();
      schema(new JdbcTemplate(source));
      return source;
    }
  }

  @Intercepts(@Signature(type = StatementHandler.class, method = "prepare",
      args = {Connection.class, Integer.class}))
  public static class StatementCounter implements Interceptor {
    final AtomicInteger count = new AtomicInteger();

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
      count.incrementAndGet();
      return invocation.proceed();
    }
  }
}
