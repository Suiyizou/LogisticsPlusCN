package com.cargoplanner.backend.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.spy;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

/** Calls the real domain service through Spring's transaction proxy, without a test transaction. */
@SpringJUnitConfig(SnapshotInvalidationTransactionTest.Config.class)
class SnapshotInvalidationTransactionTest {
  private static final AuthenticatedUser ADMIN =
      new AuthenticatedUser(4, "admin", "Administrator", "ADMIN", "ACTIVE", "OVERSEA_AGENT");

  @Autowired private CustomerShipmentMutationService service;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private CustomerAuditService audit;
  @Autowired private PlatformTransactionManager transactionManager;

  @BeforeEach
  void setUp() {
    reset(audit);
    jdbc.execute("DROP ALL OBJECTS");
    jdbc.execute("""
        CREATE TABLE cp_shipments (
          id BIGINT PRIMARY KEY, public_id VARCHAR(64), carrier_code VARCHAR(20),
          responsible_agent_id BIGINT, current_snapshot_id BIGINT, tracking_status VARCHAR(80),
          last_tracked_at TIMESTAMP, fresh_until TIMESTAMP, updated_at TIMESTAMP)
        """);
    jdbc.execute("""
        CREATE TABLE cp_tracking_snapshots (
          id BIGINT PRIMARY KEY, shipment_id BIGINT, invalidated_at TIMESTAMP,
          invalidated_by BIGINT, invalidation_reason VARCHAR(500))
        """);
    jdbc.execute("""
        CREATE TABLE cp_customer_shipment_access (
          shipment_id BIGINT, publication_status VARCHAR(20),
          published_at TIMESTAMP, published_by BIGINT)
        """);
    jdbc.execute("""
        CREATE TABLE cp_admin_audit_log (
          admin_user_id BIGINT, action VARCHAR(100), target_type VARCHAR(40),
          target_id BIGINT, detail VARCHAR(512), ip_address VARCHAR(64))
        """);
    jdbc.update("""
        INSERT INTO cp_shipments VALUES
          (10, 'shipment-A', 'COSCO', 4, 100, 'In transit',
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """);
    jdbc.update("INSERT INTO cp_tracking_snapshots (id, shipment_id) VALUES (100, 10), (101, 10)");
    jdbc.update("""
        INSERT INTO cp_customer_shipment_access VALUES
          (10, 'PUBLISHED', CURRENT_TIMESTAMP, 4)
        """);
  }

