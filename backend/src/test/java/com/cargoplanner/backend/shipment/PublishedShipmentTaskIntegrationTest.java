package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ApiExceptionHandler;
import com.cargoplanner.backend.customer.BusinessCustomerService;
import com.cargoplanner.backend.customer.CustomerShipmentBindingRequest;
import com.cargoplanner.backend.shipment.TrackingAdapterClient.NormalizedTrackRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.TransientDataAccessResourceException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;

public class PublishedShipmentTaskIntegrationTest {
  private static final ObjectMapper MIGRATION_JSON = new ObjectMapper();
  private static final AuthenticatedUser OWNER =
      new AuthenticatedUser(1, "owner", "Owner", "BUSINESS", "ACTIVE");
  private static final AuthenticatedUser OTHER =
      new AuthenticatedUser(2, "other", "Other", "BUSINESS", "ACTIVE");
  private static final AuthenticatedUser ADMIN =
      new AuthenticatedUser(3, "admin", "Admin", "ADMIN", "ACTIVE");
  private static final String TASK_ROUTE = "/api/business/shipment-batch-tasks";
  private static final String NUMBER = "BK-10001";

  private final ObjectMapper json = new ObjectMapper();
  private final TestClock clock = new TestClock();
  private final ShipmentTrackingProperties properties = new ShipmentTrackingProperties();
  private final ShipmentTrackingService tracking = mock(ShipmentTrackingService.class);
  private final BusinessCustomerService customers = mock(BusinessCustomerService.class);
  private final List<String> sentKeys = new ArrayList<>();
  private final Map<String, DesktopJob> jobs = new LinkedHashMap<>();
  private final AtomicBoolean rejectBusinessWrite = new AtomicBoolean(false);
  private final AtomicBoolean offline = new AtomicBoolean(false);
  private final AtomicBoolean loseAcceptance = new AtomicBoolean(false);
  private volatile String queryResult = "QUERY_COMPLETED";
  private volatile int resultReads;
  private volatile int cancellationCalls;
  private HttpServer server;
  private JdbcTemplate jdbc;
  private DataSourceTransactionManager transactionManager;
  private ShipmentBatchTrackingService legacy;
  private PublishedShipmentTaskWorker worker;
  private PublishedShipmentTaskService service;
  private ShipmentBatchTrackingController controller;

  @BeforeEach
  void setUp() throws IOException {
    DriverManagerDataSource dataSource = createV6Database();
    migrateSummaryColumns(dataSource);
    migrateDeletion(dataSource);
    migrateTaskName(dataSource);
    jdbc = new JdbcTemplate(dataSource);
    jdbc.execute("CREATE TABLE test_saved_shipments (id VARCHAR(64) PRIMARY KEY)");
    jdbc.execute("""
        CREATE TABLE test_saved_customer_bindings (customer_id VARCHAR(64), shipment_id VARCHAR(64),
          PRIMARY KEY (customer_id, shipment_id))
        """);
    transactionManager = new DataSourceTransactionManager(dataSource);
    when(tracking.usesLocalTrackingQueue()).thenReturn(true);
    when(tracking.validatePublishedRequest(any(), any(), anyBoolean())).thenAnswer(call -> {
      ShipmentTrackRequest request = call.getArgument(0);
      return new NormalizedTrackRequest(request.carrier(), request.channel(), request.type(),
          request.number(), request.batchTaskId());
    });
    when(tracking.persistPublishedResult(any(), any(), any())).thenAnswer(call -> {
      jdbc.update("INSERT INTO test_saved_shipments VALUES ('shipment-1')");
      return json.createObjectNode().put("shipmentId", "shipment-1");
    });
    when(customers.bindShipment(anyString(), any(), any(), anyString())).thenAnswer(call -> {
      if (rejectBusinessWrite.getAndSet(false)) throw new TransientDataAccessResourceException("Test outage");
      CustomerShipmentBindingRequest binding = call.getArgument(1);
      jdbc.update("INSERT INTO test_saved_customer_bindings VALUES (?, ?)",
          call.getArgument(0, String.class), binding.shipmentId());
      return Map.of();
    });
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/jobs", this::serve);
    server.start();
    properties.setAdapterMode(ShipmentTrackingProperties.AdapterMode.LOCAL_QUEUE);
    properties.setLocalBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
    properties.setLocalPollInterval(Duration.ofMillis(10));
    legacy = new ShipmentBatchTrackingService(tracking, java.util.concurrent.Executors.newSingleThreadExecutor(),
        0L, 0L, clock);
    restartWorker();
  }

