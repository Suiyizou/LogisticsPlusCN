package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.BusinessCustomerService;
import com.cargoplanner.backend.shipment.PublishedShipmentTaskRepository.Item;
import com.cargoplanner.backend.shipment.PublishedShipmentTaskRepository.Overview;
import com.cargoplanner.backend.shipment.PublishedShipmentTaskRepository.Task;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
class PublishedShipmentTaskService {
  private static final String PREFIX = "published_";
  private static final Set<String> NEW_QUERY_RETRY_CODES = Set.of(
      "TRACKING_HUMAN_REQUIRED", "TRACKING_NO_BUSINESS_DATA", "TRACKING_QUERY_FAILED",
      "TRACKING_LOCAL_JOB_FAILED", "TRACKING_CANCELLED", "UPSTREAM_EMPTY", "UNSUPPORTED_CARRIER"
  );

  private final PublishedShipmentTaskRepository repository;
  private final ShipmentBatchTrackingService batch;
  private final ShipmentTrackingService tracking;
  private final BusinessCustomerService customers;
  private final TransactionTemplate transactions;
  private final Clock clock;

  @Autowired
  PublishedShipmentTaskService(PublishedShipmentTaskRepository repository,
      ShipmentBatchTrackingService batch, ShipmentTrackingService tracking,
      BusinessCustomerService customers, PlatformTransactionManager transactionManager) {
    this(repository, batch, tracking, customers, transactionManager, Clock.systemUTC());
  }

  PublishedShipmentTaskService(PublishedShipmentTaskRepository repository,
      ShipmentBatchTrackingService batch, ShipmentTrackingService tracking,
      BusinessCustomerService customers, PlatformTransactionManager transactionManager, Clock clock) {
    this.repository = repository;
    this.batch = batch;
    this.tracking = tracking;
    this.customers = customers;
    this.transactions = new TransactionTemplate(transactionManager);
    this.clock = clock;
  }

  static boolean isPublishedTaskId(String id) {
    return id != null && id.startsWith(PREFIX);
  }

  Map<String, Object> create(ShipmentBatchDraftRequest input, AuthenticatedUser user) {
    requireManager(user);
    ShipmentBatchDraftRequest draft = normalizeDraft(input);
    String id = PREFIX + UUID.randomUUID().toString().replace("-", "");
    repository.insertDraft(id, user.id(), draft, clock.instant());
    return status(id, user);
  }

  Map<String, Object> update(String id, ShipmentBatchDraftRequest input, AuthenticatedUser user) {
    requireManager(user);
    ShipmentBatchDraftRequest draft = normalizeDraft(input);
    transactions.executeWithoutResult(transaction -> {
      Task task = owned(id, user, true);
      requireRevision(task, input.expectedRevision());
      if (!"DRAFT".equals(task.status())) {
        throw new ApiException(HttpStatus.CONFLICT, "DRAFT_FROZEN", "The shipment draft can no longer be edited");
      }
      repository.updateDraft(task, draft, clock.instant());
    });
    return status(id, user);
  }

