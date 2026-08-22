package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class ShipmentFileCommentServiceTest {
  private ShipmentFileCommentService service;
  private AuthenticatedUser business;
  private AuthenticatedUser outsider;
  private CustomerPrincipal customer;

  @Test
  void springSelectsProductionConstructorWhenTestConstructorAlsoExists() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1",
        "sa",
        ""
    );
    JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
    ShipmentAccessService accessService = new ShipmentAccessService(jdbcTemplate);
    try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
      context.registerBean(JdbcTemplate.class, () -> jdbcTemplate);
      context.registerBean(ShipmentAccessService.class, () -> accessService);
      context.registerBean(ShipmentFileCommentService.class);
      context.refresh();

      assertThat(context.getBean(ShipmentFileCommentService.class)).isNotNull();
    }
  }

  @BeforeEach
  void setUp() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1",
        "sa",
        ""
    );
    JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
    createSchema(jdbcTemplate);
    jdbcTemplate.update(
        "INSERT INTO cp_users (id, display_name, role) VALUES "
            + "(2, 'Business One', 'BUSINESS'), (3, 'Outside User', 'EMPLOYEE')"
    );
    jdbcTemplate.update(
        "INSERT INTO cp_shipments (id, public_id, created_by, responsible_agent_id) "
            + "VALUES (10, 'shipment-public-id', 2, 2)"
    );
    jdbcTemplate.update(
        "INSERT INTO cp_customers (id, display_name, status) VALUES (20, 'Portal Customer', 'ACTIVE')"
    );
    jdbcTemplate.update(
        "INSERT INTO cp_customer_shipment_access "
            + "(customer_id, shipment_id, relationship_role, publication_status) "
            + "VALUES (20, 10, 'SHIPPER', 'PUBLISHED')"
    );

    ShipmentAccessService accessService = new ShipmentAccessService(jdbcTemplate);
    service = new ShipmentFileCommentService(
        jdbcTemplate,
        accessService,
        Clock.fixed(Instant.parse("2026-07-21T12:30:00Z"), ZoneOffset.UTC)
    );
    business = new AuthenticatedUser(
        2, "business", "Business One", "BUSINESS", "ACTIVE", "OVERSEA_AGENT"
    );
    outsider = new AuthenticatedUser(
        3, "outside", "Outside User", "EMPLOYEE", "ACTIVE", "SHIPPER"
    );
    customer = new CustomerPrincipal(
        20, "customer-public-id", "portal", "Portal Customer", "SHIPPER", "ACTIVE"
    );
  }

  @Test
  void storesAndReloadsMessagesFromInternalAndCustomerAuthors() {
    service.create(
        "shipment-public-id",
        business,
        new ShipmentFileCommentRequest("  Please confirm the master bill.  ")
    );
    service.createCustomer(
        "shipment-public-id",
        customer,
        new ShipmentFileCommentRequest("Received, thank you.")
    );

    Map<String, Object> response = service.list("shipment-public-id", business);
    assertThat(response.get("total")).isEqualTo(2);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> items = (List<Map<String, Object>>) response.get("items");
    assertThat(items).extracting(item -> item.get("body"))
        .containsExactly("Please confirm the master bill.", "Received, thank you.");
    assertThat(items).extracting(item -> item.get("authorDisplayName"))
        .containsExactly("Business One", "Portal Customer");
    assertThat(items).extracting(item -> item.get("authorType"))
        .containsExactly("INTERNAL", "CUSTOMER");
    assertThat(service.listCustomer("shipment-public-id", customer).get("total")).isEqualTo(2);
  }

  @Test
  void rejectsBlankMessagesAndUsersWithoutShipmentAccess() {
    assertThatThrownBy(() -> service.create(
        "shipment-public-id", business, new ShipmentFileCommentRequest("   ")
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.BAD_REQUEST));

    assertThatThrownBy(() -> service.list("shipment-public-id", outsider))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.FORBIDDEN));
  }

  private void createSchema(JdbcTemplate jdbcTemplate) {
    jdbcTemplate.execute("""
        CREATE TABLE cp_users (
          id BIGINT PRIMARY KEY,
          display_name VARCHAR(80) NOT NULL,
          role VARCHAR(24) NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipments (
          id BIGINT PRIMARY KEY,
          public_id CHAR(36) NOT NULL UNIQUE,
          created_by BIGINT NULL,
          responsible_agent_id BIGINT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_participants (
          shipment_id BIGINT NOT NULL,
          user_id BIGINT NOT NULL,
          participant_role VARCHAR(24) NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_customers (
          id BIGINT PRIMARY KEY,
          display_name VARCHAR(80) NOT NULL,
          status VARCHAR(20) NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_customer_shipment_access (
          customer_id BIGINT NOT NULL,
          shipment_id BIGINT NOT NULL,
          relationship_role VARCHAR(20) NOT NULL,
          publication_status VARCHAR(20) NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_file_comments (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          public_id CHAR(36) NOT NULL UNIQUE,
          shipment_id BIGINT NOT NULL,
          author_user_id BIGINT NULL,
          author_customer_id BIGINT NULL,
          author_display_name_snapshot VARCHAR(120) NOT NULL,
          author_role_snapshot VARCHAR(24) NOT NULL,
          body VARCHAR(2000) NOT NULL,
          created_at TIMESTAMP NOT NULL
        )
        """);
  }
}