  private DriverManagerDataSource createV6Database() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
    JdbcTemplate jdbc = new JdbcTemplate(dataSource);
    jdbc.execute("""
        CREATE TABLE cp_users (id BIGINT PRIMARY KEY, username VARCHAR(40), display_name VARCHAR(80),
          role VARCHAR(20), status VARCHAR(20), party_role VARCHAR(20))
        """);
    for (AuthenticatedUser user : List.of(OWNER, OTHER)) {
      jdbc.update("INSERT INTO cp_users VALUES (?, ?, ?, ?, ?, ?)", user.id(), user.username(),
          user.displayName(), user.role(), user.status(), user.partyRole());
    }
    new ResourceDatabasePopulator(new ClassPathResource("db/migration/V6__published_shipment_tracking_tasks.sql"))
        .execute(dataSource);
    return dataSource;
  }

  private void migrateSummaryColumns(DriverManagerDataSource dataSource) {
    JdbcTemplate jdbc = new JdbcTemplate(dataSource);
    String functions = PublishedShipmentTaskIntegrationTest.class.getName();
    // H2 lacks the MySQL JSON projection functions used by the one-time backfill.
    jdbc.execute("CREATE ALIAS JSON_VALUE FOR '" + functions + ".mysqlJsonValue'");
    jdbc.execute("CREATE ALIAS JSON_LENGTH FOR '" + functions + ".mysqlJsonLength'");
    new ResourceDatabasePopulator(new ClassPathResource("db/migration/V7__shipment_task_management_summary.sql"))
        .execute(dataSource);
  }

  private void migrateDeletion(DriverManagerDataSource dataSource) {
    new ResourceDatabasePopulator(new ClassPathResource("db/migration/V8__shipment_task_deletion.sql"))
        .execute(dataSource);
  }

  private void migrateTaskName(DriverManagerDataSource dataSource) {
    new ResourceDatabasePopulator(new ClassPathResource("db/migration/V9__shipment_task_name.sql"))
        .execute(dataSource);
  }

  public static String mysqlJsonValue(String document, String path) throws IOException {
    return MIGRATION_JSON.readTree(document).path(path.substring(2)).asText(null);
  }

  public static Integer mysqlJsonLength(String document, String path) throws IOException {
    JsonNode value = MIGRATION_JSON.readTree(document).path(path.substring(2));
    return value.isMissingNode() ? null : value.size();
  }

  @AfterEach
  void tearDown() {
    worker.shutdown();
    legacy.shutdown();
    server.stop(0);
  }

  @Test
  void savesInvalidDraftBeforeReviewAndPublishesExactlyOneFrozenRevisionForItsOwner() {
    ShipmentBatchItemRequest uncertain = new ShipmentBatchItemRequest("row-1", null, null, null,
        null, false, null, "UNRECOGNIZED", "Review the carrier", 3, "original");
    Map<String, Object> draft = controller.createDraft(draft(uncertain, null, "IMPORT"), OWNER).getBody();
    String id = (String) draft.get("taskId");
    assertThat(draft).containsEntry("status", "DRAFT").containsEntry("revision", 1);
    assertThat(draft.get("validationErrors").toString()).contains("UNRECOGNIZED");
    assertThat(draft.get("sourceRows").toString()).contains("original");
    assertThat(controller.list(20, OWNER)).hasSize(1);
    assertThat(controller.list(20, OTHER)).isEmpty();
    assertThatThrownBy(() -> controller.status(id, OTHER))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.FORBIDDEN));
    assertThatThrownBy(() -> service.publish(id, 1, OWNER))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("DRAFT_VALIDATION_FAILED"));
    worker.runDue();
    assertThat(sentKeys).isEmpty();

    assertThat(controller.updateDraft(id, draft(item(), 1, "IMPORT"), OWNER)).containsEntry("revision", 2);
    assertThatThrownBy(() -> service.publish(id, 1, OWNER))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.CONFLICT));
    assertThat(service.publish(id, 2, OWNER)).containsEntry("status", "QUEUED");
    assertThat(service.publish(id, 2, OWNER)).containsEntry("taskId", id);
    assertThatThrownBy(() -> service.update(id, draft(item(), 2, "IMPORT"), OWNER))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("DRAFT_FROZEN"));
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_shipment_batch_items", Integer.class)).isEqualTo(1);
    worker.runDue();
    assertThat(sentKeys).hasSize(1);
  }

  @Test
  void createsAndRenamesDraftsIndependentlyOfTheirSourceFileAndFreezesTheNameOnPublish() throws Exception {
    var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
    String sourceFileName = "source.2026.xlsx";
    ObjectNode input = json.valueToTree(draft(item(), null, "IMPORT"));
    input.put("sourceFileName", sourceFileName).put("taskName", "  First name  ");
    String created = mvc.perform(post(TASK_ROUTE + "/drafts").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(input)).requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, OWNER))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.taskName").value("First name"))
        .andExpect(jsonPath("$.sourceFileName").value(sourceFileName))
        .andReturn().getResponse().getContentAsString();
    String id = json.readTree(created).path("taskId").asText();
    String route = TASK_ROUTE + "/" + id + "/draft";
    String newName = "A".repeat(120);

    input.put("expectedRevision", 1).put("taskName", newName + "A");
    mvc.perform(patch(route).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(input))
            .requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, OWNER))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_TASK_NAME"));

    input.put("taskName", " " + newName + " ");
    mvc.perform(patch(route).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(input))
            .requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, OWNER))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.revision").value(2))
        .andExpect(jsonPath("$.taskName").value(newName))
        .andExpect(jsonPath("$.sourceFileName").value(sourceFileName));
    restartWorker();
    assertThat(service.status(id, OWNER)).containsEntry("taskName", newName)
        .containsEntry("sourceFileName", sourceFileName);
    assertThat(service.publish(id, 2, OWNER)).containsEntry("taskName", newName)
        .containsEntry("sourceFileName", sourceFileName);
    input.put("expectedRevision", 2).put("taskName", "Late rename");
    mvc.perform(patch(route).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(input))
            .requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, OWNER))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("DRAFT_FROZEN"));
    assertThat(service.management(OWNER, 20)).singleElement().satisfies(task -> assertThat(task)
        .containsEntry("taskName", newName).containsEntry("sourceFileName", sourceFileName));
  }

  @Test
  void blankNamesDeriveFromTheFullFileStem() {
    String fileStem = "A".repeat(121) + ".2026";
    String sourceFileName = fileStem + ".xlsx";
    var input = new ShipmentBatchDraftRequest(sourceFileName, "Custom name", "AUTO", List.of(item()),
        null, false, "QUERY_ONLY", null, null);
    String id = (String) service.create(input, OWNER).get("taskId");

    var cleared = new ShipmentBatchDraftRequest(sourceFileName, " \t ", "AUTO", List.of(item()),
        null, false, "QUERY_ONLY", null, 1);
    assertThat(service.update(id, cleared, OWNER)).containsEntry("taskName", fileStem)
        .containsEntry("sourceFileName", sourceFileName);
    assertThat(service.management(OWNER, 20)).singleElement().satisfies(task -> assertThat(task)
        .containsEntry("taskName", fileStem).containsEntry("sourceFileName", sourceFileName));
  }

  @Test
  void managementListsOnlyOwnedSummariesWithoutReadingDraftOrItemPayloads() throws Exception {
    String draftId = (String) service.create(draft(item(), null, "IMPORT"), OWNER).get("taskId");
    List<ShipmentBatchItemRequest> rows = java.util.stream.IntStream.range(0, 8)
        .mapToObj(row -> new ShipmentBatchItemRequest("row-" + row, "COSCO", "BOOKING",
            "BK-2000" + row, null, false, null)).toList();
    service.update(draftId, new ShipmentBatchDraftRequest("review.xlsx", "Review draft", "PROXY", rows.subList(0, 2),
        "updated-customer", true, "IMPORT", null, 1), OWNER);
    clock.advance(1);
    ShipmentBatchDraftRequest input = new ShipmentBatchDraftRequest("published.xlsx", null, "AUTO", rows,
        null, false, "QUERY_ONLY", null, null);
    String publishedId = (String) service.create(input, OWNER).get("taskId");
    service.publish(publishedId, 1, OWNER);
    String otherId = (String) service.create(draft(item(), null, "IMPORT"), OTHER).get("taskId");

    List<String> states = List.of("SUCCEEDED", "FAILED", "MANUAL", "CANCELLED",
        "PENDING", "RUNNING", "WAITING", "PERSISTING");
    for (int row = 0; row < states.size(); row++) {
      jdbc.update("""
          UPDATE cp_shipment_batch_items
          SET status = ?, item_json = 'private item', result_json = 'private result', payload_json = 'private payload'
          WHERE task_id = ? AND row_no = ?
          """, states.get(row), publishedId, row);
    }
    jdbc.update("UPDATE cp_shipment_batch_tasks SET draft_json = 'private draft' WHERE owner_id = ?", OWNER.id());

    var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
    String route = "/api/business/shipment-batch-tasks/management";
    var response = mvc.perform(get(route).requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, OWNER))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(2))
        .andExpect(jsonPath("$[0].taskId").value(publishedId))
        .andExpect(jsonPath("$[0].taskName").value("published"))
        .andExpect(jsonPath("$[0].total").value(8))
        .andExpect(jsonPath("$[0].pending").value(4))
        .andExpect(jsonPath("$[0].running").value(1))
        .andExpect(jsonPath("$[0].waiting").value(1))
        .andExpect(jsonPath("$[0].persisting").value(1))
        .andExpect(jsonPath("$[0].succeeded").value(1))
        .andExpect(jsonPath("$[0].failed").value(1))
        .andExpect(jsonPath("$[0].manual").value(1))
        .andExpect(jsonPath("$[0].cancelled").value(1))
        .andExpect(jsonPath("$[1].taskId").value(draftId))
        .andExpect(jsonPath("$[1].revision").value(2))
        .andExpect(jsonPath("$[1].total").value(2))
        .andExpect(jsonPath("$[1].taskName").value("Review draft"))
        .andExpect(jsonPath("$[1].sourceFileName").value("review.xlsx"))
        .andExpect(jsonPath("$[1].customerId").value("updated-customer"))
        .andExpect(jsonPath("$[1].channel").value("PROXY"))
        .andExpect(jsonPath("$[1].publishToCustomer").value(true))
        .andReturn().getResponse().getContentAsString();
    assertThat(response).doesNotContain(otherId, "private ", "items", "sourceRows", "payload", "result_json");
    mvc.perform(get(route).param("limit", "1").requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, OWNER))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].taskId").value(publishedId));
    mvc.perform(get(route).requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, OTHER))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].taskId").value(otherId));
    AuthenticatedUser agent = new AuthenticatedUser(3, "agent", "Agent", "OVERSEA_AGENT", "ACTIVE");
    mvc.perform(get(route).requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, agent))
        .andExpect(status().isForbidden());
    assertThat(sentKeys).isEmpty();
  }

  @Test
  void managementMigrationBackfillsExistingDraftMetadata() throws Exception {
    DriverManagerDataSource dataSource = createV6Database();
    JdbcTemplate oldJdbc = new JdbcTemplate(dataSource);
    var existing = new ShipmentBatchDraftRequest("legacy.xlsx", null, "PROXY", List.of(item()), "old-customer",
        true, "IMPORT", null, null);
    ObjectNode legacyDraft = json.valueToTree(existing);
    legacyDraft.remove("taskName");
    var now = java.sql.Timestamp.from(clock.instant());
    oldJdbc.update("""
        INSERT INTO cp_shipment_batch_tasks
          (task_id, owner_id, status, revision, draft_json, created_at, updated_at)
        VALUES (?, ?, 'DRAFT', 4, ?, ?, ?)
        """, "published_legacy", OWNER.id(), json.writeValueAsString(legacyDraft), now, now);

    migrateSummaryColumns(dataSource);
    migrateDeletion(dataSource);
    migrateTaskName(dataSource);

    var legacyRepository = new PublishedShipmentTaskRepository(oldJdbc, json);
    var overviews = legacyRepository.listOverviews(OWNER.id(), 20);
    assertThat(overviews).singleElement().satisfies(task -> {
      assertThat(task.sourceFileName()).isEqualTo("legacy.xlsx");
      assertThat(task.revision()).isEqualTo(4);
      assertThat(task.draftItemCount()).isEqualTo(1);
      assertThat(task.customerId()).isEqualTo("old-customer");
      assertThat(task.publishToCustomer()).isTrue();
      assertThat(task.channel()).isEqualTo("PROXY");
      assertThat(task.mode()).isEqualTo("IMPORT");
    });
    var legacyService = new PublishedShipmentTaskService(legacyRepository, legacy, tracking, customers,
        new DataSourceTransactionManager(dataSource), clock);
    assertThat(legacyService.status("published_legacy", OWNER)).containsEntry("taskName", "legacy");
    assertThat(legacyService.management(OWNER, 20)).singleElement().satisfies(task -> assertThat(task)
        .containsEntry("taskName", "legacy").containsEntry("sourceFileName", "legacy.xlsx"));
  }

  @Test
  void deletesOnlyWithManagerAccessAndHidesTheTaskFromEveryReadRoute() throws Exception {
    String id = (String) service.create(draft(item(), null, "IMPORT"), OWNER).get("taskId");
    service.update(id, draft(item(), 1, "IMPORT"), OWNER);
    var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
    String taskRoute = TASK_ROUTE + "/" + id;
    AuthenticatedUser nonManager = new AuthenticatedUser(OWNER.id(), "owner", "Owner", "OVERSEA_AGENT", "ACTIVE");

    mvc.perform(delete(taskRoute).requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, nonManager))
        .andExpect(status().isForbidden());
    mvc.perform(delete(taskRoute).requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, OTHER))
        .andExpect(status().isForbidden());
    mvc.perform(delete(taskRoute).param("expectedRevision", "1")
            .requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, OWNER))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("DRAFT_REVISION_CONFLICT"));
    assertThat(service.management(OWNER, 20)).singleElement().satisfies(task -> assertThat(task)
        .containsEntry("taskId", id).containsEntry("revision", 2));

    mvc.perform(delete(taskRoute).param("expectedRevision", "2")
            .requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, ADMIN))
        .andExpect(status().isNoContent());
    for (String route : List.of(TASK_ROUTE, TASK_ROUTE + "/management")) {
      mvc.perform(get(route).requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, OWNER))
          .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }
    mvc.perform(get(taskRoute).requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, OWNER))
        .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("TASK_NOT_FOUND"));
    mvc.perform(delete(taskRoute).requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, OTHER))
        .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("TASK_NOT_FOUND"));
    assertThat(jdbc.queryForObject("SELECT draft_json FROM cp_shipment_batch_tasks WHERE task_id = ?",
        String.class, id)).contains("sample.xlsx", "original");
  }

  @Test
  void rejectsDeletionWhileTrackingIsActiveOrAnItemHasNotSettled() {
    String id = publish("IMPORT");
    assertActiveTaskCannotBeDeleted(id, "QUEUED");

    jdbc.update("UPDATE cp_shipment_batch_tasks SET status = 'COMPLETED' WHERE task_id = ?", id);
    assertActiveTaskCannotBeDeleted(id, "COMPLETED");
    jdbc.update("UPDATE cp_shipment_batch_tasks SET status = 'QUEUED' WHERE task_id = ?", id);

    offline.set(true);
    worker.runDue();
    assertActiveTaskCannotBeDeleted(id, "WAITING");
    offline.set(false);
    clock.advance(6);
    worker.runDue();
    assertActiveTaskCannotBeDeleted(id, "RUNNING");
    assertThat(service.cancel(id, OWNER)).containsEntry("status", "STOPPING");
    assertActiveTaskCannotBeDeleted(id, "STOPPING");
    worker.runDue();
    assertThat(service.status(id, OWNER)).containsEntry("status", "STOPPED");
    service.delete(id, null, OWNER);
    worker.runDue();
    assertThat(cancellationCalls).isEqualTo(1);
    assertThat(service.management(OWNER, 20)).isEmpty();
  }

  @Test
  void deletingCompletedTasksPreservesShipmentsBindingsAndTrackingResults() {
    queryResult = "JOB_FAILED";
    String importId = publish("IMPORT");
    worker.runDue();
    clock.advance(1);
    worker.runDue();

    queryResult = "QUERY_COMPLETED";
    service.retry(importId, List.of(0), OWNER);
    worker.runDue();
    clock.advance(1);
    worker.runDue();
    worker.runDue();
    assertThat(service.status(importId, OWNER)).containsEntry("status", "COMPLETED");
    service.delete(importId, null, OWNER);
    assertThat(savedShipments()).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT shipment_id FROM test_saved_customer_bindings WHERE customer_id = ?",
        String.class, "customer-1")).isEqualTo("shipment-1");
    assertThat(jdbc.queryForObject("SELECT result_json FROM cp_shipment_batch_items WHERE task_id = ?",
        String.class, importId)).contains("tracking.v1", "job_2");
    assertThat(jdbc.queryForObject("SELECT local_job_id FROM cp_shipment_batch_item_attempts WHERE task_id = ?",
        String.class, importId)).isEqualTo("job_1");

    String queryId = publish("QUERY_ONLY");
    worker.runDue();
    clock.advance(1);
    worker.runDue();
    worker.runDue();
    service.delete(queryId, null, OWNER);
    assertThat(jdbc.queryForObject("SELECT payload_json FROM cp_shipment_batch_items WHERE task_id = ?",
        String.class, queryId)).contains("SINGLE_RESPONSE", "job_3");
    assertThat(service.management(OWNER, 20)).isEmpty();
    assertThat(cancellationCalls).isZero();
  }

  @Test
  void concurrentPublicationAndRetryCannotBringBackADeletedTask() {
    String draftId = (String) service.create(draft(item(), null, "QUERY_ONLY"), OWNER).get("taskId");
    deleteDuringMutation(draftId, () -> service.publish(draftId, 1, OWNER));
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_shipment_batch_items WHERE task_id = ?",
        Integer.class, draftId)).isZero();

    queryResult = "JOB_FAILED";
    String failedId = publish("QUERY_ONLY");
    worker.runDue();
    clock.advance(1);
    worker.runDue();
    deleteDuringMutation(failedId, () -> service.retry(failedId, List.of(0), OWNER));
    worker.runDue();
    assertThat(sentKeys).containsExactly(failedId + ":row:0:run:1");
    assertThat(jdbc.queryForObject("SELECT status FROM cp_shipment_batch_items WHERE task_id = ?",
        String.class, failedId)).isEqualTo("FAILED");
    assertThat(service.management(OWNER, 20)).isEmpty();
  }

  private void assertActiveTaskCannotBeDeleted(String id, String status) {
    assertThat(service.status(id, OWNER)).containsEntry("status", status);
    assertThatThrownBy(() -> service.delete(id, null, OWNER)).isInstanceOfSatisfying(ApiException.class, error -> {
      assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT);
      assertThat(error.code()).isEqualTo("TASK_ACTIVE");
    });
  }

  private void deleteDuringMutation(String taskId, Runnable mutation) {
    var repository = new PublishedShipmentTaskRepository(jdbc, json);
    CompletableFuture<Void> competing = new TransactionTemplate(transactionManager).execute(transaction -> {
      assertThat(repository.findTask(taskId, true)).isNotNull();
      CompletableFuture<Void> started = new CompletableFuture<>();
      CompletableFuture<Void> request = CompletableFuture.runAsync(() -> {
        started.complete(null);
        mutation.run();
      });
      started.orTimeout(5, TimeUnit.SECONDS).join();
      service.delete(taskId, null, OWNER);
      return request;
    });
    assertThatThrownBy(() -> competing.get(5, TimeUnit.SECONDS)).cause()
        .isInstanceOfSatisfying(ApiException.class, error -> {
          assertThat(error.status()).isEqualTo(HttpStatus.NOT_FOUND);
          assertThat(error.code()).isEqualTo("TASK_NOT_FOUND");
        });
  }

  @Test
  void reconnectsAndReusesLostAcceptanceThenRetriesOnlyTheDatabaseWriteAfterRestart() {
    String id = publish("IMPORT");
    offline.set(true);
    worker.runDue();
    assertThat(service.status(id, OWNER)).containsEntry("status", "WAITING");
    assertThat(jobs).isEmpty();

    offline.set(false);
    loseAcceptance.set(true);
    clock.advance(6);
    worker.runDue();
    assertThat(service.status(id, OWNER)).containsEntry("status", "WAITING");
    assertThat(jobs).hasSize(1);

    restartWorker();
    clock.advance(11);
    worker.runDue();
    assertThat(itemStatus(id)).containsEntry("localJobId", "job_1").containsEntry("status", "RUNNING");
    assertThat(sentKeys).hasSize(3).containsOnly(id + ":row:0:run:1");
    assertThat(jobs).hasSize(1);
    clock.advance(1);
    worker.runDue();
    assertThat(itemStatus(id)).containsEntry("status", "PERSISTING");
    assertThat(resultReads).isEqualTo(1);

    restartWorker();
    rejectBusinessWrite.set(true);
    worker.runDue();
    assertThat(itemStatus(id)).containsEntry("status", "PERSISTING")
        .containsEntry("errorCode", "RESULT_PERSISTENCE_RETRY");
    assertThat(savedShipments()).isZero();
    assertThat(jdbc.queryForObject("SELECT result_json FROM cp_shipment_batch_items", String.class))
        .contains("tracking.v1", "job_1");

    clock.advance(6);
    worker.runDue();
    assertThat(service.status(id, OWNER)).containsEntry("status", "COMPLETED");
    assertThat(itemStatus(id)).containsEntry("status", "SUCCEEDED").containsEntry("shipmentId", "shipment-1");
    assertThat(savedShipments()).isEqualTo(1);
    assertThat(resultReads).isEqualTo(1);
    assertThat(cancellationCalls).isZero();
    assertThat(sentKeys).hasSize(3);
  }

  @Test
  void resumesAnAcceptedJobAfterAnAbandonedLeaseExpires() {
    String id = publish("QUERY_ONLY");
    worker.runDue();
    clock.advance(1);
    jdbc.update("UPDATE cp_shipment_batch_items SET lease_token = ?, lease_until = ? WHERE task_id = ?",
        "abandoned", java.sql.Timestamp.from(clock.instant().plusSeconds(60)), id);

    restartWorker();
    worker.runDue();
    assertThat(resultReads).isZero();
    assertThat(itemStatus(id)).containsEntry("localJobId", "job_1");

    clock.advance(61);
    worker.runDue();
    worker.runDue();
    assertThat(itemStatus(id)).containsEntry("status", "SUCCEEDED");
    assertThat(sentKeys).containsExactly(id + ":row:0:run:1");
    assertThat(resultReads).isEqualTo(1);
  }

  @Test
  void skipsDispatchIfTheOwnerLosesPermissionAfterPublication() {
    String id = publish("IMPORT");
    jdbc.update("UPDATE cp_users SET status = 'DISABLED' WHERE id = ?", OWNER.id());

    worker.runDue();

    assertThat(service.status(id, OWNER)).containsEntry("status", "COMPLETED").containsEntry("failed", 1);
    assertThat(itemStatus(id)).containsEntry("errorCode", "TASK_OWNER_INACTIVE");
    assertThat(sentKeys).isEmpty();
  }

  @Test
  void reconcilesAndCancelsAnAcceptedJobWhoseResponseWasLost() {
    String id = publish("IMPORT");
    loseAcceptance.set(true);
    worker.runDue();
    assertThat(service.cancel(id, OWNER)).containsEntry("status", "STOPPING");
    restartWorker();
    worker.runDue();
    assertThat(service.status(id, OWNER)).containsEntry("status", "STOPPED");
    assertThat(itemStatus(id)).containsEntry("status", "CANCELLED");
    assertThat(cancellationCalls).isEqualTo(1);
    assertThat(sentKeys).hasSize(1);
    assertThat(savedShipments()).isZero();
  }

  @Test
  void terminalDesktopFailureWithoutResultCanBeRetriedWithANewExecutionKey() {
    queryResult = "JOB_FAILED";
    String id = publish("QUERY_ONLY");
    worker.runDue();
    clock.advance(1);
    worker.runDue();

    assertThat(service.status(id, OWNER)).containsEntry("status", "COMPLETED").containsEntry("failed", 1);
    assertThat(itemStatus(id)).containsEntry("status", "FAILED")
        .containsEntry("errorCode", "TRACKING_LOCAL_JOB_FAILED");
    assertThat(resultReads).isEqualTo(1);

    queryResult = "QUERY_COMPLETED";
    service.retry(id, List.of(0), OWNER);
    worker.runDue();
    clock.advance(1);
    worker.runDue();
    worker.runDue();

    assertThat(itemStatus(id)).containsEntry("status", "SUCCEEDED").containsEntry("localJobId", "job_2");
    assertThat(sentKeys).containsExactly(id + ":row:0:run:1", id + ":row:0:run:2");
  }

  @Test
  void manualVerificationFailureStaysTerminalUntilExplicitRetryCreatesANewAttempt() {
    queryResult = "HUMAN_REQUIRED";
    String id = publish("QUERY_ONLY");
    worker.runDue();
    clock.advance(1);
    worker.runDue();
    assertThat(service.status(id, OWNER)).containsEntry("status", "COMPLETED").containsEntry("failed", 1);
    assertThat(itemStatus(id)).containsEntry("status", "FAILED")
        .containsEntry("errorCode", "TRACKING_HUMAN_REQUIRED");
    clock.advance(120);
    worker.runDue();
    assertThat(sentKeys).hasSize(1);

    queryResult = "QUERY_COMPLETED";
    service.retry(id, List.of(0), OWNER);
    worker.runDue();
    clock.advance(1);
    worker.runDue();
    worker.runDue();
    assertThat(itemStatus(id)).containsEntry("status", "SUCCEEDED").containsEntry("attempts", 2);
    assertThat(itemStatus(id).get("payload").toString()).contains("SINGLE_RESPONSE", "job_2");
    assertThat(sentKeys).containsExactly(id + ":row:0:run:1", id + ":row:0:run:2");
    assertThat(jdbc.queryForObject("SELECT error_code FROM cp_shipment_batch_item_attempts", String.class))
        .isEqualTo("TRACKING_HUMAN_REQUIRED");
    assertThat(savedShipments()).isZero();
  }

  private ShipmentBatchDraftRequest draft(ShipmentBatchItemRequest item, Integer revision, String mode) {
    return new ShipmentBatchDraftRequest("sample.xlsx", null, "AUTO", List.of(item), "customer-1", false, mode,
        json.valueToTree(List.of(Map.of("row", 3, "reference", "original"))), revision);
  }

  private ShipmentBatchItemRequest item() {
    return new ShipmentBatchItemRequest("row-1", "COSCO", "BOOKING", NUMBER, NUMBER,
        false, null, null, null, 3, "original");
  }

  private String publish(String mode) {
    String id = (String) service.create(draft(item(), null, mode), OWNER).get("taskId");
    service.publish(id, 1, OWNER);
    return id;
  }

  private void restartWorker() {
    if (worker != null) worker.shutdown();
    PublishedShipmentTaskRepository repository = new PublishedShipmentTaskRepository(jdbc, json);
    service = new PublishedShipmentTaskService(repository, legacy, tracking, customers, transactionManager, clock);
    worker = new PublishedShipmentTaskWorker(repository, service, tracking, new TrackingAdapterClient(properties),
        customers, transactionManager, properties, clock, Duration.ZERO);
    controller = new ShipmentBatchTrackingController(legacy, service);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> itemStatus(String id) {
    return ((List<Map<String, Object>>) service.status(id, OWNER).get("items")).get(0);
  }

  private int savedShipments() {
    return jdbc.queryForObject("SELECT COUNT(*) FROM test_saved_shipments", Integer.class);
  }

  private synchronized void serve(HttpExchange exchange) throws IOException {
    String path = exchange.getRequestURI().getPath();
    if ("POST".equals(exchange.getRequestMethod()) && "/jobs".equals(path)) {
      String key = exchange.getRequestHeaders().getFirst("Idempotency-Key");
      JsonNode request = json.readTree(exchange.getRequestBody());
      sentKeys.add(key);
      if (offline.get()) {
        send(exchange, 503, Map.of("error", "OFFLINE"));
        return;
      }
      DesktopJob job = jobs.computeIfAbsent(key, ignored ->
          new DesktopJob("job_" + (jobs.size() + 1), request.path("source").asText()));
      send(exchange, loseAcceptance.getAndSet(false) ? 503 : 202, Map.of("job_id", job.id()));
      return;
    }
    if ("/jobs".equals(path)) {
      send(exchange, 200, Map.of("jobs", jobs.values().stream()
          .map(job -> Map.of("id", job.id(), "source", job.source())).toList()));
      return;
    }
    DesktopJob job = jobs.values().stream().filter(value -> path.startsWith("/jobs/" + value.id()))
        .findFirst().orElseThrow();
    if (path.endsWith("/cancel")) {
      cancellationCalls++;
      send(exchange, 200, Map.of("id", job.id(), "status", "cancelled"));
    } else if (path.endsWith("/result")) {
      resultReads++;
      if ("JOB_FAILED".equals(queryResult)) {
        send(exchange, 503, Map.of("error", "MISSING_RESULT"));
        return;
      }
      send(exchange, 200, Map.of(
          "schema", "tracking.v1", "generated_at", "2026-11-04T04:00:00Z", "batch", Map.of("id", job.id()),
          "shipments", List.of(Map.of("schema", "tracking.v1", "carrier", Map.of("code", "COSCO"),
              "query", Map.of("reference_input", NUMBER, "status", queryResult),
              "shipment", Map.of("booking", NUMBER, "status", Map.of("latest_event", "Loaded"))))));
    } else {
      String jobStatus = "completed";
      String itemStatus = "done";
      if ("JOB_FAILED".equals(queryResult)) {
        jobStatus = "failed";
        itemStatus = "cancelled";
      } else if (!"QUERY_COMPLETED".equals(queryResult)) {
        jobStatus = "completed_with_gaps";
        itemStatus = queryResult.toLowerCase(java.util.Locale.ROOT);
      }
      send(exchange, 200, Map.of("id", job.id(), "status", jobStatus,
          "items", List.of(Map.of("carrier", "COSCO", "reference", NUMBER, "status", itemStatus))));
    }
  }

  private void send(HttpExchange exchange, int status, Map<String, ?> body) throws IOException {
    byte[] bytes = json.writeValueAsBytes(body);
    exchange.sendResponseHeaders(status, bytes.length);
    try (var output = exchange.getResponseBody()) {
      output.write(bytes);
    }
  }

  private record DesktopJob(String id, String source) {}

  private static final class TestClock extends Clock {
    private Instant time = Instant.parse("2026-11-04T04:00:00Z");
    void advance(long seconds) { time = time.plusSeconds(seconds); }
    @Override public Instant instant() { return time; }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return Clock.fixed(time, zone); }
  }
}
