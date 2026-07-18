package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockMultipartFile;

class ShipmentFileServiceTest {
  @TempDir
  Path temporaryDirectory;

  private JdbcTemplate jdbcTemplate;
  private ShipmentFileService service;
  private ShipmentFileProperties properties;
  private ShipmentAccessService accessService;
  private AuthenticatedUser customer;
  private AuthenticatedUser business;
  private AuthenticatedUser outsider;
  private AuthenticatedUser admin;
  private CustomerPrincipal portalCustomer;
  private CustomerPrincipal otherPortalCustomer;

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
        INSERT INTO cp_users (id, display_name, role) VALUES
          (1, 'Customer One', 'EMPLOYEE'),
          (2, 'Business One', 'BUSINESS'),
          (3, 'Outside User', 'EMPLOYEE'),
          (4, 'Administrator', 'ADMIN')
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_customers (
          id, public_id, username, display_name, party_role, customer_code_hash,
          customer_code_prefix, status, created_by
        ) VALUES
          (20, 'customer-public-id', 'portal-customer', 'Portal Customer', 'SHIPPER',
           'hash-20', 'DL-PORTAL', 'ACTIVE', 2),
          (21, 'other-customer-id', 'other-customer', 'Other Customer', 'CONSIGNEE',
           'hash-21', 'DL-OTHER', 'ACTIVE', 2)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_customer_shipment_access (
          customer_id, shipment_id, relationship_role, assigned_by
        ) VALUES (20, 10, 'SHIPPER', 2)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipments (id, public_id, carrier_code, created_at, updated_at)
        VALUES (10, 'shipment-public-id', 'COSCO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_references (
          id, shipment_id, carrier_code, reference_type, reference_no_raw,
          reference_no_normalized, primary_reference
        ) VALUES (100, 10, 'COSCO', 'BOOKING', 'BK-10001', 'BK-10001', TRUE)
        """
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_participants (
          shipment_id, user_id, participant_role, granted_by
        ) VALUES (10, 1, 'CUSTOMER', 1), (10, 2, 'OPERATOR', 2)
        """
    );

    properties = new ShipmentFileProperties();
    properties.setRoot(temporaryDirectory.toString());
    properties.setMaxFileSizeBytes(1024 * 1024);
    properties.setMinFreeSpaceBytes(0);
    accessService = new ShipmentAccessService(jdbcTemplate);
    rebuildService();
    customer = new AuthenticatedUser(1, "customer", "Customer One", "EMPLOYEE", "ACTIVE");
    business = new AuthenticatedUser(2, "business", "Business One", "BUSINESS", "ACTIVE");
    outsider = new AuthenticatedUser(3, "outside", "Outside User", "EMPLOYEE", "ACTIVE");
    admin = new AuthenticatedUser(4, "admin", "Administrator", "ADMIN", "ACTIVE");
    portalCustomer = new CustomerPrincipal(
        20, "customer-public-id", "portal-customer", "Portal Customer", "SHIPPER", "ACTIVE"
    );
    otherPortalCustomer = new CustomerPrincipal(
        21, "other-customer-id", "other-customer", "Other Customer", "CONSIGNEE", "ACTIVE"
    );
  }

  @Test
  void repairsMissingStorageLockRowBeforeUpload() {
    jdbcTemplate.update("DELETE FROM cp_shipment_file_storage_lock WHERE id = 1");

    ShipmentFileService.SavedShipmentFile saved = service.storeCustomer(
        upload("cargo-details.pdf", "cargo-data"),
        "shipment-public-id",
        portalCustomer,
        "CARGO_DETAIL",
        "127.0.0.1"
    );

    assertThat(saved.record().status()).isEqualTo("READY");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_file_storage_lock WHERE id = 1",
        Integer.class
    )).isEqualTo(1);
  }

  @Test
  void enforcesParticipantVisibilityAndSoftDeleteRules() throws Exception {
    ShipmentFileService.SavedShipmentFile saved = service.store(
        upload("invoice.pdf", "invoice-data"),
        "shipment-public-id",
        business,
        "INVOICE",
        "PARTIES",
        "customer-public-id",
        "127.0.0.1"
    );

    assertThat(saved.record().visibility()).isEqualTo("PARTIES");
    assertThat(saved.record().targetCustomerId()).isEqualTo(20L);
    assertThat(Files.readString(saved.path())).isEqualTo("invoice-data");
    assertThat(((List<?>) service.list("shipment-public-id", customer).get("items"))).hasSize(1);
    assertThatThrownBy(() -> service.list("shipment-public-id", outsider))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN));
    assertThatThrownBy(() -> service.updateVisibility(
        saved.record().publicId(),
        "INTERNAL",
        customer,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN));

    Map<String, Object> updated = service.updateVisibility(
        saved.record().publicId(),
        "INTERNAL",
        business,
        "127.0.0.1"
    );
    assertThat(updated.get("visibility")).isEqualTo("INTERNAL");
    assertThat(((List<?>) service.list("shipment-public-id", customer).get("items"))).isEmpty();
    assertThat(service.content(saved.record().publicId(), business, "127.0.0.1").path())
        .isEqualTo(saved.path());

    service.delete(saved.record().publicId(), business, "127.0.0.1");

    assertThat(Files.exists(saved.path())).isFalse();
    assertThat(jdbcTemplate.queryForObject(
        "SELECT status FROM cp_shipment_files WHERE public_id = ?",
        String.class,
        saved.record().publicId()
    )).isEqualTo("DELETED");
    assertThat(((List<?>) service.list("shipment-public-id", business).get("items"))).isEmpty();
    assertThat(service.listAll(null, 0, 100, true, admin).get("total")).isEqualTo(1L);
    assertThat(jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_file_audit",
        Integer.class
    )).isEqualTo(4);
  }

  @Test
  void customerCanOnlyUseAssignedPartiesFilesAndDeleteOwnUpload() throws Exception {
    ShipmentFileService.SavedShipmentFile saved = service.storeCustomer(
        upload("cargo-detail.xlsx", "customer-cargo"),
        "shipment-public-id",
        portalCustomer,
        "CARGO_DETAIL",
        "127.0.0.1"
    );

    assertThat(saved.record().uploaderUserId()).isNull();
    assertThat(saved.record().uploaderCustomerId()).isEqualTo(20L);
    assertThat(saved.record().targetCustomerId()).isEqualTo(20L);
    assertThat(saved.record().visibility()).isEqualTo("PARTIES");
    Map<String, Object> metadata = service.metadataCustomer(saved, portalCustomer);
    assertThat(metadata.get("uploaderType")).isEqualTo("CUSTOMER");
    assertThat(metadata.get("canChangeVisibility")).isEqualTo(false);
    assertThat(((List<?>) service.listCustomer("shipment-public-id", portalCustomer).get("items")))
        .hasSize(1);
    assertThatThrownBy(() -> service.listCustomer("shipment-public-id", otherPortalCustomer))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.FORBIDDEN));

    service.deleteCustomer(saved.record().publicId(), portalCustomer, "127.0.0.1");

    assertThat(jdbcTemplate.queryForObject(
        "SELECT status FROM cp_shipment_files WHERE public_id = ?",
        String.class,
        saved.record().publicId()
    )).isEqualTo("DELETED");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT deleted_by_customer_id FROM cp_shipment_files WHERE public_id = ?",
        Long.class,
        saved.record().publicId()
    )).isEqualTo(20L);
    assertThat(Files.exists(saved.path())).isFalse();
  }

  @Test
  void isolatesFilesBetweenCustomersAssignedToTheSameShipment() {
    jdbcTemplate.update(
        "INSERT INTO cp_customer_shipment_access "
            + "(customer_id, shipment_id, relationship_role, assigned_by) "
            + "VALUES (21, 10, 'CONSIGNEE', 2)"
    );
    jdbcTemplate.update(
        """
        INSERT INTO cp_customers (
          id, public_id, username, display_name, party_role, customer_code_hash,
          customer_code_prefix, status, created_by
        ) VALUES (
          22, 'admin-customer-id', 'admin-customer', 'Admin Customer', 'AGENT',
          'hash-22', 'DL-ADMIN', 'ACTIVE', 4
        )
        """
    );
    jdbcTemplate.update(
        "INSERT INTO cp_customer_shipment_access "
            + "(customer_id, shipment_id, relationship_role, assigned_by) "
            + "VALUES (22, 10, 'AGENT', 4)"
    );
    assertThat(((List<?>) service.list("shipment-public-id", business)
        .get("assignableCustomers")).stream()
        .map(item -> String.valueOf(((Map<?, ?>) item).get("id"))))
        .containsExactlyInAnyOrder("customer-public-id", "other-customer-id");
    assertThat(((List<?>) service.list("shipment-public-id", admin)
        .get("assignableCustomers")).stream()
        .map(item -> String.valueOf(((Map<?, ?>) item).get("id"))))
        .containsExactlyInAnyOrder(
            "customer-public-id", "other-customer-id", "admin-customer-id"
        );
    ShipmentFileService.SavedShipmentFile shipperFile = service.storeCustomer(
        upload("shipper.pdf", "shipper"),
        "shipment-public-id",
        portalCustomer,
        "RELATED",
        "127.0.0.1"
    );
    ShipmentFileService.SavedShipmentFile consigneeFile = service.storeCustomer(
        upload("consignee.pdf", "consignee"),
        "shipment-public-id",
        otherPortalCustomer,
        "RELATED",
        "127.0.0.1"
    );

    assertThat(((List<?>) service.listCustomer("shipment-public-id", portalCustomer).get("items"))
        .stream().map(item -> String.valueOf(((Map<?, ?>) item).get("id"))).toList())
        .containsExactly(shipperFile.record().publicId());
    assertThat(((List<?>) service.listCustomer("shipment-public-id", otherPortalCustomer).get("items"))
        .stream().map(item -> String.valueOf(((Map<?, ?>) item).get("id"))).toList())
        .containsExactly(consigneeFile.record().publicId());
    assertThatThrownBy(() -> service.contentCustomer(
        consigneeFile.record().publicId(),
        portalCustomer,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status()).isEqualTo(HttpStatus.NOT_FOUND));

    ShipmentFileService.SavedShipmentFile targetedInternalFile = service.store(
        upload("agent-to-shipper.pdf", "agent"),
        "shipment-public-id",
        business,
        "RELATED",
        "PARTIES",
        "customer-public-id",
        "127.0.0.1"
    );
    assertThat(targetedInternalFile.record().targetCustomerId()).isEqualTo(20L);
    assertThat(service.metadata(targetedInternalFile, business).get("targetCustomerId"))
        .isEqualTo("customer-public-id");
    Map<String, Object> internalOnly = service.updateVisibility(
        targetedInternalFile.record().publicId(),
        "INTERNAL_ONLY",
        null,
        business,
        "127.0.0.1"
    );
    assertThat(internalOnly.get("visibility")).isEqualTo("INTERNAL");
    assertThat(internalOnly.get("targetCustomerId")).isNull();
    assertThatThrownBy(() -> service.updateVisibility(
        targetedInternalFile.record().publicId(),
        "PARTIES",
        null,
        business,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.BAD_REQUEST));
    assertThatThrownBy(() -> service.updateVisibility(
        targetedInternalFile.record().publicId(),
        "PARTIES",
        "admin-customer-id",
        business,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.NOT_FOUND));
    Map<String, Object> sharedAgain = service.updateVisibility(
        targetedInternalFile.record().publicId(),
        "PARTIES",
        "customer-public-id",
        business,
        "127.0.0.1"
    );
    assertThat(sharedAgain.get("visibility")).isEqualTo("PARTIES");
    assertThat(sharedAgain.get("targetCustomerId")).isEqualTo("customer-public-id");
    assertThat((List<?>) service.listCustomer("shipment-public-id", portalCustomer).get("items"))
        .hasSize(2);
    assertThat((List<?>) service.listCustomer("shipment-public-id", otherPortalCustomer).get("items"))
        .hasSize(1);

    assertThatThrownBy(() -> service.store(
        upload("legacy-unscoped.pdf", "legacy"),
        "shipment-public-id",
        business,
        "RELATED",
        "PARTIES",
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.BAD_REQUEST));
    assertThat((List<?>) service.list("shipment-public-id", business).get("items"))
        .hasSize(3);
  }

  @Test
  void enforcesShipmentCountAndByteQuotas() {
    properties.setMaxFilesPerShipment(1);
    properties.setMaxBytesPerShipment(1024);
    rebuildService();

    service.store(
        upload("first.pdf", "first"),
        "shipment-public-id",
        business,
        "RELATED",
        "INTERNAL",
        "127.0.0.1"
    );

    assertThatThrownBy(() -> service.store(
        upload("second.pdf", "second"),
        "shipment-public-id",
        business,
        "RELATED",
        "INTERNAL",
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.INSUFFICIENT_STORAGE));

    properties.setMaxFilesPerShipment(10);
    properties.setMaxBytesPerShipment(6);
    rebuildService();
    assertThatThrownBy(() -> service.store(
        upload("too-large-total.pdf", "12"),
        "shipment-public-id",
        business,
        "RELATED",
        "INTERNAL",
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.INSUFFICIENT_STORAGE));
  }

  @Test
  void enforcesCustomerQuotaAcrossAssignedShipments() {
    jdbcTemplate.update(
        "INSERT INTO cp_shipments (id, public_id, carrier_code, created_at, updated_at) "
            + "VALUES (11, 'second-shipment-id', 'COSCO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    );
    jdbcTemplate.update(
        "INSERT INTO cp_customer_shipment_access "
            + "(customer_id, shipment_id, relationship_role, assigned_by) "
            + "VALUES (20, 11, 'SHIPPER', 2)"
    );
    properties.setMaxFilesPerShipment(10);
    properties.setMaxBytesPerShipment(1024);
    properties.setMaxBytesPerCustomer(8);
    rebuildService();

    service.storeCustomer(
        upload("first.pdf", "12345"),
        "shipment-public-id",
        portalCustomer,
        "RELATED",
        "127.0.0.1"
    );
    assertThatThrownBy(() -> service.storeCustomer(
        upload("second.pdf", "6789"),
        "second-shipment-id",
        portalCustomer,
        "RELATED",
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.INSUFFICIENT_STORAGE));
  }

  @Test
  void protectsConfiguredDiskFreeSpaceFloor() {
    properties.setMinFreeSpaceBytes(Long.MAX_VALUE);
    rebuildService();

    assertThatThrownBy(() -> service.store(
        upload("invoice.pdf", "content"),
        "shipment-public-id",
        business,
        "RELATED",
        "INTERNAL",
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.INSUFFICIENT_STORAGE));
  }

  @Test
  void failedPhysicalDeleteKeepsRecoverableMetadataAndCanBeRetried() throws Exception {
    ShipmentFileService.SavedShipmentFile saved = service.store(
        upload("invoice.pdf", "content"),
        "shipment-public-id",
        business,
        "RELATED",
        "INTERNAL",
        "127.0.0.1"
    );
    Files.delete(saved.path());
    Files.createDirectory(saved.path());
    Path blocker = saved.path().resolve("blocker");
    Files.writeString(blocker, "block");

    assertThatThrownBy(() -> service.delete(
        saved.record().publicId(),
        business,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR));
    assertThat(jdbcTemplate.queryForObject(
        "SELECT status FROM cp_shipment_files WHERE public_id = ?",
        String.class,
        saved.record().publicId()
    )).isEqualTo("DELETE_FAILED");
    properties.setMaxFilesPerShipment(1);
    rebuildService();
    assertThatThrownBy(() -> service.store(
        upload("blocked-by-failed-delete.pdf", "other"),
        "shipment-public-id",
        business,
        "RELATED",
        "INTERNAL",
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.INSUFFICIENT_STORAGE));

    Files.delete(blocker);
    Files.delete(saved.path());
    service.delete(saved.record().publicId(), business, "127.0.0.1");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT status FROM cp_shipment_files WHERE public_id = ?",
        String.class,
        saved.record().publicId()
    )).isEqualTo("DELETED");
    assertThat(service.store(
        upload("after-cleanup.pdf", "other"),
        "shipment-public-id",
        business,
        "RELATED",
        "INTERNAL",
        "127.0.0.1"
    ).record().status()).isEqualTo("READY");
  }

  private void rebuildService() {
    service = new ShipmentFileService(
        jdbcTemplate,
        new ObjectMapper(),
        accessService,
        properties,
        Clock.fixed(Instant.parse("2026-07-16T11:00:00Z"), ZoneOffset.UTC)
    );
  }

  private MockMultipartFile upload(String name, String content) {
    return new MockMultipartFile(
        "file",
        name,
        "application/pdf",
        content.getBytes(StandardCharsets.UTF_8)
    );
  }

  private void createSchema() {
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_file_storage_lock (
          id TINYINT PRIMARY KEY,
          lock_name VARCHAR(64) NOT NULL UNIQUE
        )
        """);
    jdbcTemplate.update(
        "INSERT INTO cp_shipment_file_storage_lock (id, lock_name) VALUES (1, 'shipment-file-capacity')"
    );
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
          carrier_code VARCHAR(32) NOT NULL,
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
          granted_by BIGINT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (shipment_id, user_id)
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_customers (
          id BIGINT PRIMARY KEY,
          public_id CHAR(36) NOT NULL UNIQUE,
          username VARCHAR(64) NOT NULL,
          display_name VARCHAR(80) NOT NULL,
          party_role VARCHAR(20) NOT NULL,
          customer_code_hash CHAR(64) NOT NULL,
          customer_code_prefix VARCHAR(16) NOT NULL,
          status VARCHAR(20) NOT NULL,
          created_by BIGINT NOT NULL
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
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_files (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          public_id CHAR(36) NOT NULL UNIQUE,
          shipment_id BIGINT NOT NULL,
          uploader_user_id BIGINT,
          uploader_customer_id BIGINT,
          target_customer_id BIGINT,
          uploader_role_snapshot VARCHAR(24) NOT NULL,
          document_category VARCHAR(32) NOT NULL,
          original_file_name VARCHAR(255) NOT NULL,
          stored_relative_path VARCHAR(512) NOT NULL UNIQUE,
          content_type VARCHAR(160) NOT NULL,
          extension VARCHAR(20) NOT NULL,
          size_bytes BIGINT NOT NULL,
          sha256 CHAR(64) NOT NULL,
          visibility VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL,
          deleted_at TIMESTAMP,
          deleted_by BIGINT,
          deleted_by_customer_id BIGINT
        )
        """);
    jdbcTemplate.execute("""
        CREATE TABLE cp_shipment_file_audit (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          shipment_file_id BIGINT NOT NULL,
          shipment_id BIGINT NOT NULL,
          actor_user_id BIGINT,
          actor_customer_id BIGINT,
          action VARCHAR(32) NOT NULL,
          before_json CLOB,
          after_json CLOB,
          ip_address VARCHAR(64),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """);
  }
}
