package com.cargoplanner.backend.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class CustomerRelationshipServiceTest {
  private JdbcTemplate jdbcTemplate;
  private CustomerRelationshipService service;
  private AuthenticatedUser businessA;
  private AuthenticatedUser businessB;
  private AuthenticatedUser businessC;

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
        INSERT INTO cp_users (id, username, display_name, role, status) VALUES
          (1, 'sales-a', 'Business A', 'BUSINESS', 'ACTIVE'),
          (2, 'sales-b', 'Business B', 'BUSINESS', 'ACTIVE'),
          (3, 'sales-c', 'Business C', 'BUSINESS', 'ACTIVE'),
          (4, 'admin', 'Administrator', 'ADMIN', 'ACTIVE')
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_customers (
          id, public_id, username, display_name, client_code, party_role, status,
          created_by, responsible_agent_id
        ) VALUES
          (10, 'customer-hayden-1', 'hayden-one', 'Hayden US', 'HAY-001',
           'SHIPPER', 'ACTIVE', 1, 1),
          (11, 'customer-hayden-2', 'hayden-two', 'Hayden US', 'HAY-002',
           'CONSIGNEE', 'ACTIVE', 1, 1),
          (12, 'customer-other', 'other-client', 'Other Client', 'OTH-001',
           'SHIPPER', 'ACTIVE', 3, 3)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipments (id, public_id, responsible_agent_id)
        VALUES (100, 'shipment-100', 1)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_customer_shipment_access (customer_id, shipment_id)
        VALUES (10, 100)
        """
    );
    service = new CustomerRelationshipService(jdbcTemplate);
    businessA = user(1, "sales-a", "Business A");
    businessB = user(2, "sales-b", "Business B");
    businessC = user(3, "sales-c", "Business C");
  }

  @Test
  void globalDirectoryAllowsDuplicateNamesAndShowsCurrentOwners() {
    Map<String, Object> response = service.listRelationships(businessA);

    @SuppressWarnings("unchecked")
    List<Map<String, Object>> items = (List<Map<String, Object>>) response.get("items");
    assertThat(items).hasSize(3);
    assertThat(items.stream().filter(item -> "Hayden US".equals(item.get("displayName"))))
        .hasSize(2);
    assertThat(items.stream().map(item -> item.get("clientCode")))
        .containsExactlyInAnyOrder("HAY-001", "HAY-002", "OTH-001");
    assertThat(items.stream()
        .filter(item -> "customer-other".equals(item.get("id")))
        .findFirst()
        .orElseThrow())
        .containsEntry("responsibleBusinessDisplayName", "Business C");
    assertThatThrownBy(() -> jdbcTemplate.update(
        """
        INSERT INTO cp_customers (
          id, public_id, username, display_name, client_code, party_role, status,
          created_by, responsible_agent_id
        ) VALUES (13, 'duplicate-code', 'duplicate-code', 'Another Hayden',
                  'HAY-001', 'SHIPPER', 'ACTIVE', 1, 1)
        """
    )).isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void targetBusinessUserAcceptsHandoverAndReceivesShipmentParticipation() {
    Map<String, Object> created = service.createHandoverRequest(
        new CustomerHandoverCreateRequest(
            List.of("customer-hayden-1", "customer-hayden-2"),
            2L,
            "Regional responsibility adjustment"
        ),
        businessA,
        "127.0.0.1"
    );
    String requestId = (String) created.get("id");

    assertThat(jdbcTemplate.queryForObject(
        "SELECT responsible_agent_id FROM cp_customers WHERE id = 10",
        Long.class
    )).isEqualTo(1L);
    assertThatThrownBy(() -> service.decideHandoverRequest(
        requestId,
        new CustomerHandoverDecisionRequest("ACCEPTED", null),
        businessA,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error ->
            assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN)
        );

    Map<String, Object> accepted = service.decideHandoverRequest(
        requestId,
        new CustomerHandoverDecisionRequest("ACCEPTED", "Accepted"),
        businessB,
        "127.0.0.1"
    );

    assertThat(accepted)
        .containsEntry("status", "ACCEPTED")
        .containsEntry("customerCount", 2)
        .containsEntry("relatedShipments", 1)
        .containsEntry("historyRetained", true);
    assertThat(jdbcTemplate.queryForList(
        "SELECT responsible_agent_id FROM cp_customers WHERE id IN (10, 11) ORDER BY id",
        Long.class
    )).containsExactly(2L, 2L);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT responsible_agent_id FROM cp_shipments WHERE id = 100",
        Long.class
    )).isEqualTo(1L);
    assertThat(jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) FROM cp_shipment_participants
        WHERE shipment_id = 100 AND user_id = 2 AND participant_role = 'CUSTOMER_OWNER'
        """,
        Integer.class
    )).isEqualTo(1);

    @SuppressWarnings("unchecked")
    List<Map<String, Object>> requests =
        (List<Map<String, Object>>) service.listHandoverRequests(businessB).get("items");
    assertThat(requests).singleElement()
        .satisfies(request -> {
          assertThat(request).containsEntry("status", "ACCEPTED");
          assertThat((List<?>) request.get("customers")).hasSize(2);
          assertThat(request).containsEntry("canDecide", false);
        });
  }

  @Test
  void rejectionKeepsOwnerAndStaleOwnerPreventsAcceptance() {
    assertThatThrownBy(() -> service.createHandoverRequest(
        new CustomerHandoverCreateRequest(
            List.of("customer-hayden-1"),
            2L,
            "Unauthorized request"
        ),
        businessC,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error ->
            assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN)
        );

    String rejectedId = (String) service.createHandoverRequest(
        new CustomerHandoverCreateRequest(
            List.of("customer-hayden-1"),
            2L,
            "First request"
        ),
        businessA,
        "127.0.0.1"
    ).get("id");
    service.decideHandoverRequest(
        rejectedId,
        new CustomerHandoverDecisionRequest("REJECTED", "Capacity is full"),
        businessB,
        "127.0.0.1"
    );
    assertThat(jdbcTemplate.queryForObject(
        "SELECT responsible_agent_id FROM cp_customers WHERE id = 10",
        Long.class
    )).isEqualTo(1L);

    String staleId = (String) service.createHandoverRequest(
        new CustomerHandoverCreateRequest(
            List.of("customer-hayden-1"),
            2L,
            "Second request"
        ),
        businessA,
        "127.0.0.1"
    ).get("id");
    jdbcTemplate.update(
        "UPDATE cp_customers SET responsible_agent_id = 3 WHERE id = 10"
    );
    assertThatThrownBy(() -> service.decideHandoverRequest(
        staleId,
        new CustomerHandoverDecisionRequest("ACCEPTED", null),
        businessB,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error ->
            assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.CONFLICT)
        );
    assertThat(jdbcTemplate.queryForObject(
        "SELECT responsible_agent_id FROM cp_customers WHERE id = 10",
        Long.class
    )).isEqualTo(3L);
  }

  private AuthenticatedUser user(long id, String username, String displayName) {
    return new AuthenticatedUser(id, username, displayName, "BUSINESS", "ACTIVE", "AGENT");
  }

  private void createSchema() {
    jdbcTemplate.execute("""
        CREATE TABLE cp_users (
          id BIGINT PRIMARY KEY,
          username VARCHAR(64) NOT NULL,
          display_name VARCHAR(80) NOT NULL,
          role VARCHAR(24) NOT NULL,
          status VARCHAR(20) NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_customers (
          id BIGINT PRIMARY KEY,
          public_id CHAR(36) NOT NULL UNIQUE,
          username VARCHAR(64) NOT NULL UNIQUE,
          display_name VARCHAR(80) NOT NULL,
          client_code VARCHAR(64) UNIQUE,
          party_role VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL,
          remark VARCHAR(500),
          created_by BIGINT NOT NULL,
          responsible_agent_id BIGINT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipments (
          id BIGINT PRIMARY KEY,
          public_id CHAR(36) NOT NULL UNIQUE,
          responsible_agent_id BIGINT
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_customer_shipment_access (
          customer_id BIGINT NOT NULL,
          shipment_id BIGINT NOT NULL,
          PRIMARY KEY (customer_id, shipment_id)
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_participants (
          shipment_id BIGINT NOT NULL,
          user_id BIGINT NOT NULL,
          participant_role VARCHAR(24) NOT NULL,
          granted_by BIGINT,
          PRIMARY KEY (shipment_id, user_id)
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_oversea_agent_customers (
          customer_id BIGINT PRIMARY KEY,
          oversea_agent_customer_id BIGINT NOT NULL,
          assigned_by BIGINT NOT NULL,
          assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_customer_handover_requests (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          public_id CHAR(36) NOT NULL UNIQUE,
          from_business_user_id BIGINT NOT NULL,
          to_business_user_id BIGINT NOT NULL,
          requested_by BIGINT NOT NULL,
          status VARCHAR(20) NOT NULL,
          reason VARCHAR(500) NOT NULL,
          decision_note VARCHAR(500),
          requested_ip VARCHAR(64),
          requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          decided_by BIGINT,
          decided_at TIMESTAMP
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_customer_handover_items (
          request_id BIGINT NOT NULL,
          customer_id BIGINT NOT NULL,
          previous_owner_id BIGINT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (request_id, customer_id)
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
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """);
  }
}
