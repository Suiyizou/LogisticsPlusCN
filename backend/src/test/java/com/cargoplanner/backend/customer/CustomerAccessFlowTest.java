package com.cargoplanner.backend.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.shipment.ShipmentAccessService;
import com.cargoplanner.backend.shipment.ShipmentBatchItemRequest;
import com.cargoplanner.backend.shipment.ShipmentBatchDeleteRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
        INSERT INTO cp_users (id, username, display_name, role, party_role) VALUES
          (1, 'sales-1', 'Business One', 'BUSINESS', 'OVERSEA_AGENT'),
          (2, 'sales-2', 'Business Two', 'BUSINESS', 'OVERSEA_AGENT'),
          (3, 'employee', 'Employee', 'EMPLOYEE', 'SHIPPER'),
          (4, 'admin', 'Administrator', 'ADMIN', 'OVERSEA_AGENT')
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
          (13, 'participant-shipment', 'COSCO', 'Tracked', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          (14, 'empty-owned-shipment', 'CMA', 'Pending update', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
          (102, 12, 'COSCO', 'BOOKING', 'OTHER-10001', 'OTHER-10001', TRUE),
          (103, 14, 'CMA', 'BILLOFLADING', 'EMPTY-10001', 'EMPTY-10001', TRUE)
        """
    );
    jdbcTemplate.update(
        "INSERT INTO cp_shipment_participants (shipment_id, user_id, participant_role) VALUES (13, 1, 'OPERATOR')"
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_tracking_snapshots (
          shipment_id, query_reference_type, query_reference_no, queried_by, queried_by_username,
          source_channel, snapshot_json, payload_sha256, fetched_at, fresh_until, created_at
        ) VALUES
          (10, 'BOOKING', 'BK-10001', 1, 'sales-1', 'AUTO',
           '{}', '0000000000000000000000000000000000000000000000000000000000000000',
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          (12, 'BOOKING', 'OTHER-10001', 2, 'sales-2', 'AUTO',
           '{}', '0000000000000000000000000000000000000000000000000000000000000000',
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          (13, 'BOOKING', 'PART-10001', 2, 'sales-2', 'AUTO',
           '{}', '0000000000000000000000000000000000000000000000000000000000000000',
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
    );
    jdbcTemplate.update(
        "UPDATE cp_shipments SET current_snapshot_id = (SELECT id FROM cp_tracking_snapshots WHERE shipment_id = 10 LIMIT 1) WHERE id = 10"
    );
    jdbcTemplate.update(
        "UPDATE cp_shipments SET current_snapshot_id = (SELECT id FROM cp_tracking_snapshots WHERE shipment_id = 12 LIMIT 1) WHERE id = 12"
    );
    jdbcTemplate.update(
        "UPDATE cp_shipments SET current_snapshot_id = (SELECT id FROM cp_tracking_snapshots WHERE shipment_id = 13 LIMIT 1) WHERE id = 13"
    );

    CustomerTokenCodec tokenCodec = new CustomerTokenCodec();
    PasswordHasher passwordHasher = new PasswordHasher();
    customerService = new BusinessCustomerService(jdbcTemplate, tokenCodec, passwordHasher);
    authService = new CustomerAuthService(jdbcTemplate, tokenCodec, passwordHasher, 24);
    shipmentAccessService = new ShipmentAccessService(jdbcTemplate);
    business = new AuthenticatedUser(
        1, "sales-1", "Business One", "BUSINESS", "ACTIVE", "OVERSEA_AGENT"
    );
    otherBusiness = new AuthenticatedUser(
        2, "sales-2", "Business Two", "BUSINESS", "ACTIVE", "OVERSEA_AGENT"
    );
    employee = new AuthenticatedUser(3, "employee", "Employee", "EMPLOYEE", "ACTIVE", "SHIPPER");
    httpRequest = new MockHttpServletRequest();
    httpRequest.setRemoteAddr("127.0.0.1");
    httpRequest.addHeader("User-Agent", "Customer portal test");
  }

  @Test
  void customerCodeLoginAndExplicitShipmentBindingEnforceOwnership() {
    Map<String, Object> created = customerService.create(
        new CreateCustomerRequest("acme-shipper", "SecurePass!23", "ACME Shipper", "SHIPPER"),
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
        new CreateCustomerRequest("forbidden", "SecurePass!23", "Forbidden Customer", "SHIPPER"),
        employee,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN));

    assertThatThrownBy(() -> authService.login(
        new CustomerLoginRequest("acme-shipper", "wrong-password", code), httpRequest
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.UNAUTHORIZED));
    CustomerLoginResponse login = authService.login(
        new CustomerLoginRequest("acme-shipper", "SecurePass!23", code), httpRequest
    );
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
    assertThat(binding.get("publicationStatus")).isEqualTo("DRAFT");
    jdbcTemplate.update(
        "UPDATE cp_customer_shipment_access SET publication_status = 'PUBLISHED' WHERE customer_id = ? AND shipment_id = 10",
        principal.id()
    );
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
        new CreateCustomerRequest("other-customer", "SecurePass!23", "Other Customer", "CONSIGNEE"),
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
    assertThatThrownBy(() -> authService.login(
        new CustomerLoginRequest("acme-shipper", "SecurePass!23", code), httpRequest
    ))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.UNAUTHORIZED));
    assertThat(authService.login(
        new CustomerLoginRequest("acme-shipper", "SecurePass!23", newCode), httpRequest
    ).customer().id())
        .isEqualTo(customerId);

    customerService.resetPassword(
        customerId,
        new UpdateCustomerPasswordRequest("Replacement!45"),
        business,
        "127.0.0.1"
    );
    assertThatThrownBy(() -> authService.login(
        new CustomerLoginRequest("acme-shipper", "SecurePass!23", newCode), httpRequest
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.UNAUTHORIZED));
    assertThat(authService.login(
        new CustomerLoginRequest("acme-shipper", "Replacement!45", newCode), httpRequest
    ).customer().id()).isEqualTo(customerId);

    customerService.unbindShipment(customerId, "shipment-public-id", business, "127.0.0.1");
    assertThatThrownBy(() -> shipmentAccessService.requireCustomerAccess(
        "shipment-public-id", principal
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN));
  }

  @Test
  void bindingRequiresShipmentCreatorParticipantOrAdministrator() {
    Map<String, Object> created = customerService.create(
        new CreateCustomerRequest("scoped-customer", "SecurePass!23", "Scoped Customer", "SHIPPER"),
        business,
        "127.0.0.1"
    );
    String customerId = (String) created.get("id");
    AuthenticatedUser admin = new AuthenticatedUser(
        4, "admin", "Administrator", "ADMIN", "ACTIVE", "OVERSEA_AGENT"
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

  @Test
  void listsAuthorizedShipmentsAndPersistsOperatorNotes() {
    jdbcTemplate.update(
        """
        INSERT INTO cp_tracking_snapshots (
          shipment_id, query_reference_type, query_reference_no, queried_by, queried_by_username,
          source_channel, snapshot_json, payload_sha256, fetched_at, fresh_until, created_at
        ) VALUES
          (10, 'BOOKING', 'BK-HISTORY', 2, 'sales-2', 'AUTO',
           '{"marker":"old-not-current"}', REPEAT('1', 64),
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          (12, 'BOOKING', 'OTHER-HISTORY', 1, 'sales-1', 'AUTO',
           '{"marker":"queried-by-is-not-access"}', REPEAT('2', 64),
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
    );
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> available =
        (List<Map<String, Object>>) customerService.listAvailableShipments(business).get("items");

    assertThat(available).extracting(item -> item.get("shipmentId"))
        .containsExactlyInAnyOrder(
            "shipment-public-id", "participant-shipment", "empty-owned-shipment"
        )
        .doesNotContain("anonymous-shipment-id", "other-business-shipment");
    assertThat(available).extracting(item -> item.get("shipmentId")).doesNotHaveDuplicates();

    Map<String, Object> participantShipment = available.stream()
        .filter(item -> "participant-shipment".equals(item.get("shipmentId")))
        .findFirst().orElseThrow();
    assertThat(participantShipment).containsEntry("dataAvailable", true);
    assertThat(participantShipment.get("snapshot")).isInstanceOf(com.fasterxml.jackson.databind.JsonNode.class);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> participants =
        (List<Map<String, Object>>) participantShipment.get("participants");
    assertThat(participants).extracting(item -> item.get("role"))
        .containsOnly("OVERSEA_AGENT");
    assertThat(participants).extracting(item -> item.get("bindingRole"))
        .containsExactlyInAnyOrder("CREATOR", "OPERATOR");

    Map<String, Object> emptyShipment = available.stream()
        .filter(item -> "empty-owned-shipment".equals(item.get("shipmentId")))
        .findFirst().orElseThrow();
    assertThat(emptyShipment).containsEntry("dataAvailable", false).containsEntry("snapshot", null);
    assertThat(emptyShipment).containsEntry("referenceNo", "EMPTY-10001");

    Map<String, Object> detail = customerService.getShipmentSnapshot(business, "participant-shipment");
    assertThat(detail).containsEntry("shipmentId", "participant-shipment");
    assertThat(detail.get("boundUsers")).isEqualTo(participantShipment.get("boundUsers"));
    assertThatThrownBy(() -> customerService.getShipmentSnapshot(business, "other-business-shipment"))
        .isInstanceOfSatisfying(ApiException.class, error ->
            assertThat(error.status()).isEqualTo(HttpStatus.NOT_FOUND)
        );

    AuthenticatedUser admin = new AuthenticatedUser(
        4, "admin", "Administrator", "ADMIN", "ACTIVE", "AGENT"
    );
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> adminItems =
        (List<Map<String, Object>>) customerService.listShipmentSnapshots(admin).get("items");
    assertThat(adminItems).hasSize(5);
    assertThat(adminItems).extracting(item -> item.get("shipmentId")).doesNotHaveDuplicates();
    assertThat(customerService.getShipmentSnapshot(admin, "other-business-shipment"))
        .containsEntry("shipmentId", "other-business-shipment");

    Map<String, Object> updated = customerService.updateShipmentNote(
        "shipment-public-id",
        "Waiting for consignee confirmation",
        business,
        "127.0.0.1"
    );
    assertThat(updated.get("note")).isEqualTo("Waiting for consignee confirmation");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT business_note FROM cp_shipments WHERE public_id = ?",
        String.class,
        "shipment-public-id"
    )).isEqualTo("Waiting for consignee confirmation");

    assertThatThrownBy(() -> customerService.updateShipmentNote(
        "other-business-shipment",
        "not allowed",
        business,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN));
  }

  @Test
  void prefersTheBookingReferenceWhenBillAndBookingAreBothAvailable() {
    jdbcTemplate.update(
        """
        UPDATE cp_shipment_references
        SET reference_type = 'BILLOFLADING', reference_no_raw = 'COSU9508434560',
            reference_no_normalized = 'COSU9508434560'
        WHERE shipment_id = 10
        """
    );
    jdbcTemplate.update(
        """
        UPDATE cp_tracking_snapshots
        SET query_reference_type = 'BILLOFLADING', query_reference_no = '9508434560'
        WHERE shipment_id = 10
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_references (
          shipment_id, carrier_code, reference_type, reference_no_raw,
          reference_no_normalized, primary_reference
        ) VALUES (10, 'COSCO', 'BOOKING', '9508434560', '9508434560', FALSE)
        """
    );

    Map<String, Object> detail = customerService.getShipmentSnapshot(
        business, "shipment-public-id"
    );
    assertThat(detail)
        .containsEntry("carrier", "COSCO")
        .containsEntry("referenceType", "BOOKING")
        .containsEntry("referenceNo", "9508434560");

    ShipmentBatchItemRequest refresh = customerService.listUnfinishedTrackingItems(business)
        .stream()
        .filter(item -> "refresh-shipment-public-id".equals(item.id()))
        .findFirst()
        .orElseThrow();
    assertThat(refresh.carrier()).isEqualTo("COSCO");
    assertThat(refresh.type()).isEqualTo("BOOKING");
    assertThat(refresh.number()).isEqualTo("9508434560");

    jdbcTemplate.update(
        "UPDATE cp_tracking_snapshots SET snapshot_json = ? WHERE shipment_id = 10",
        "{\"tracking\":{\"status\":\"Empty Returned\"}}"
    );
    assertThat(customerService.listUnfinishedTrackingItems(business))
        .extracting(ShipmentBatchItemRequest::id)
        .contains("refresh-shipment-public-id");

    jdbcTemplate.update(
        "UPDATE cp_shipments SET tracking_status = 'EMPTY_RETURNED' WHERE id = 10"
    );
    assertThat(customerService.listUnfinishedTrackingItems(business))
        .extracting(ShipmentBatchItemRequest::id)
        .doesNotContain("refresh-shipment-public-id");
  }

  @Test
  void bindsShipperAndConsigneeToTheSameShipmentButRejectsDuplicatePartyRoles() {
    String shipperId = (String) customerService.create(
        new CreateCustomerRequest(
            "primary-shipper", "SecurePass!23", "Primary Shipper", "SHIPPER", "CLIENT-001"
        ),
        business,
        "127.0.0.1"
    ).get("id");
    String consigneeId = (String) customerService.create(
        new CreateCustomerRequest(
            "primary-consignee", "SecurePass!23", "Primary Consignee", "CONSIGNEE", "CLIENT-002"
        ),
        business,
        "127.0.0.1"
    ).get("id");
    String duplicateShipperId = (String) customerService.create(
        new CreateCustomerRequest("duplicate-shipper", "SecurePass!23", "Duplicate Shipper", "SHIPPER"),
        business,
        "127.0.0.1"
    ).get("id");
    CustomerShipmentBindingRequest binding = new CustomerShipmentBindingRequest(
        "shipment-public-id", null, null, null
    );

    assertThat(customerService.bindShipment(
        shipperId, binding, business, "127.0.0.1"
    ).get("relationshipRole")).isEqualTo("SHIPPER");
    assertThat(customerService.bindShipment(
        consigneeId, binding, business, "127.0.0.1"
    ).get("relationshipRole")).isEqualTo("CONSIGNEE");
    assertThatThrownBy(() -> customerService.bindShipment(
        duplicateShipperId, binding, business, "127.0.0.1"
    )).isInstanceOfSatisfying(ApiException.class, error ->
        assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT)
    );

    @SuppressWarnings("unchecked")
    List<Map<String, Object>> available =
        (List<Map<String, Object>>) customerService.listAvailableShipments(business).get("items");
    assertThat(available).filteredOn(item -> "shipment-public-id".equals(item.get("shipmentId")))
        .singleElement()
        .satisfies(item -> {
          assertThat(item.get("boundRoles")).isEqualTo(List.of("SHIPPER", "CONSIGNEE"));
          assertThat(item).containsEntry("clientNo", "CLIENT-001")
              .containsEntry("clientName", "Primary Shipper")
              .containsEntry("customerCount", 2);
          @SuppressWarnings("unchecked")
          List<Map<String, Object>> boundCustomers =
              (List<Map<String, Object>>) item.get("boundCustomers");
          assertThat(boundCustomers).extracting(customer -> customer.get("partyRole"))
              .containsExactly("SHIPPER", "CONSIGNEE");
          @SuppressWarnings("unchecked")
          List<Map<String, Object>> boundUsers =
              (List<Map<String, Object>>) item.get("boundUsers");
          assertThat(boundUsers).extracting(user -> user.get("role"))
              .containsExactly("OVERSEA_AGENT", "SHIPPER", "CONSIGNEE");
        });

    jdbcTemplate.update(
        "UPDATE cp_tracking_snapshots SET snapshot_json = ? WHERE id = "
            + "(SELECT current_snapshot_id FROM cp_shipments WHERE id = 10)",
        "{\"references\":{\"business\":{\"clientNameCode\":\"UNMATCHED-CLIENT\"}}}"
    );
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> unmatchedItems =
        (List<Map<String, Object>>) customerService.listAvailableShipments(business).get("items");
    assertThat(unmatchedItems)
        .filteredOn(item -> "shipment-public-id".equals(item.get("shipmentId")))
        .singleElement()
        .satisfies(item -> assertThat(item)
            .containsEntry("clientNo", "UNMATCHED-CLIENT")
            .containsEntry("clientName", null));
  }

  @Test
  void createsUpdatesAndDeletesManagedShipmentRecords() {
    Map<String, Object> created = customerService.createShipment(
        new CreateBusinessShipmentRequest(
            "COSCO", "BOOKING", "NEW-BOOKING-100", "Booking confirmed", "Created manually",
            "LJSH26050019", "OOCL POLAND 059E-35", "Shanghai", "Long Beach",
            "HW202600057-1", "2026-06-07", "2026-06-22",
            "2026-06-07 14:13:59", "2026-06-22 05:33:58", "2026-06-29 18:32:00",
            "Pacific Container Terminal", "5*40HC", "HAYDEN"
        ),
        business,
        "127.0.0.1"
    );
    String shipmentId = (String) created.get("shipmentId");
    assertThat(shipmentId).isNotBlank();
    assertThat(created).containsEntry("referenceNo", "NEW-BOOKING-100");
    String manualSnapshot = jdbcTemplate.queryForObject(
        """
        SELECT t.snapshot_json
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
        WHERE s.public_id = ?
        """,
        String.class,
        shipmentId
    );
    assertThat(manualSnapshot)
        .contains("\"channel\":\"MANUAL\"")
        .contains("Shanghai")
        .contains("Long Beach")
        .contains("2026-06-29 18:32:00")
        .contains("5*40HC")
        .doesNotContain("LJSH26050019", "HW202600057-1", "HAYDEN");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT job_number FROM cp_shipments WHERE public_id = ?", String.class, shipmentId
    )).isEqualTo("LJSH26050019");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT client_po_number FROM cp_shipments WHERE public_id = ?", String.class, shipmentId
    )).isEqualTo("HW202600057-1");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT client_name_code FROM cp_shipments WHERE public_id = ?", String.class, shipmentId
    )).isEqualTo("HAYDEN");
    jdbcTemplate.update(
        """
        UPDATE cp_shipments
        SET current_snapshot_id = 999, last_tracked_at = CURRENT_TIMESTAMP,
            fresh_until = CURRENT_TIMESTAMP
        WHERE public_id = ?
        """,
        shipmentId
    );

    Map<String, Object> updated = customerService.updateShipment(
        shipmentId,
        new UpdateBusinessShipmentRequest(
            "BILLOFLADING", "COSU1234567890", "In transit", "Customer notified"
        ),
        business,
        "127.0.0.1"
    );
    assertThat(updated)
        .containsEntry("referenceType", "BILLOFLADING")
        .containsEntry("referenceNo", "1234567890")
        .containsEntry("trackingStatus", "Booking confirmed")
        .containsEntry("note", "Customer notified");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT current_snapshot_id FROM cp_shipments WHERE public_id = ?",
        Long.class,
        shipmentId
    )).isNull();

    Long internalShipmentId = jdbcTemplate.queryForObject(
        "SELECT id FROM cp_shipments WHERE public_id = ?", Long.class, shipmentId
    );
    jdbcTemplate.update(
        "INSERT INTO cp_shipment_files (shipment_id, status) VALUES (?, 'READY')",
        internalShipmentId
    );
    Long fileId = jdbcTemplate.queryForObject(
        "SELECT id FROM cp_shipment_files WHERE shipment_id = ?", Long.class, internalShipmentId
    );
    assertThatThrownBy(() -> customerService.deleteShipment(
        shipmentId, business, "127.0.0.1"
    )).isInstanceOfSatisfying(ApiException.class, error ->
        assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT)
    );
    jdbcTemplate.update(
        "INSERT INTO cp_shipment_file_audit (shipment_file_id, shipment_id) VALUES (?, ?)",
        fileId, internalShipmentId
    );
    jdbcTemplate.update(
        "UPDATE cp_shipment_files SET status = 'DELETED' WHERE id = ?", fileId
    );

    assertThat(customerService.deleteShipment(shipmentId, business, "127.0.0.1"))
        .containsEntry("deleted", true)
        .containsEntry("shipmentId", shipmentId);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipments WHERE public_id = ?", Integer.class, shipmentId
    )).isZero();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_references WHERE reference_no_normalized = '1234567890'",
        Integer.class
    )).isZero();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_files WHERE shipment_id = ?",
        Integer.class,
        internalShipmentId
    )).isZero();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_file_audit WHERE shipment_id = ?",
        Integer.class,
        internalShipmentId
    )).isZero();
  }

  @Test
  void manualSnapshotUpdatesMergeIntoCurrentPayloadAndNoteOnlyWritesDoNotTouchIt()
      throws Exception {
    String carrierSnapshot = """
        {
          "channel":"AUTO",
          "tracking":{"type":"BOOKING","number":"BK-10001","status":"In transit"},
          "summary":{
            "origin":{"name":"Shanghai","countryCode":"CN"},
            "destination":{"name":"Los Angeles","countryCode":"US"},
            "latestEvent":{"name":"Loaded","location":"Shanghai"}
          },
          "keyTimes":{"estimatedFinalArrival":{"time":"2026-08-01 12:00:00"}},
          "routingLegs":[{"vessel":"COSCO STAR","routeMarker":"keep-me"}],
          "references":{"business":{"clientPoNumber":"PO-KEEP"}},
          "extraInformation":[{"key":"carrierField","value":"KEEP","source":"CARRIER"}]
        }
        """;
    jdbcTemplate.update(
        """
        UPDATE cp_tracking_snapshots
        SET snapshot_json = ?
        WHERE id = (SELECT current_snapshot_id FROM cp_shipments WHERE id = 10)
        """,
        carrierSnapshot
    );
    jdbcTemplate.update(
        "UPDATE cp_shipments SET business_note = 'Original note' WHERE id = 10"
    );

    customerService.updateManualSnapshot(
        "shipment-public-id",
        new CreateBusinessShipmentRequest(
            null, null, null, null, "Must not replace note",
            null, null, "Ningbo", null, null, null, null,
            null, null, null, null, null, null
        ),
        business,
        "127.0.0.1"
    );

    Long mergedSnapshotId = jdbcTemplate.queryForObject(
        "SELECT current_snapshot_id FROM cp_shipments WHERE id = 10", Long.class
    );
    String mergedJson = jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots WHERE id = ?",
        String.class,
        mergedSnapshotId
    );
    JsonNode merged = new ObjectMapper().readTree(mergedJson);
    assertThat(merged.path("summary").path("origin").path("name").asText())
        .isEqualTo("Ningbo");
    assertThat(merged.path("summary").path("origin").path("countryCode").asText())
        .isEqualTo("CN");
    assertThat(merged.path("summary").path("destination").path("countryCode").asText())
        .isEqualTo("US");
    assertThat(merged.path("routingLegs").get(0).path("routeMarker").asText())
        .isEqualTo("keep-me");
    assertThat(merged.path("references").path("business").path("clientPoNumber").asText())
        .isEqualTo("PO-KEEP");
    assertThat(merged.path("extraInformation").toString()).contains("carrierField");
    assertThat(customerService.getShipmentSnapshot(business, "shipment-public-id"))
        .containsEntry("estimatedArrival", "2026-08-01 12:00:00");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT business_note FROM cp_shipments WHERE id = 10", String.class
    )).isEqualTo("Original note");

    customerService.updateManualSnapshot(
        "shipment-public-id",
        new CreateBusinessShipmentRequest(null, null, null, null, "Ignored note-only request"),
        business,
        "127.0.0.1"
    );
    assertThat(jdbcTemplate.queryForObject(
        "SELECT current_snapshot_id FROM cp_shipments WHERE id = 10", Long.class
    )).isEqualTo(mergedSnapshotId);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots WHERE id = ?", String.class, mergedSnapshotId
    )).isEqualTo(mergedJson);

    customerService.updateShipment(
        "shipment-public-id",
        new UpdateBusinessShipmentRequest(null, null, null, "Saved through shipment endpoint"),
        business,
        "127.0.0.1"
    );
    assertThat(jdbcTemplate.queryForObject(
        "SELECT current_snapshot_id FROM cp_shipments WHERE id = 10", Long.class
    )).isEqualTo(mergedSnapshotId);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT snapshot_json FROM cp_tracking_snapshots WHERE id = ?", String.class, mergedSnapshotId
    )).isEqualTo(mergedJson);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT business_note FROM cp_shipments WHERE id = 10", String.class
    )).isEqualTo("Saved through shipment endpoint");
  }

  @Test
  void requiresExplicitPublicationAndInvalidatesBadSnapshots() {
    Map<String, Object> createdCustomer = customerService.create(
        new CreateCustomerRequest(
            "hayden-customer", "SecurePass!23", "Hayden", "SHIPPER", "HAYDEN"
        ),
        business,
        "127.0.0.1"
    );
    String customerId = (String) createdCustomer.get("id");
    CustomerLoginResponse login = authService.login(
        new CustomerLoginRequest(
            "hayden-customer", "SecurePass!23", (String) createdCustomer.get("customerCode")
        ),
        httpRequest
    );
    CustomerPrincipal principal = authService.authenticate(login.token(), httpRequest);
    Map<String, Object> createdShipment = customerService.createShipment(
        new CreateBusinessShipmentRequest(
            "COSCO", "BOOKING", "PUB-BOOKING-100", "Booking confirmed", null,
            "JOB-100", "OOCL TEST 001E", "Shanghai", "Long Beach", null,
            "2026-07-20", "2026-08-02", null, null, null,
            null, "1*40HC", "HAYDEN"
        ),
        business,
        "127.0.0.1"
    );
    String shipmentId = (String) createdShipment.get("shipmentId");
    Map<String, Object> binding = customerService.bindShipment(
        customerId,
        new CustomerShipmentBindingRequest(shipmentId, null, null, null),
        business,
        "127.0.0.1"
    );
    assertThat(binding.get("publicationStatus")).isEqualTo("DRAFT");
    assertThatThrownBy(() -> shipmentAccessService.requireCustomerAccess(shipmentId, principal))
        .isInstanceOfSatisfying(ApiException.class, error ->
            assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN)
        );

    Map<String, Object> published = customerService.setShipmentPublication(
        customerId, shipmentId, new ShipmentPublicationRequest(true), business, "127.0.0.1"
    );
    assertThat(published.get("publicationStatus")).isEqualTo("PUBLISHED");
    assertThat(shipmentAccessService.requireCustomerAccess(shipmentId, principal).shipmentPublicId())
        .isEqualTo(shipmentId);

    Map<String, Object> invalidated = customerService.invalidateCurrentSnapshot(
        shipmentId,
        new SnapshotInvalidationRequest("Carrier returned an incorrect empty route"),
        business,
        "127.0.0.1"
    );
    assertThat(invalidated).containsEntry("invalidated", true);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT invalidation_reason FROM cp_tracking_snapshots WHERE invalidated_at IS NOT NULL",
        String.class
    )).contains("incorrect empty route");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT publication_status FROM cp_customer_shipment_access WHERE customer_id = ?",
        String.class,
        principal.id()
    )).isEqualTo("DRAFT");
    assertThatThrownBy(() -> shipmentAccessService.requireCustomerAccess(shipmentId, principal))
        .isInstanceOf(ApiException.class);
  }

  @Test
  void refusesToPublishPlaceholderOnlyShipmentData() {
    String customerId = (String) customerService.create(
        new CreateCustomerRequest(
            "placeholder-customer", "SecurePass!23", "Placeholder Customer", "SHIPPER", "PLACEHOLDER"
        ),
        business,
        "127.0.0.1"
    ).get("id");
    String shipmentId = (String) customerService.createShipment(
        new CreateBusinessShipmentRequest(
            "COSCO", "BOOKING", "PLACEHOLDER-100", "暂无动态", null,
            null, null, null, null, null,
            null, null, null, null, null,
            "Unknown location", null, "PLACEHOLDER"
        ),
        business,
        "127.0.0.1"
    ).get("shipmentId");
    customerService.bindShipment(
        customerId,
        new CustomerShipmentBindingRequest(shipmentId, null, null, null),
        business,
        "127.0.0.1"
    );

    assertThatThrownBy(() -> customerService.setShipmentPublication(
        customerId, shipmentId, new ShipmentPublicationRequest(true), business, "127.0.0.1"
    )).isInstanceOfSatisfying(ApiException.class, error -> {
      assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT);
      assertThat(error.code()).isEqualTo("SNAPSHOT_NOT_PUBLISHABLE");
    });
  }

  @Test
  void batchBindingIsIdempotentAndBatchDeleteRemovesAllSelectedShipments() {
    String customerId = (String) customerService.create(
        new CreateCustomerRequest(
            "batch-customer", "SecurePass!23", "Batch Customer", "SHIPPER", "BATCH-001"
        ),
        business,
        "127.0.0.1"
    ).get("id");
    String firstShipmentId = (String) customerService.createShipment(
        new CreateBusinessShipmentRequest(
            "COSCO", "BOOKING", "BATCH-BOOKING-001", "Booked", null
        ),
        business,
        "127.0.0.1"
    ).get("shipmentId");
    String secondShipmentId = (String) customerService.createShipment(
        new CreateBusinessShipmentRequest(
            "COSCO", "BOOKING", "BATCH-BOOKING-002", "Booked", null
        ),
        business,
        "127.0.0.1"
    ).get("shipmentId");

    Map<String, Object> first = customerService.bindShipments(
        customerId,
        new CustomerShipmentBatchBindingRequest(List.of(firstShipmentId, secondShipmentId)),
        business,
        "127.0.0.1"
    );
    Map<String, Object> repeated = customerService.bindShipments(
        customerId,
        new CustomerShipmentBatchBindingRequest(List.of(firstShipmentId, secondShipmentId)),
        business,
        "127.0.0.1"
    );

    assertThat(first).containsEntry("bound", 2).containsEntry("skipped", 0);
    assertThat(repeated).containsEntry("bound", 0).containsEntry("skipped", 2);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_customer_shipment_access WHERE customer_id = "
            + "(SELECT id FROM cp_customers WHERE public_id = ?)",
        Integer.class,
        customerId
    )).isEqualTo(2);

    Map<String, Object> deleted = customerService.deleteShipments(
        new ShipmentBatchDeleteRequest(List.of(firstShipmentId, secondShipmentId)),
        business
    );
    assertThat(deleted).containsEntry("deleted", 2);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipments WHERE public_id IN (?, ?)",
        Integer.class,
        firstShipmentId,
        secondShipmentId
    )).isZero();
  }

  private void createSchema() {
    jdbcTemplate.execute("""
        CREATE TABLE cp_users (
          id BIGINT PRIMARY KEY,
          username VARCHAR(64) NOT NULL,
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
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          public_id CHAR(36) NOT NULL UNIQUE,
          carrier_code VARCHAR(32) NOT NULL,
          current_snapshot_id BIGINT,
          tracking_status VARCHAR(80),
          business_note TEXT,
          job_number VARCHAR(160),
          client_po_number VARCHAR(160),
          client_name_code VARCHAR(160),
          original_bill_of_lading VARCHAR(64),
          last_tracked_at TIMESTAMP,
          fresh_until TIMESTAMP,
          created_by BIGINT,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_references (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          shipment_id BIGINT NOT NULL,
          carrier_code VARCHAR(32) NOT NULL,
          reference_type VARCHAR(24) NOT NULL,
          reference_no_raw VARCHAR(160) NOT NULL,
          reference_no_normalized VARCHAR(128) NOT NULL,
          primary_reference BOOLEAN NOT NULL,
          UNIQUE (carrier_code, reference_type, reference_no_normalized),
          FOREIGN KEY (shipment_id) REFERENCES cp_shipments(id) ON DELETE CASCADE
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_tracking_snapshots (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          shipment_id BIGINT NOT NULL,
          query_reference_type VARCHAR(24) NOT NULL,
          query_reference_no VARCHAR(128) NOT NULL,
          queried_by BIGINT NOT NULL,
          queried_by_username VARCHAR(128) NOT NULL,
          source_channel VARCHAR(32),
          snapshot_json CLOB NOT NULL,
          strategy_json CLOB,
          payload_sha256 CHAR(64) NOT NULL,
          fetched_at TIMESTAMP NOT NULL,
          fresh_until TIMESTAMP NOT NULL,
          created_at TIMESTAMP NOT NULL,
          invalidated_at TIMESTAMP,
          invalidated_by BIGINT,
          invalidation_reason VARCHAR(500),
          INDEX idx_cp_tracking_snapshots_user_query (queried_by, query_reference_type, query_reference_no, invalidated_at),
          FOREIGN KEY (shipment_id) REFERENCES cp_shipments(id) ON DELETE CASCADE
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
          client_code VARCHAR(64),
          party_role VARCHAR(20) NOT NULL,
          password_salt VARCHAR(64),
          password_hash VARCHAR(128),
          password_iterations INT,
          customer_code_hash CHAR(64) NOT NULL UNIQUE,
          customer_code_prefix VARCHAR(16) NOT NULL,
          customer_code_mode VARCHAR(20) NOT NULL DEFAULT 'RANDOM',
          provisioning_source VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
          status VARCHAR(20) NOT NULL,
          remark VARCHAR(500),
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
          publication_status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
          assigned_by BIGINT NOT NULL,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          published_at TIMESTAMP,
          published_by BIGINT,
          PRIMARY KEY (customer_id, shipment_id)
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_client_match_queue (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          shipment_id BIGINT NOT NULL UNIQUE,
          imported_client_code VARCHAR(160) NOT NULL,
          match_status VARCHAR(32) NOT NULL,
          match_reason VARCHAR(64) NOT NULL,
          requested_by BIGINT,
          matched_customer_id BIGINT,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL,
          resolved_at TIMESTAMP
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_files (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          shipment_id BIGINT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'READY'
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_file_audit (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          shipment_file_id BIGINT NOT NULL,
          shipment_id BIGINT NOT NULL
        )
        """);
  }
}