  @ParameterizedTest
  @ValueSource(strings = {"snapshot", "shipment", "publication", "audit"})
  void failureAtAnyWriteRollsBackTheWholeOperation(String failureStage) {
    String constraint = switch (failureStage) {
      case "snapshot" -> "cp_tracking_snapshots ADD CHECK (invalidated_at IS NULL)";
      case "shipment" -> "cp_shipments ADD CHECK (current_snapshot_id IS NOT NULL)";
      case "publication" -> "cp_customer_shipment_access ADD CHECK (publication_status = 'PUBLISHED')";
      case "audit" -> "cp_admin_audit_log ADD CHECK (action <> 'INVALIDATE_TRACKING_SNAPSHOT')";
      default -> throw new IllegalArgumentException(failureStage);
    };
    jdbc.execute("ALTER TABLE " + constraint);

    assertThat(AopUtils.isAopProxy(service)).isTrue();
    assertThatThrownBy(this::invalidate).isInstanceOf(DataIntegrityViolationException.class);

    assertThat(jdbc.queryForObject(
        "SELECT current_snapshot_id FROM cp_shipments WHERE id = 10", Long.class)).isEqualTo(100L);
    assertThat(jdbc.queryForObject(
        "SELECT tracking_status FROM cp_shipments WHERE id = 10", String.class)).isEqualTo("In transit");
    assertThat(jdbc.queryForObject(
        "SELECT COUNT(*) FROM cp_shipments WHERE last_tracked_at IS NOT NULL AND fresh_until IS NOT NULL",
        Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject(
        "SELECT COUNT(*) FROM cp_tracking_snapshots WHERE invalidated_at IS NOT NULL",
        Integer.class)).isZero();
    assertThat(jdbc.queryForObject(
        "SELECT COUNT(*) FROM cp_customer_shipment_access WHERE publication_status = 'PUBLISHED' AND published_at IS NOT NULL AND published_by = 4",
        Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_admin_audit_log", Integer.class)).isZero();
  }

  @Test
  void successfulInvalidationCommitsAllRelatedState() {
    assertThat(invalidate()).containsEntry("snapshotId", 100L).containsEntry("invalidated", true);
    assertThat(jdbc.queryForObject(
        "SELECT current_snapshot_id FROM cp_shipments WHERE id = 10", Long.class)).isNull();
    assertThat(jdbc.queryForObject(
        "SELECT invalidation_reason FROM cp_tracking_snapshots WHERE id = 100", String.class))
        .isEqualTo("Incorrect carrier data");
    assertThat(jdbc.queryForObject(
        "SELECT publication_status FROM cp_customer_shipment_access", String.class)).isEqualTo("DRAFT");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_admin_audit_log", Integer.class)).isEqualTo(1);
    assertThatThrownBy(this::invalidate).isInstanceOf(ApiException.class);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_admin_audit_log", Integer.class)).isEqualTo(1);
  }

  @Test
  void refusesToInvalidateASnapshotBelongingToAnotherShipment() {
    jdbc.update("UPDATE cp_tracking_snapshots SET shipment_id = 20 WHERE id = 100");
    assertThatThrownBy(this::invalidate).isInstanceOf(ApiException.class);
    assertThat(jdbc.queryForObject(
        "SELECT current_snapshot_id FROM cp_shipments WHERE id = 10", Long.class)).isEqualTo(100L);
    assertThat(jdbc.queryForObject(
        "SELECT COUNT(*) FROM cp_tracking_snapshots WHERE invalidated_at IS NOT NULL",
        Integer.class)).isZero();
    assertThat(jdbc.queryForObject(
        "SELECT publication_status FROM cp_customer_shipment_access", String.class)).isEqualTo("PUBLISHED");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_admin_audit_log", Integer.class)).isZero();
  }

  @Test
  void concurrentRefreshWaitsForInvalidationAndItsNewSnapshotRemainsCurrent() throws Exception {
    CountDownLatch invalidationWriting = new CountDownLatch(1);
    CountDownLatch finishInvalidation = new CountDownLatch(1);
    CountDownLatch refreshStarted = new CountDownLatch(1);
    doAnswer(invocation -> {
      invalidationWriting.countDown();
      if (!finishInvalidation.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Test timed out");
      return invocation.callRealMethod();
    }).when(audit).shipment(any(), anyString(), anyLong(), anyString(), anyString());

    var executor = Executors.newFixedThreadPool(2);
    try {
      var invalidation = executor.submit(this::invalidate);
      assertThat(invalidationWriting.await(5, TimeUnit.SECONDS)).isTrue();
      var refresh = executor.submit(() -> new TransactionTemplate(transactionManager).execute(status -> {
        refreshStarted.countDown();
        jdbc.queryForObject("SELECT id FROM cp_shipments WHERE id = 10 FOR UPDATE", Long.class);
        jdbc.update("UPDATE cp_shipments SET current_snapshot_id = 101, tracking_status = 'Refreshed' WHERE id = 10");
        return true;
      }));
      assertThat(refreshStarted.await(5, TimeUnit.SECONDS)).isTrue();
      assertThatThrownBy(() -> refresh.get(200, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
      finishInvalidation.countDown();
      invalidation.get(5, TimeUnit.SECONDS);
      assertThat(refresh.get(5, TimeUnit.SECONDS)).isTrue();
      assertThat(jdbc.queryForObject(
          "SELECT current_snapshot_id FROM cp_shipments WHERE id = 10", Long.class)).isEqualTo(101L);
      assertThat(jdbc.queryForObject(
          "SELECT invalidated_at FROM cp_tracking_snapshots WHERE id = 101", java.sql.Timestamp.class)).isNull();
    } finally {
      finishInvalidation.countDown();
      executor.shutdownNow();
    }
  }

  private java.util.Map<String, Object> invalidate() {
    return service.invalidateCurrentSnapshot(
        "shipment-A", new SnapshotInvalidationRequest("Incorrect carrier data"), ADMIN, "127.0.0.1");
  }

  @Configuration
  @EnableTransactionManagement(proxyTargetClass = true)
  static class Config {
    @Bean
    DataSource dataSource() {
      return new DriverManagerDataSource(
          "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000", "sa", "");
    }

    @Bean JdbcTemplate jdbcTemplate(DataSource source) { return new JdbcTemplate(source); }
    @Bean PlatformTransactionManager transactionManager(DataSource source) {
      return new DataSourceTransactionManager(source);
    }
    @Bean CustomerAuditService auditService(JdbcTemplate jdbc) { return spy(new CustomerAuditService(jdbc)); }
    @Bean
    CustomerShipmentMutationService mutationService(JdbcTemplate jdbc, CustomerAuditService audit) {
      CustomerAccessGuard guard = new CustomerAccessGuard();
      return new CustomerShipmentMutationService(
          jdbc, new ObjectMapper(), guard, new CustomerLookupService(jdbc, guard),
          new ShipmentLookupService(jdbc), new CustomerShipmentAccessPolicy(jdbc),
          mock(OverseaAgentService.class), audit, new CustomerInputRules(),
          mock(CustomerShipmentBindingService.class));
    }
  }
}