  Map<String, Object> publish(String id, Integer revision, AuthenticatedUser user) {
    requireManager(user);
    transactions.executeWithoutResult(transaction -> {
      Task task = owned(id, user, true);
      requireRevision(task, revision);
      if (task.published() != null) return;
      if (!"DRAFT".equals(task.status())) {
        throw new ApiException(HttpStatus.CONFLICT, "DRAFT_CLOSED", "The shipment draft is closed");
      }
      AuthenticatedUser owner = executionOwner(task);
      Review review = review(task.draft(), owner, true);
      if (!review.errors().isEmpty()) {
        throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "DRAFT_VALIDATION_FAILED",
            "Resolve or exclude the flagged shipment rows before publishing", null,
            Map.of("validationErrors", review.errors()));
      }
      repository.publish(task, review.items(), clock.instant());
    });
    return status(id, user);
  }

  Map<String, Object> cancel(String id, AuthenticatedUser user) {
    requireManager(user);
    transactions.executeWithoutResult(transaction -> {
      Task task = owned(id, user, true);
      if (task.finished() != null || task.cancelled()) return;
      Instant now = clock.instant();
      repository.cancel(task, now);
      repository.refreshTaskProgress(task.id(), now);
    });
    return status(id, user);
  }

  Map<String, Object> retry(String id, List<Integer> rowNumbers, AuthenticatedUser user) {
    requireManager(user);
    transactions.executeWithoutResult(transaction -> {
      Task task = owned(id, user, true);
      if (!"COMPLETED".equals(task.status())) {
        throw new ApiException(HttpStatus.CONFLICT, "TASK_NOT_COMPLETED", "Wait for this shipment task to finish");
      }
      executionOwner(task);
      Set<Integer> requested = rowNumbers == null ? Set.of() : new HashSet<>(rowNumbers);
      List<Item> failed = repository.listItems(id).stream()
          .filter(item -> "FAILED".equals(item.status()))
          .filter(item -> requested.isEmpty() || requested.contains(item.row()))
          .map(item -> repository.findItem(item.key()))
          .toList();
      if (failed.isEmpty() || !requested.isEmpty() && failed.size() != requested.size()) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Select failed shipment rows to retry");
      }
      Instant now = clock.instant();
      for (Item item : failed) {
        boolean queryAgain = item.dispatched() != null && item.errorCode() != null
            && NEW_QUERY_RETRY_CODES.contains(item.errorCode());
        repository.retry(item, queryAgain, now);
      }
      repository.refreshTaskProgress(id, now);
    });
    return status(id, user);
  }

  Map<String, Object> status(String id, AuthenticatedUser user) {
    requireManager(user);
    return transactions.execute(transaction -> snapshot(owned(id, user, false), user));
  }

  List<Map<String, Object>> list(AuthenticatedUser user, int limit) {
    requireManager(user);
    return transactions.execute(transaction -> repository.listTasks(user.id(), listLimit(limit))
        .stream().map(task -> snapshot(task, user)).toList());
  }

  List<Map<String, Object>> management(AuthenticatedUser user, int limit) {
    requireManager(user);
    return transactions.execute(transaction -> {
      List<Overview> tasks = repository.listOverviews(user.id(), listLimit(limit));
      Map<String, Map<String, Integer>> counts = repository.countItemsByStatus(
          tasks.stream().filter(task -> task.published() != null).map(Overview::id).toList());
      return tasks.stream().map(task -> summary(task, counts.getOrDefault(task.id(), Map.of()))).toList();
    });
  }

  private static int listLimit(int limit) {
    return Math.max(1, Math.min(50, limit));
  }

  AuthenticatedUser executionOwner(Task task) {
    AuthenticatedUser owner = repository.owner(task.ownerId());
    if (owner == null || !owner.canManageShipmentFiles() || !"ACTIVE".equals(owner.status())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "TASK_OWNER_INACTIVE",
          "The task owner no longer has shipment management access");
    }
    return owner;
  }

  static boolean queryOnly(Task task) {
    return "QUERY_ONLY".equals(task.draft().mode());
  }

  static ShipmentTrackRequest trackRequest(Task task, ShipmentBatchItemRequest item) {
    return new ShipmentTrackRequest(item.carrier(), task.draft().channel(), item.type(), item.number(),
        true, queryOnly(task) ? null : item.importedDetails(), task.id());
  }

  private ShipmentBatchDraftRequest normalizeDraft(ShipmentBatchDraftRequest input) {
    if (input == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment draft is required");
    List<ShipmentBatchItemRequest> items = input.items() == null ? List.of() : input.items();
    String mode = clean(input.mode(), 20, "IMPORT");
    if (!Set.of("IMPORT", "QUERY_ONLY").contains(mode)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported batch task mode");
    }
    int max = "QUERY_ONLY".equals(mode) ? 60 : ShipmentBatchTrackingService.MAX_ITEMS;
    if (items.size() > max) throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment task exceeds " + max + " rows");
    if (input.sourceRows() != null && !input.sourceRows().isNull()
        && (!input.sourceRows().isArray() || input.sourceRows().size() > 2_000)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Source rows must be an array of at most 2000 rows");
    }
    ShipmentBatchDraftRequest draft = new ShipmentBatchDraftRequest(
        clean(input.sourceFileName(), 255, "Imported spreadsheet"), batch.normalizeChannel(input.channel()),
        items, "IMPORT".equals(mode) ? clean(input.customerId(), 64, null) : null,
        "IMPORT".equals(mode) && Boolean.TRUE.equals(input.publishToCustomer()), mode,
        input.sourceRows(), null);
    if (repository.encode(draft).getBytes(StandardCharsets.UTF_8).length > 4_000_000) {
      throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Shipment draft exceeds 4 MB");
    }
    return draft;
  }

  private Review review(ShipmentBatchDraftRequest draft, AuthenticatedUser user, boolean publishing) {
    List<Map<String, Object>> errors = new ArrayList<>();
    List<ShipmentBatchItemRequest> items = new ArrayList<>();
    Set<String> references = new HashSet<>();
    Set<String> ids = new HashSet<>();
    if (draft.items().isEmpty()) {
      errors.add(issue(null, "NO_ROWS", "Include at least one shipment row"));
    }
    boolean queryOnly = "QUERY_ONLY".equals(draft.mode());
    if (!queryOnly) {
      if (draft.customerId() == null) {
        errors.add(issue(null, "CUSTOMER_REQUIRED", "Select a customer before publishing this task"));
      } else if (publishing) {
        customers.requireShipmentImportCustomer(draft.customerId(), user);
      }
    }
    for (int index = 0; index < draft.items().size(); index++) {
      ShipmentBatchItemRequest original = draft.items().get(index);
      try {
        ShipmentBatchItemRequest item = batch.validateDraftItem(original, index, draft.mode());
        if (!Boolean.TRUE.equals(item.manualOnly())) {
          tracking.validatePublishedRequest(new ShipmentTrackRequest(item.carrier(), draft.channel(),
              item.type(), item.number(), true, queryOnly ? null : item.importedDetails()),
              user, publishing && !queryOnly);
        }
        if (!ids.add(item.id())) {
          errors.add(issue(original, "DUPLICATE_ROW_ID", "Duplicate shipment row id"));
        } else if (!references.add(item.carrier() + "|" + item.type() + "|" + item.number())) {
          errors.add(issue(original, "DUPLICATE_REFERENCE", "Exclude the duplicate shipment reference"));
        } else {
          items.add(item);
        }
      } catch (ApiException error) {
        errors.add(issue(original, error.code() == null ? "INVALID_REFERENCE" : error.code(), error.getMessage()));
      }
    }
    return new Review(items, errors);
  }

  private Map<String, Object> issue(ShipmentBatchItemRequest input, String code, String message) {
    Map<String, Object> issue = new LinkedHashMap<>();
    issue.put("itemId", input == null ? null : input.id());
    issue.put("sourceRow", input == null ? null : input.sourceRow());
    issue.put("code", code);
    issue.put("message", message);
    return issue;
  }

  private Task owned(String id, AuthenticatedUser user, boolean lock) {
    Task task = repository.findTask(id, lock);
    if (task == null) throw new ApiException(HttpStatus.NOT_FOUND, "Batch task not found");
    if (task.ownerId() != user.id() && !user.isAdmin()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Batch task access has not been granted");
    }
    return task;
  }

  private void requireManager(AuthenticatedUser user) {
    if (user == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Sign in is required");
    if (!user.canManageShipmentFiles()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Business user or administrator permission is required");
    }
  }

  private void requireRevision(Task task, Integer revision) {
    if (revision == null || revision < 1) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "DRAFT_REVISION_REQUIRED", "A draft revision is required");
    }
    if (revision != task.revision()) {
      throw new ApiException(HttpStatus.CONFLICT, "DRAFT_REVISION_CONFLICT",
          "The shipment draft changed. Reload the latest revision", null, Map.of("revision", task.revision()));
    }
  }

  private Map<String, Object> snapshot(Task task, AuthenticatedUser user) {
    ShipmentBatchDraftRequest draft = task.draft();
    boolean unpublished = task.published() == null;
    List<Item> items = unpublished ? List.of() : repository.listItems(task.id());
    Map<String, Integer> counts = items.stream()
        .collect(Collectors.toMap(Item::status, item -> 1, Integer::sum));
    Instant nextAttempt = items.stream().map(Item::nextAttempt).filter(java.util.Objects::nonNull)
        .findFirst().orElse(null);
    Map<String, Object> result = summary(task.overview(nextAttempt), counts);
    result.put("sourceRows", draft.sourceRows());
    result.put("validationErrors", "DRAFT".equals(task.status()) ? review(draft, user, false).errors() : List.of());
    result.put("items", unpublished ? draft.items() : items.stream().map(this::itemSnapshot).toList());
    return result;
  }

  private Map<String, Object> summary(Overview task, Map<String, Integer> counts) {
    int succeeded = counts.getOrDefault("SUCCEEDED", 0);
    int failed = counts.getOrDefault("FAILED", 0);
    int manual = counts.getOrDefault("MANUAL", 0);
    int cancelled = counts.getOrDefault("CANCELLED", 0);
    int total = task.published() == null ? task.draftItemCount()
        : counts.values().stream().mapToInt(Integer::intValue).sum();
    int processed = succeeded + failed + manual + cancelled;
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("taskId", task.id());
    result.put("status", task.status());
    result.put("revision", task.revision());
    result.put("sourceFileName", task.sourceFileName());
    result.put("channel", task.channel());
    result.put("mode", task.mode());
    result.put("customerId", task.customerId());
    result.put("publishToCustomer", task.publishToCustomer());
    result.put("total", total);
    result.put("succeeded", succeeded);
    result.put("failed", failed);
    result.put("manual", manual);
    result.put("partial", 0);
    result.put("cancelled", cancelled);
    result.put("pending", total - processed);
    result.put("running", counts.getOrDefault("RUNNING", 0));
    result.put("waiting", counts.getOrDefault("WAITING", 0));
    result.put("persisting", counts.getOrDefault("PERSISTING", 0));
    result.put("processed", processed);
    result.put("ignoredDuplicateCount", 0);
    result.put("cancelRequested", task.cancelled());
    result.put("createdAt", iso(task.created()));
    result.put("updatedAt", iso(task.updated()));
    result.put("publishedAt", iso(task.published()));
    result.put("startedAt", iso(task.started()));
    result.put("finishedAt", iso(task.finished()));
    result.put("elapsedMs", elapsed(task.started(), task.finished()));
    result.put("nextAttemptAt", iso(task.nextAttempt()));
    return result;
  }

  private Map<String, Object> itemSnapshot(Item item) {
    ShipmentBatchItemRequest input = item.input();
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("id", input.id());
    result.put("rowIndex", item.row());
    result.put("carrier", input.carrier());
    result.put("type", input.type());
    result.put("number", input.number());
    result.put("displayNumber", input.displayNumber());
    result.put("manualOnly", input.manualOnly());
    result.put("sourceRow", input.sourceRow());
    result.put("sourceReference", input.sourceReference());
    result.put("importedDetails", input.importedDetails());
    result.put("status", item.status());
    result.put("mainStatus", "MANUAL".equals(item.status()) ? "SUCCEEDED" : item.status());
    result.put("source", item.shipmentId() == null && item.payload() == null ? null
        : "MANUAL".equals(item.status()) ? "IMPORTED_PLACEHOLDER" : "LIVE");
    result.put("shipmentId", item.shipmentId());
    result.put("localJobId", item.jobId());
    result.put("payload", item.payload());
    result.put("attempts", item.started() == null ? 0 : item.run());
    result.put("error", item.errorMessage());
    result.put("errorCode", item.errorCode());
    result.put("mainError", item.errorMessage());
    result.put("mainErrorCode", item.errorCode());
    result.put("nextRetryAt", iso(item.nextAttempt()));
    result.put("startedAt", iso(item.started()));
    result.put("finishedAt", iso(item.finished()));
    result.put("updatedAt", iso(item.updated()));
    result.put("elapsedMs", elapsed(item.started(), item.finished()));
    result.put("subtasks", Collections.emptyList());
    return result;
  }

  private long elapsed(Instant start, Instant end) {
    return start == null ? 0 : Math.max(0, Duration.between(start, end == null ? clock.instant() : end).toMillis());
  }

  private static String clean(String input, int max, String fallback) {
    if (input == null || input.isBlank()) return fallback;
    String trimmed = input.trim();
    return trimmed.substring(0, Math.min(trimmed.length(), max));
  }

  private static String iso(Instant value) {
    return value == null ? null : value.toString();
  }

  private record Review(List<ShipmentBatchItemRequest> items, List<Map<String, Object>> errors) {}
}
