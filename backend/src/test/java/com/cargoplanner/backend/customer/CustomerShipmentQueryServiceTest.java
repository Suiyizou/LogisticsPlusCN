package com.cargoplanner.backend.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.shipment.ShipmentBatchItemRequest;
import com.cargoplanner.backend.shipment.ShipmentTrackingProperties;
import com.cargoplanner.backend.shipment.TrackingCarriers;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class CustomerShipmentQueryServiceTest {
  private static final AuthenticatedUser ADMIN =
      new AuthenticatedUser(100, "admin", "Administrator", "ADMIN", "ACTIVE");
  private static final AuthenticatedUser BUSINESS =
      new AuthenticatedUser(1, "operator", "Operator", "BUSINESS", "ACTIVE");
  private JdbcTemplate jdbc;
  private CustomerShipmentQueryService service;
  private ShipmentTrackingProperties properties;

  @BeforeEach
  void setUp() {
    jdbc = new JdbcTemplate(new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
    jdbc.execute("""
        CREATE TABLE cp_shipments (
          id BIGINT PRIMARY KEY, public_id VARCHAR(36), carrier_code VARCHAR(32),
          responsible_agent_id BIGINT, current_snapshot_id BIGINT, tracking_status VARCHAR(80),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)
        """);
    jdbc.execute("""
        CREATE TABLE cp_tracking_snapshots (
          id BIGINT PRIMARY KEY, invalidated_at TIMESTAMP, fetched_at TIMESTAMP)
        """);
    jdbc.execute("""
        CREATE TABLE cp_shipment_references (
          id BIGINT PRIMARY KEY, shipment_id BIGINT, reference_type VARCHAR(24),
          reference_no_normalized VARCHAR(128), reference_no_raw VARCHAR(128), primary_reference BOOLEAN)
        """);
    jdbc.execute("CREATE TABLE cp_shipment_participants (shipment_id BIGINT, user_id BIGINT)");
    service = new CustomerShipmentQueryService(jdbc, new ObjectMapper(), new CustomerAccessGuard());
    properties = new ShipmentTrackingProperties();
    service.setTrackingProperties(properties);
  }

  @Test
  void localQueueRefreshesEverySupportedCarrierUsingDurableReferencesAndKeepsSelectionOrder() {
    properties.setAdapterMode(ShipmentTrackingProperties.AdapterMode.LOCAL_QUEUE);
    List<String> ids = new ArrayList<>();
    int index = 1;
    for (String carrier : TrackingCarriers.CODES) {
      ids.add(insertShipment(index++, carrier, "CMA".equals(carrier) ? "BOOKING" : "BILLOFLADING", 1));
    }
    jdbc.update("UPDATE cp_shipment_references SET reference_no_normalized = 'COSU0012345678', "
        + "reference_no_raw = 'COSU0012345678' WHERE shipment_id = 1");

    List<ShipmentBatchItemRequest> all = service.listUnfinishedTrackingItems(ADMIN);
    assertThat(all).hasSize(TrackingCarriers.CODES.size());
    assertThat(all).extracting(ShipmentBatchItemRequest::carrier)
        .containsExactlyInAnyOrderElementsOf(TrackingCarriers.CODES);
    assertThat(all.stream().filter(item -> "COSCO".equals(item.carrier())).findFirst().orElseThrow())
        .satisfies(item -> {
          assertThat(item.type()).isEqualTo("BILLOFLADING");
          assertThat(item.number()).isEqualTo("COSU0012345678");
        });
    assertThat(all.stream().filter(item -> "CMA".equals(item.carrier())).findFirst().orElseThrow().type())
        .isEqualTo("BOOKING");

    Collections.reverse(ids);
    assertThat(service.listSelectedTrackingItems(ADMIN, ids))
        .extracting(ShipmentBatchItemRequest::id)
        .containsExactlyElementsOf(ids.stream().map(id -> "refresh-" + id).toList());
  }

  @Test
  void localQueueRejectsCmaBillOnlyShipmentsAndStillExcludesReturnedShipmentsFromRefreshAll() {
    properties.setAdapterMode(ShipmentTrackingProperties.AdapterMode.LOCAL_QUEUE);
    String cmaBill = insertShipment(1, "CMA", "BILLOFLADING", 1);
    insertShipment(2, "HMM", "BILLOFLADING", 1);
    jdbc.update("UPDATE cp_shipments SET tracking_status = 'EMPTY_RETURNED' WHERE id = 2");

    assertThat(service.listUnfinishedTrackingItems(ADMIN)).isEmpty();
    assertThatThrownBy(() -> service.listSelectedTrackingItems(ADMIN, List.of(cmaBill)))
        .isInstanceOfSatisfying(ApiException.class,
            error -> assertThat(error.status()).isEqualTo(HttpStatus.BAD_REQUEST));
  }

  @Test
  void expandedLocalCarrierSupportPreservesOwnerAndParticipantPermissions() {
    properties.setAdapterMode(ShipmentTrackingProperties.AdapterMode.LOCAL_QUEUE);
    String owned = insertShipment(1, "HMM", "BILLOFLADING", 1);
    String unrelated = insertShipment(2, "SML", "BILLOFLADING", 2);
    assertThat(service.listUnfinishedTrackingItems(BUSINESS))
        .extracting(ShipmentBatchItemRequest::id).containsExactly("refresh-" + owned);
    assertThatThrownBy(() -> service.listSelectedTrackingItems(BUSINESS, List.of(unrelated)))
        .isInstanceOf(ApiException.class);

    jdbc.update("INSERT INTO cp_shipment_participants (shipment_id, user_id) VALUES (2, 1)");
    assertThat(service.listSelectedTrackingItems(BUSINESS, List.of(unrelated)))
        .extracting(ShipmentBatchItemRequest::id).containsExactly("refresh-" + unrelated);
    assertThat(service.listUnfinishedTrackingItems(BUSINESS)).hasSize(2);
    assertThatThrownBy(() -> service.listUnfinishedTrackingItems(
        new AuthenticatedUser(1, "customer", "Customer", "CUSTOMER", "ACTIVE")))
        .isInstanceOfSatisfying(ApiException.class,
            error -> assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN));
  }

  @Test
  void legacyModeKeepsItsExistingCarrierAndBookingOnlyRefreshPolicy() {
    String booking = insertShipment(1, "COSCO", "BOOKING", 1);
    insertShipment(2, "MSC", "BILLOFLADING", 1);
    String localCarrier = insertShipment(3, "HMM", "BOOKING", 1);
    assertThat(service.listUnfinishedTrackingItems(ADMIN))
        .extracting(ShipmentBatchItemRequest::id).containsExactly("refresh-" + booking);
    assertThatThrownBy(() -> service.listSelectedTrackingItems(ADMIN, List.of(localCarrier)))
        .isInstanceOf(ApiException.class);
  }

  private String insertShipment(long id, String carrier, String type, long owner) {
    String publicId = String.format("00000000-0000-0000-0000-%012d", id);
    jdbc.update("""
        INSERT INTO cp_shipments (id, public_id, carrier_code, responsible_agent_id, tracking_status)
        VALUES (?, ?, ?, ?, 'In transit')
        """, id, publicId, carrier, owner);
    jdbc.update("""
        INSERT INTO cp_shipment_references (
          id, shipment_id, reference_type, reference_no_normalized, reference_no_raw, primary_reference)
        VALUES (?, ?, ?, ?, ?, TRUE)
        """, id, id, type, "REF0000" + id, "REF0000" + id);
    return publicId;
  }
}
