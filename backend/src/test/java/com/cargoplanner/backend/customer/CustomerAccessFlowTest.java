package com.cargoplanner.backend.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.shipment.ShipmentAccessService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;

class CustomerAccessFlowTest {
  private JdbcTemplate jdbcTemplate;
  private BusinessCustomerService customerService;
  private CustomerAuthService authService;
  private ShipmentAccessService shipmentAccessService;
  private AuthenticatedUser business;
  private AuthenticatedUser otherBusiness;
  private AuthenticatedUser employee;
  private MockHttpServletRequest httpRequest;

  @BeforeEach
  void setUp() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1",
        "sa",
        ""
    );
    jdbcTemplate = new JdbcTemplate(dataSource);
    createSchema();
    jdbcTemplate.update(
        """
        INSERT INTO cp_users (id, display_name, role, party_role) VALUES
          (1, 'Business One', 'BUSINESS', 'AGENT'),
          (2, 'Business Two', 'BUSINESS', 'AGENT'),
          (3, 'Employee', 'EMPLOYEE', 'SHIPPER'),
          (4, 'Administrator', 'ADMIN', 'AGENT')
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipments (
          id, public_id, carrier_code, tracking_status, created_by, created_at, updated_at
        ) VALUES
          (10, 'shipment-public-id', 'COSCO', 'In transit', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          (11, 'anonymous-shipment-id', 'COSCO', 'Tracked', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          (12, 'other-business-shipment', 'COSCO', 'Tracked', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          (13, 'participant-shipment', 'COSCO', 'Tracked', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_references (
          id, shipment_id, carrier_code, reference_type, reference_no_raw,
          reference_no_normalized, primary_reference
        ) VALUES
          (100, 10, 'COSCO', 'BOOKING', 'BK-10001', 'BK-10001', TRUE),
          (101, 11, 'COSCO', 'BOOKING', 'ANON-10001', 'ANON-10001', TRUE),
          (102, 12, 'COSCO', 'BOOKING', 'OTHER-10001', 'OTHER-10001', TRUE)
        """
    );
    jdbcTemplate.update(
        "INSERT INTO cp_shipment_participants (shipment_id, user_id, participant_role) VALUES (13, 1, 'OPERATOR')"
    );

    CustomerTokenCodec tokenCodec = new CustomerTokenCodec();
    customerService = new BusinessCustomerService(jdbcTemplate, tokenCodec);
    authService = new CustomerAuthService(jdbcTemplate, tokenCodec, 24);
    shipmentAccessService = new ShipmentAccessService(jdbcTemplate);
    business = new AuthenticatedUser(1, "sales-1", "Business One", "BUSINESS", "ACTIVE", "AGENT");
    otherBusiness = new AuthenticatedUser(2, "sales-2", "Business Two", "BUSINESS", "ACTIVE", "AGENT");
    employee = new AuthenticatedUser(3, "employee", "Employee", "EMPLOYEE", "ACTIVE", "SHIPPER");
    httpRequest = new MockHttpServletRequest();
    httpRequest.setRemoteAddr("127.0.0.1");
    httpRequest.addHeader("User-Agent", "Customer portal test");
  }

  @Test
  void customerCodeLoginAndExplicitShipmentBindingEnforceOwnership() {
    Map<String, Object> created = customerService.create(
        new CreateCustomerRequest("acme-shipper", "ACME Shipper", "SHIPPER"),
        business,
        "127.0.0.1"
    );
    String customerId = (String) created.get("id");
    String code = (String) created.get("customerCode");

    assertThat(code).startsWith("DL-").hasSizeGreaterThan(40);
    assertThat(created.get("partyRole")).isEqualTo("SHIPPER");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT customer_code_hash FROM cp_customers WHERE public_id = ?",
        String.class,
        customerId
    )).doesNotContain(code);
    assertThat(((List<?>) customerService.list(business).get("items"))).hasSize(1);
    assertThat(((List<?>) customerService.list(otherBusiness).get("items"))).isEmpty();
    assertThatThrownBy(() -> customerService.create(
        new CreateCustomerRequest("forbidden", "Forbidden Customer", "SHIPPER"),
        employee,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN));

    CustomerLoginResponse login = authService.login(new CustomerLoginRequest(code), httpRequest);
    assertThat(login.token()).isNotBlank();
    assertThat(Instant.parse(login.expiresAt())).isAfter(Instant.now());
    assertThat(login.customer().partyRole()).isEqualTo("SHIPPER");
    CustomerPrincipal principal = authService.authenticate(login.token(), httpRequest);
    assertThat(principal.publicId()).isEqualTo(customerId);
    assertThatThrownBy(() -> shipmentAccessService.requireCustomerAccess(
        "shipment-public-id", principal
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN));

    Map<String, Object> binding = customerService.bindShipment(
        customerId,
        new CustomerShipmentBindingRequest(null, "COSCO", "BOOKING", "bk-10001"),
        business,
        "127.0.0.1"
    );
    assertThat(binding.get("shipmentId")).isEqualTo("shipment-public-id");
    assertThat(binding.get("relationshipRole")).isEqualTo("SHIPPER");
    assertThat(shipmentAccessService.requireCustomerAccess("shipment-public-id", principal).shipmentId())
        .isEqualTo(10L);

    customerService.update(
        customerId,
        new UpdateCustomerRequest(null, null, "CONSIGNEE", null),
        business,
        "127.0.0.1"
    );
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> updatedBindings =
        (List<Map<String, Object>>) customerService.listShipments(customerId, business).get("items");
    assertThat(updatedBindings).singleElement()
        .satisfies(updated -> assertThat(updated.get("relationshipRole")).isEqualTo("CONSIGNEE"));
    assertThat(authService.authenticate(login.token(), httpRequest).partyRole()).isEqualTo("CONSIGNEE");

    Map<String, Object> outsider = customerService.create(
        new CreateCustomerRequest("other-customer", "Other Customer", "CONSIGNEE"),
        otherBusiness,
        "127.0.0.1"
    );
    String outsiderId = (String) outsider.get("id");
    assertThatThrownBy(() -> customerService.update(
        outsiderId,
        new UpdateCustomerRequest(null, "Stolen", null, null),
        business,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.NOT_FOUND));

    Map<String, Object> reset = customerService.resetCode(customerId, business, "127.0.0.1");
    String newCode = (String) reset.get("customerCode");
    assertThat(newCode).isNotEqualTo(code);
    assertThatThrownBy(() -> authService.authenticate(login.token(), httpRequest))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.UNAUTHORIZED));
    assertThatThrownBy(() -> authService.login(new CustomerLoginRequest(code), httpRequest))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.UNAUTHORIZED));
    assertThat(authService.login(new CustomerLoginRequest(newCode), httpRequest).customer().id())
        .isEqualTo(customerId);

    customerService.unbindShipment(customerId, "shipment-public-id", business, "127.0.0.1");
    assertThatThrownBy(() -> shipmentAccessService.requireCustomerAccess(
        "shipment-public-id", principal
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN));
  }

  @Test
  void bindingRequiresShipmentCreatorParticipantOrAdministrator() {
    Map<String, Object> created = customerService.create(
        new CreateCustomerRequest("scoped-customer", "Scoped Customer", "SHIPPER"),
        business,
        "127.0.0.1"
    );
    String customerId = (String) created.get("id");
    AuthenticatedUser admin = new AuthenticatedUser(
        4, "admin", "Administrator", "ADMIN", "ACTIVE", "AGENT"
    );

    assertThat(customerService.bindShipment(
        customerId,
        new CustomerShipmentBindingRequest("shipment-public-id", null, null, null),
        business,
        "127.0.0.1"
    ).get("shipmentId")).isEqualTo("shipment-public-id");
    assertThat(customerService.bindShipment(
        customerId,
        new CustomerShipmentBindingRequest("participant-shipment", null, null, null),
        business,
        "127.0.0.1"
    ).get("shipmentId")).isEqualTo("participant-shipment");
    assertThatThrownBy(() -> customerService.bindShipment(
        customerId,
        new CustomerShipmentBindingRequest("anonymous-shipment-id", null, null, null),
        business,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN));
    assertThatThrownBy(() -> customerService.bindShipment(
        customerId,
        new CustomerShipmentBindingRequest("other-business-shipment", null, null, null),
        business,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN));
    assertThatThrownBy(() -> customerService.bindShipment(
        customerId,
        new CustomerShipmentBindingRequest(null, "COSCO", "BOOKING", "other-10001"),
        business,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN));
    assertThatThrownBy(() -> customerService.bindShipment(
        customerId,
        new CustomerShipmentBindingRequest(null, "COSCO", "CONTAINER", "CSNU1234567"),
        business,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.BAD_REQUEST));
    assertThat(customerService.bindShipment(
        customerId,
        new CustomerShipmentBindingRequest("anonymous-shipment-id", null, null, null),
        admin,
        "127.0.0.1"
    ).get("shipmentId")).isEqualTo("anonymous-shipment-id");
  }

  private void createSchema() {
    jdbcTemplate.execute("""
        CREATE TABLE cp_users (
          id BIGINT PRIMARY KEY,
          display_name VARCHAR(80) NOT NULL,
          role VARCHAR(24) NOT NULL,
          party_role VARCHAR(20) NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_admin_audit_log (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          admin_user_id BIGINT,
          action VARCHAR(80) NOT NULL,
          target_type VARCHAR(40),
          target_id BIGINT,
          detail VARCHAR(512),
          ip_address VARCHAR(64),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipments (
          id BIGINT PRIMARY KEY,
          public_id CHAR(36) NOT NULL UNIQUE,
          carrier_code VARCHAR(32) NOT NULL,
          tracking_status VARCHAR(80),
          created_by BIGINT,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_references (
          id BIGINT PRIMARY KEY,
          shipment_id BIGINT NOT NULL,
          carrier_code VARCHAR(32) NOT NULL,
          reference_type VARCHAR(24) NOT NULL,
          reference_no_raw VARCHAR(160) NOT NULL,
          reference_no_normalized VARCHAR(128) NOT NULL,
          primary_reference BOOLEAN NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_participants (
          shipment_id BIGINT NOT NULL,
          user_id BIGINT NOT NULL,
          participant_role VARCHAR(24) NOT NULL,
          PRIMARY KEY (shipment_id, user_id)
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_customers (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          public_id CHAR(36) NOT NULL UNIQUE,
          username VARCHAR(64) NOT NULL UNIQUE,
          display_name VARCHAR(80) NOT NULL,
          party_role VARCHAR(20) NOT NULL,
          customer_code_hash CHAR(64) NOT NULL UNIQUE,
          customer_code_prefix VARCHAR(16) NOT NULL,
          status VARCHAR(20) NOT NULL,
          created_by BIGINT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_customer_sessions (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          customer_id BIGINT NOT NULL,
          session_token_hash CHAR(64) NOT NULL UNIQUE,
          expires_at TIMESTAMP NOT NULL,
          last_seen_at TIMESTAMP NOT NULL,
          revoked_at TIMESTAMP,
          ip_address VARCHAR(64),
          user_agent VARCHAR(512),
          created_at TIMESTAMP NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_customer_shipment_access (
          customer_id BIGINT NOT NULL,
          shipment_id BIGINT NOT NULL,
          relationship_role VARCHAR(20) NOT NULL,
          assigned_by BIGINT NOT NULL,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (customer_id, shipment_id)
        )
        """);
  }
}
