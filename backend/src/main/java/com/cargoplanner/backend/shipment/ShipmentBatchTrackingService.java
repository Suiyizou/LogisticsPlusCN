package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.BusinessCustomerService;
import com.cargoplanner.backend.customer.CustomerShipmentBindingRequest;
import com.cargoplanner.backend.customer.ShipmentPublicationRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Runs imported shipment queues on the server while the browser only monitors progress. */
@Service
public class ShipmentBatchTrackingService {
  static final int MAX_ITEMS = 500;
  static final long DEFAULT_MIN_INTERVAL_MS = 10_000L;
  static final long DEFAULT_MAX_INTERVAL_MS = 12_000L;
  static final int MAX_TRACK_ATTEMPTS = 3;
  static final long DEFAULT_RETRY_BASE_MS = 15_000L;
  static final long DEFAULT_RETRY_MAX_MS = 15 * 60_000L;
  static final long CHANNEL_UNAVAILABLE_COOLDOWN_MS = 2 * 60_000L;
  static final long RATE_LIMIT_COOLDOWN_MS = 15 * 60_000L;
  static final long MAX_INLINE_COOLDOWN_MS = 15 * 60_000L;
  static final long MAX_EXPLICIT_RETRY_AFTER_MS = 24 * 60 * 60_000L;
  static final int BATCH_CIRCUIT_FAILURE_THRESHOLD = 3;
  private static final long TASK_RETENTION_SECONDS = 24 * 60 * 60;
  private static final List<String> SUPPORTED_CHANNELS = List.of("AUTO", "PROXY");
  private static final List<String> BATCH_CIRCUIT_ERROR_CODES = List.of(
      "COSCO_UPSTREAM_BLOCKED",
      "COSCO_UPSTREAM_RATE_LIMITED",
      "COSCO_CHANNELS_UNAVAILABLE",
      "COSCO_UPSTREAM_UNAVAILABLE",
      "COSCO_PROXY_POOL_EXHAUSTED",
      "COSCO_PROXY_UNAVAILABLE",
      "COSCO_PROXY_NOT_CONFIGURED",
      "COSCO_SUPPLEMENTAL_UNAVAILABLE",
      "RATE_LIMITED",
      "HTTP_429",
      "HTTP_502",
      "HTTP_503",
      "HTTP_504",
      "ADAPTER_FAILURE"
  );
  private static final Pattern PROXY_ATTEMPTS_PATTERN = Pattern.compile(
      "(?:代理池已尝试|proxy pool (?:tried|attempted))\\s*(\\d+)",
      Pattern.CASE_INSENSITIVE
  );

  private final ShipmentTrackingService trackingService;
  private final BusinessCustomerService customerService;
  private final ExecutorService executor;
  private final long minIntervalMs;
  private final long maxIntervalMs;
  private final long retryBaseMs;
  private final long retryMaxMs;
  private final Clock clock;
  private final Map<String, BatchTask> tasks = new ConcurrentHashMap<>();
  private final Map<Long, String> activeTaskByUser = new ConcurrentHashMap<>();
  private final Object throttleMonitor = new Object();
  private long lastTrackingStartedAt;
  private final Map<String, CarrierChannelState> carrierStateByChannel = new ConcurrentHashMap<>();

  @Autowired
  public ShipmentBatchTrackingService(
      ShipmentTrackingService trackingService,
      ObjectProvider<BusinessCustomerService> customerServiceProvider
  ) {
    this(
        trackingService,
        customerServiceProvider.getIfAvailable(),
        Executors.newSingleThreadExecutor(runnable -> {
          Thread thread = new Thread(runnable, "shipment-batch-tracking");
          thread.setDaemon(true);
          return thread;
        }),
        DEFAULT_MIN_INTERVAL_MS,
        DEFAULT_MAX_INTERVAL_MS,
        DEFAULT_RETRY_BASE_MS,
        DEFAULT_RETRY_MAX_MS,
        Clock.systemUTC()
    );
  }

  ShipmentBatchTrackingService(
      ShipmentTrackingService trackingService,
      ExecutorService executor,
      long minIntervalMs,
      long maxIntervalMs,
      Clock clock
  ) {
    this(
        trackingService, null, executor, minIntervalMs, maxIntervalMs,
        DEFAULT_RETRY_BASE_MS, DEFAULT_RETRY_MAX_MS, clock
    );
  }

  ShipmentBatchTrackingService(
      ShipmentTrackingService trackingService,
      ExecutorService executor,
      long minIntervalMs,
      long maxIntervalMs,
      long retryBaseMs,
      long retryMaxMs,
      Clock clock
  ) {
    this(
        trackingService, null, executor, minIntervalMs, maxIntervalMs,
        retryBaseMs, retryMaxMs, clock
    );
  }

  ShipmentBatchTrackingService(
      ShipmentTrackingService trackingService,
      BusinessCustomerService customerService,
      ExecutorService executor,
      long minIntervalMs,
      long maxIntervalMs,
      long retryBaseMs,
      long retryMaxMs,
      Clock clock
  ) {
    this.trackingService = trackingService;
    this.customerService = customerService;
    this.executor = executor;
    this.minIntervalMs = Math.max(0, minIntervalMs);
    this.maxIntervalMs = Math.max(this.minIntervalMs, maxIntervalMs);
    this.retryBaseMs = Math.max(0, retryBaseMs);
    this.retryMaxMs = Math.max(this.retryBaseMs, retryMaxMs);
    this.clock = clock;
  }

  public synchronized Map<String, Object> start(
      ShipmentBatchTaskRequest request,
      AuthenticatedUser user
  ) {
    // A batch import is a deliberate carrier query. Existing bookings must be
    // refreshed once in place instead of being returned from an imported placeholder.
    return startInternal(request, user, "IMPORT", false, true);
  }

  public synchronized Map<String, Object> startRefreshAll(
      List<ShipmentBatchItemRequest> requestedItems,
      AuthenticatedUser user
  ) {
    return startRefreshAll(requestedItems, user, "AUTO");
  }

  public synchronized Map<String, Object> startRefreshAll(
      List<ShipmentBatchItemRequest> requestedItems,
      AuthenticatedUser user,
      String channel
  ) {
    return startInternal(
        new ShipmentBatchTaskRequest(
            "One-click active shipment refresh", channel, requestedItems
        ),
        user,
        "REFRESH_ALL",
        true,
        true
    );
  }

  public synchronized Map<String, Object> startRefreshSelected(
      List<ShipmentBatchItemRequest> requestedItems,
      AuthenticatedUser user,
      String channel
  ) {
    return startInternal(
        new ShipmentBatchTaskRequest(
            "Selected shipment refresh", channel, requestedItems
        ),
        user,
        "REFRESH_SELECTED",
        true,
        true
    );
  }

  private Map<String, Object> startInternal(
      ShipmentBatchTaskRequest request,
      AuthenticatedUser user,
      String mode,
      boolean trustedExistingReferences,
      boolean forceRefresh
  ) {
    requireManager(user);
    pruneExpiredTasks();
    List<ShipmentBatchItemRequest> requestedItems = request == null || request.items() == null
        ? List.of()
        : request.items();
    String channel = normalizeChannel(request == null ? null : request.channel());
    if (requestedItems.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one shipment is required");
    }
    if (requestedItems.size() > MAX_ITEMS) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A shipment batch cannot exceed 500 rows");
    }
    String existingTaskId = activeTaskByUser.get(user.id());
    BatchTask existing = existingTaskId == null ? null : tasks.get(existingTaskId);
    if (existing != null && !existing.terminal()) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "A shipment batch task is already running for this user"
      );
    }
    if (existingTaskId != null) activeTaskByUser.remove(user.id(), existingTaskId);

    Map<String, BatchItem> uniqueItems = new LinkedHashMap<>();
    for (int index = 0; index < requestedItems.size(); index++) {
      BatchItem item = trustedExistingReferences
          ? normalizeExistingReference(requestedItems.get(index), index)
          : normalizeItem(requestedItems.get(index), index);
      uniqueItems.putIfAbsent(
          item.request.carrier() + "|" + item.request.type() + "|" + item.queryNumber,
          item
      );
    }
    List<BatchItem> items = new ArrayList<>(uniqueItems.values());
    if (forceRefresh && !"IMPORT".equals(mode)) {
      items.forEach(this::initializeSupplementalSubtasks);
    }
    String taskId = "batch_" + UUID.randomUUID().toString().replace("-", "");
    Instant now = clock.instant();
    BatchTask task = new BatchTask(
        taskId,
        user,
        clean(request == null ? null : request.sourceFileName(), 255, "Imported spreadsheet"),
        items,
        channel,
        mode,
        forceRefresh,
        "IMPORT".equals(mode) && request != null ? request.customerId() : null,
        "IMPORT".equals(mode) && request != null && !Boolean.FALSE.equals(request.publishToCustomer()),
        requestedItems.size() - items.size(),
        now
    );
    tasks.put(taskId, task);
    activeTaskByUser.put(user.id(), taskId);
    executor.execute(() -> run(task));
    return snapshot(task);
  }

  public Map<String, Object> status(String taskId, AuthenticatedUser user) {
    requireManager(user);
    pruneExpiredTasks();
    return snapshot(requireOwnedTask(taskId, user));
  }

  public Map<String, Object> cancel(String taskId, AuthenticatedUser user) {
    requireManager(user);
    BatchTask task = requireOwnedTask(taskId, user);
    if (task.terminal()) return snapshot(task);
    task.cancelRequested.set(true);
    synchronized (task) {
      if (!task.terminal()) task.status = "STOPPING";
      task.updatedAt = clock.instant();
    }
    CompletableFuture.runAsync(() -> {
      try {
        trackingService.cancelBatchTask(task.id);
      } catch (RuntimeException ignored) {
        // Local cancellation remains authoritative if the adapter is unavailable.
      }
    });
    synchronized (throttleMonitor) {
      throttleMonitor.notifyAll();
    }
    return snapshot(task);
  }

  private void run(BatchTask task) {
    synchronized (task) {
      if (task.cancelRequested.get()) {
        finish(task, "STOPPED");
        return;
      }
      task.status = "RUNNING";
      task.startedAt = clock.instant();
      task.updatedAt = task.startedAt;
    }

    String finalStatus = "COMPLETED";
    try {
      for (BatchItem item : task.items) {
        if (task.cancelRequested.get()) break;
        try {
          if (item.manualOnly) {
            markAttemptStarted(task, item);
            ObjectNode response = trackingService.recordImportedPlaceholder(item.request, task.owner);
            synchronized (task) {
              item.status = "MANUAL";
              item.source = "IMPORTED_PLACEHOLDER";
              item.mainStatus = "SUCCEEDED";
              item.mainSource = item.source;
              item.mainChannel = "MANUAL";
              item.shipmentId = response.path("shipmentId").asText(null);
              item.error = null;
              item.errorCode = null;
              item.nextRetryAt = null;
              item.updatedAt = clock.instant();
              item.finishedAt = item.updatedAt;
              task.updatedAt = item.updatedAt;
            }
          } else {
            trackWithRetry(task, item);
          }
          assignImportedShipment(task, item);
        } catch (ProtectionPauseException paused) {
          RuntimeException protectionError = paused.getCause() instanceof RuntimeException cause
              ? cause
              : paused;
          markFinalFailure(task, item, protectionError);
          finalStatus = "PAUSED";
          break;
        } catch (RuntimeException error) {
          if (task.cancelRequested.get() || isCancellation(error)) {
            markPendingAfterCancellation(task, item);
            break;
          }
          markFinalFailure(task, item, error);
        }
        if (recordBatchCircuitOutcome(task, item)) {
          finalStatus = "PAUSED";
          break;
        }
      }
    } finally {
      finish(task, task.cancelRequested.get() ? "STOPPED" : finalStatus);
    }
  }

  private void assignImportedShipment(BatchTask task, BatchItem item) {
    if (!"IMPORT".equals(task.mode) || customerService == null) return;
    if (task.customerId == null || task.customerId.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Select a customer before batch tracking");
    }
    if (item.shipmentId == null || item.shipmentId.isBlank()) {
      throw new ApiException(HttpStatus.BAD_GATEWAY, "Tracking result did not return a shipment id");
    }
    customerService.bindShipment(
        task.customerId,
        new CustomerShipmentBindingRequest(item.shipmentId, null, null, null),
        task.owner,
        "batch:" + task.id
    );
    if (task.publishToCustomer) {
      customerService.setShipmentPublication(
          task.customerId,
          item.shipmentId,
          new ShipmentPublicationRequest(true),
          task.owner,
          "batch:" + task.id
      );
    }
  }

  private void trackWithRetry(BatchTask task, BatchItem item) {
    while (!task.cancelRequested.get()) {
      waitForCarrierCooldown(task, item);
      if (task.cancelRequested.get()) break;
      markWaitingForTrackingWindow(task, item);
      waitForTrackingWindow(task);
      if (task.cancelRequested.get()) break;
      markAttemptStarted(task, item);
      try {
        ObjectNode response = trackingService.track(
            new ShipmentTrackRequest(
                item.request.carrier(),
                task.channel,
                item.request.type(),
                item.queryNumber,
                task.forceRefresh,
                item.request.importedDetails(),
                task.id
            ),
            task.owner
        );
        captureMainQueryDiagnostics(item, response);
        rejectStaleMainRefresh(task, item, response);
        synchronized (throttleMonitor) {
          CarrierChannelState channelState = carrierState(task.channel);
          channelState.consecutiveFailures = 0;
          if (channelState.cooldownUntil != null
              && !channelState.cooldownUntil.isAfter(clock.instant())) {
            channelState.cooldownUntil = null;
          }
        }
        synchronized (task) {
          item.shipmentId = response.path("shipmentId").asText(null);
          item.mainStatus = "SUCCEEDED";
          item.mainError = null;
          item.mainErrorCode = null;
        }
        boolean automaticProxyFallback = "AUTO".equals(task.channel)
            && "PROXY".equals(response.path("strategy").path("used").asText());
        boolean supplementalComplete = refreshSupplementalDetails(task, item);
        synchronized (task) {
          item.status = supplementalComplete ? "SUCCEEDED" : "PARTIAL";
          item.source = automaticProxyFallback
              ? "AUTO_PROXY"
              : response.path("cacheSource").asText("LIVE");
          item.error = null;
          item.errorCode = supplementalComplete ? null : supplementalErrorCode(item);
          item.nextRetryAt = null;
          task.nextAttemptAt = null;
          item.updatedAt = clock.instant();
          item.finishedAt = item.updatedAt;
          task.updatedAt = item.updatedAt;
        }
        persistRefreshOutcome(task, item);
        return;
      } catch (RuntimeException error) {
        if (task.cancelRequested.get() || isCancellation(error)) throw error;
        if ("COSCO_PROXY_POOL_EXHAUSTED".equals(errorCode(error))) throw error;
        if (!isRetryable(error)) throw error;
        boolean protectionFailure = isProtectionFailure(error);
        if (item.attempts >= MAX_TRACK_ATTEMPTS && !protectionFailure) {
          registerCarrierFailure(task.channel, error, item.attempts);
          throw error;
        }
        Instant retryAt = registerCarrierFailure(task.channel, error, item.attempts);
        synchronized (task) {
          item.status = "RETRY_WAIT";
          item.error = safeMessage(error);
          item.errorCode = errorCode(error);
          item.mainStatus = "RETRY_WAIT";
          item.mainError = item.error;
          item.mainErrorCode = item.errorCode;
          captureErrorDiagnostics(item, error);
          item.nextRetryAt = retryAt;
          task.nextAttemptAt = retryAt;
          task.updatedAt = clock.instant();
        }
        if (protectionFailure
            && (item.attempts >= MAX_TRACK_ATTEMPTS
                || (!isImmediateProtectionFailure(error)
                    && retryAt.isAfter(clock.instant().plusMillis(MAX_INLINE_COOLDOWN_MS))))) {
          throw new ProtectionPauseException(error);
        }
      }
    }
    if (task.cancelRequested.get()) markPendingAfterCancellation(task, item);
  }

  private void captureMainQueryDiagnostics(BatchItem item, ObjectNode response) {
    JsonNode strategy = response.path("strategy");
    JsonNode snapshot = response.path("snapshot");
    boolean stale = response.path("stale").asBoolean(false)
        || "MYSQL_STALE".equalsIgnoreCase(response.path("cacheSource").asText(""));
    synchronized (item) {
      item.shipmentId = response.path("shipmentId").asText(item.shipmentId);
      item.source = response.path("cacheSource").asText(stale ? "MYSQL_STALE" : "LIVE");
      item.mainSource = item.source;
      item.mainChannel = stale
          ? "CACHE"
          : strategy.path("used").asText(snapshot.path("channel").asText(null));
      item.mainFetchedAt = response.path("fetchedAt")
          .asText(snapshot.path("fetchedAt").asText(null));
      item.mainCacheStale = stale;
      item.dataChanged = response.has("dataChanged")
          ? response.path("dataChanged").asBoolean()
          : null;
      item.proxyNode = cleanDiagnosticText(strategy.path("proxyNode").asText(null), 128);
      item.proxyAttempts = Math.max(
          item.proxyAttempts,
          Math.max(0, strategy.path("proxyAttempts").asInt(0))
      );
      List<String> triedNodes = textValues(strategy.path("triedNodes"));
      if (!triedNodes.isEmpty()) item.triedProxyNodes = triedNodes;
    }
  }

  private void rejectStaleMainRefresh(
      BatchTask task,
      BatchItem item,
      ObjectNode response
  ) {
    if (!task.forceRefresh || !item.mainCacheStale) return;
    JsonNode diagnostic = response.path("diagnostic");
    String upstreamCode = diagnostic.path("code").asText("LIVE_REFRESH_FELL_BACK_TO_CACHE");
    String upstreamMessage = response.path("warning").asText(
        diagnostic.path("message").asText("Carrier live refresh failed")
    );
    String message = "Carrier live refresh failed; the existing database snapshot was kept"
        + (item.mainFetchedAt == null ? "" : " (snapshot fetched at " + item.mainFetchedAt + ")")
        + (upstreamMessage.isBlank() ? "" : ": " + upstreamMessage);
    long retryAfterMs = Math.max(0L, diagnostic.path("retryAfterMs").asLong(0L));
    Map<String, Object> details = new LinkedHashMap<>();
    details.put("fallbackSource", item.mainSource);
    details.put("snapshotFetchedAt", item.mainFetchedAt);
    details.put("stale", true);
    if (!upstreamCode.isBlank()) details.put("causeCode", upstreamCode);
    if (retryAfterMs > 0) details.put("retryAfterMs", retryAfterMs);
    synchronized (task) {
      item.mainStatus = "FAILED";
      item.mainError = message;
      item.mainErrorCode = upstreamCode;
      item.errorDetails = details;
    }
    HttpStatus status = "COSCO_UPSTREAM_RATE_LIMITED".equals(upstreamCode)
        ? HttpStatus.TOO_MANY_REQUESTS
        : HttpStatus.BAD_GATEWAY;
    throw new ApiException(
        status,
        upstreamCode.isBlank() ? "LIVE_REFRESH_FELL_BACK_TO_CACHE" : upstreamCode,
        message,
        retryAfterMs > 0 ? retryAfterMs : null,
        details
    );
  }

  private List<String> textValues(JsonNode node) {
    if (node == null || !node.isArray()) return List.of();
    List<String> values = new ArrayList<>();
    node.forEach(value -> {
      String normalized = cleanDiagnosticText(value.asText(null), 128);
      if (normalized != null && !values.contains(normalized)) values.add(normalized);
    });
    return List.copyOf(values);
  }

  private String cleanDiagnosticText(String value, int maxLength) {
    if (value == null) return null;
    String normalized = value.replaceAll("[\\p{Cntrl}]", " ").trim();
    if (normalized.isBlank()) return null;
    return normalized.length() <= maxLength
        ? normalized
        : normalized.substring(0, maxLength);
  }

  private boolean refreshSupplementalDetails(BatchTask task, BatchItem item) {
    if (!task.forceRefresh || "IMPORT".equals(task.mode)
        || !"COSCO".equals(item.request.carrier())) return true;
    if (item.shipmentId == null || item.shipmentId.isBlank()) {
      setFailedSupplementalSubtasks(
          task,
          item,
          "Main refresh did not return a shipment id",
          "SHIPMENT_ID_MISSING",
          0
      );
      return false;
    }
    markSupplementalSubtasksRunning(task, item);
    try {
      ObjectNode response = trackingService.loadSupplementalDetails(
          item.shipmentId,
          new ShipmentTrackRequest(
              item.request.carrier(),
              task.channel,
              item.request.type(),
              item.queryNumber,
              true,
              null,
              task.id
          ),
          task.owner
      );
      JsonNode supplementalStrategy = response == null
          ? null
          : response.path("strategy");
      if (supplementalStrategy != null && supplementalStrategy.isObject()) {
        synchronized (task) {
          String proxyNode = cleanDiagnosticText(
              supplementalStrategy.path("proxyNode").asText(null), 128
          );
          if (proxyNode != null) item.proxyNode = proxyNode;
          item.proxyAttempts = Math.max(
              item.proxyAttempts,
              Math.max(0, supplementalStrategy.path("proxyAttempts").asInt(0))
          );
          List<String> triedNodes = textValues(supplementalStrategy.path("triedNodes"));
          if (!triedNodes.isEmpty()) item.triedProxyNodes = triedNodes;
        }
      }
      Map<String, SupplementalFailure> failures = new LinkedHashMap<>();
      SupplementalFailure unmappedFailure = null;
      JsonNode warnings = response == null ? null : response.path("warnings");
      if (warnings != null && warnings.isArray()) {
        for (JsonNode warning : warnings) {
          String source = warning.path("source").asText("");
          String message = warning.path("message").asText("Supplemental query failed");
          String code = warning.path("code").asText("COSCO_SUPPLEMENTAL_PARTIAL");
          int proxyAttempts = Math.max(
              0,
              warning.path("proxyAttempts").asInt(warning.path("attempts").asInt(0))
          );
          String route = warning.path("route").asText(null);
          String proxyNode = warning.path("proxyNode").asText(
              supplementalStrategy == null ? null : supplementalStrategy.path("proxyNode").asText(null)
          );
          List<String> triedNodes = textValues(warning.path("triedNodes"));
          SupplementalFailure failure = new SupplementalFailure(
              message, code, proxyAttempts, route, proxyNode, triedNodes
          );
          if (source.equals("bookingInfo") || source.equals("containerInfo")) {
            failures.put(source, failure);
          } else {
            unmappedFailure = failure;
          }
        }
      }
      boolean responsePartial = response != null && response.path("partial").asBoolean(false);
      if (unmappedFailure != null) {
        failures.putIfAbsent("bookingInfo", unmappedFailure);
        failures.putIfAbsent("containerInfo", unmappedFailure);
      } else if (responsePartial && failures.isEmpty()) {
        SupplementalFailure failure = new SupplementalFailure(
            "COSCO supplemental response was marked partial without source diagnostics",
            "COSCO_SUPPLEMENTAL_PARTIAL",
            0
        );
        failures.put("bookingInfo", failure);
        failures.put("containerInfo", failure);
      }
      synchronized (task) {
        item.subtasks.clear();
        item.subtasks.add(subtask(
            "BOOKING_REFERENCE",
            failures.containsKey("bookingInfo") ? "FAILED" : "SUCCEEDED",
            failures.get("bookingInfo")
        ));
        item.subtasks.add(subtask(
            "TRANSPORT_DETAILS",
            failures.containsKey("containerInfo") ? "FAILED" : "SUCCEEDED",
            failures.get("containerInfo")
        ));
        item.proxyAttempts = Math.max(
            item.proxyAttempts,
            failures.values().stream()
                .mapToInt(SupplementalFailure::proxyAttempts)
                .max()
                .orElse(0)
        );
        item.proxyNode = failures.values().stream()
            .map(SupplementalFailure::proxyNode)
            .filter(value -> value != null && !value.isBlank())
            .findFirst()
            .orElse(item.proxyNode);
        List<String> failedNodes = failures.values().stream()
            .flatMap(failure -> failure.triedNodes().stream())
            .distinct()
            .toList();
        if (!failedNodes.isEmpty()) item.triedProxyNodes = failedNodes;
        item.updatedAt = clock.instant();
        task.updatedAt = item.updatedAt;
      }
      return failures.isEmpty() && !responsePartial;
    } catch (RuntimeException error) {
      synchronized (task) {
        captureErrorDiagnostics(item, error);
      }
      if (!setFailedSupplementalSubtasksFromDiagnostics(task, item, error)) {
        setFailedSupplementalSubtasks(
            task,
            item,
            safeMessage(error),
            errorCode(error),
            proxyAttempts(error)
        );
      }
      synchronized (task) {
        for (Map<String, Object> subtask : item.subtasks) {
          subtask.putIfAbsent("route", item.errorDetails.get("route"));
          subtask.putIfAbsent("proxyNode", item.proxyNode);
          subtask.putIfAbsent("triedProxyNodes", item.triedProxyNodes);
        }
      }
      return false;
    }
  }

  private void initializeSupplementalSubtasks(BatchItem item) {
    if (item.manualOnly
        || !"COSCO".equals(item.request.carrier())
        || "CONTAINER".equals(item.request.type())) {
      return;
    }
    item.subtasks.add(subtask("BOOKING_REFERENCE", "PENDING", null));
    item.subtasks.add(subtask("TRANSPORT_DETAILS", "PENDING", null));
  }

  private void markSupplementalSubtasksRunning(BatchTask task, BatchItem item) {
    synchronized (task) {
      item.subtasks.clear();
      item.subtasks.add(subtask("BOOKING_REFERENCE", "RUNNING", null));
      item.subtasks.add(subtask("TRANSPORT_DETAILS", "RUNNING", null));
      item.updatedAt = clock.instant();
      task.updatedAt = item.updatedAt;
    }
  }

  private void setFailedSupplementalSubtasks(
      BatchTask task,
      BatchItem item,
      String message,
      String errorCode,
      int proxyAttempts
  ) {
    synchronized (task) {
      item.subtasks.clear();
      SupplementalFailure failure = new SupplementalFailure(message, errorCode, proxyAttempts);
      item.subtasks.add(subtask("BOOKING_REFERENCE", "FAILED", failure));
      item.subtasks.add(subtask("TRANSPORT_DETAILS", "FAILED", failure));
      item.proxyAttempts = Math.max(0, proxyAttempts);
      item.updatedAt = clock.instant();
      task.updatedAt = item.updatedAt;
    }
  }

  private boolean setFailedSupplementalSubtasksFromDiagnostics(
      BatchTask task,
      BatchItem item,
      RuntimeException error
  ) {
    if (!(error instanceof ApiException apiError)) return false;
    Object rawWarnings = apiError.details().get("warnings");
    if (!(rawWarnings instanceof List<?> warnings) || warnings.isEmpty()) return false;
    Map<String, SupplementalFailure> failures = new LinkedHashMap<>();
    for (Object rawWarning : warnings) {
      if (!(rawWarning instanceof Map<?, ?> warning)) continue;
      String source = diagnosticString(warning.get("source"));
      if (!"bookingInfo".equals(source) && !"containerInfo".equals(source)) continue;
      String message = diagnosticString(warning.get("message"));
      if (message == null) message = safeMessage(error);
      String code = diagnosticString(warning.get("code"));
      if (code == null) code = errorCode(error);
      int attempts = diagnosticInteger(warning.get("proxyAttempts"));
      if (attempts == 0) attempts = diagnosticInteger(warning.get("attempts"));
      String route = diagnosticString(warning.get("route"));
      String proxyNode = diagnosticString(warning.get("proxyNode"));
      List<String> triedNodes = diagnosticStrings(warning.get("triedNodes"));
      failures.put(source, new SupplementalFailure(
          message, code, attempts, route, proxyNode, triedNodes
      ));
    }
    if (failures.isEmpty()) return false;

    SupplementalFailure fallback = new SupplementalFailure(
        safeMessage(error),
        errorCode(error),
        proxyAttempts(error),
        diagnosticString(apiError.details().get("route")),
        diagnosticString(apiError.details().get("proxyNode")),
        diagnosticStrings(apiError.details().get("triedNodes"))
    );
    synchronized (task) {
      item.subtasks.clear();
      SupplementalFailure bookingFailure = failures.getOrDefault("bookingInfo", fallback);
      SupplementalFailure containerFailure = failures.getOrDefault("containerInfo", fallback);
      item.subtasks.add(subtask("BOOKING_REFERENCE", "FAILED", bookingFailure));
      item.subtasks.add(subtask("TRANSPORT_DETAILS", "FAILED", containerFailure));
      item.proxyAttempts = Math.max(
          item.proxyAttempts,
          Math.max(bookingFailure.proxyAttempts(), containerFailure.proxyAttempts())
      );
      item.proxyNode = failures.values().stream()
          .map(SupplementalFailure::proxyNode)
          .filter(value -> value != null && !value.isBlank())
          .findFirst()
          .orElse(item.proxyNode);
      List<String> triedNodes = failures.values().stream()
          .flatMap(failure -> failure.triedNodes().stream())
          .distinct()
          .toList();
      if (!triedNodes.isEmpty()) item.triedProxyNodes = triedNodes;
      item.updatedAt = clock.instant();
      task.updatedAt = item.updatedAt;
    }
    return true;
  }

  private int diagnosticInteger(Object value) {
    if (value instanceof Number number) return Math.max(0, number.intValue());
    if (value == null) return 0;
    try {
      return Math.max(0, Integer.parseInt(String.valueOf(value)));
    } catch (NumberFormatException ignored) {
      return 0;
    }
  }

  private List<String> diagnosticStrings(Object value) {
    if (!(value instanceof List<?> values)) return List.of();
    return values.stream()
        .map(this::diagnosticString)
        .filter(text -> text != null && !text.isBlank())
        .distinct()
        .toList();
  }

  private Map<String, Object> subtask(
      String type,
      String status,
      SupplementalFailure failure
  ) {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("type", type);
    value.put("status", status);
    value.put("error", failure == null ? null : failure.message());
    value.put("errorCode", failure == null ? null : failure.code());
    value.put("proxyAttempts", failure == null ? 0 : failure.proxyAttempts());
    value.put("route", failure == null ? null : failure.route());
    value.put("proxyNode", failure == null ? null : failure.proxyNode());
    value.put("triedProxyNodes", failure == null ? List.of() : failure.triedNodes());
    return value;
  }

  private void markWaitingForTrackingWindow(BatchTask task, BatchItem item) {
    synchronized (task) {
      task.status = "RUNNING";
      item.status = "RUNNING";
      item.mainStatus = "RUNNING";
      item.nextRetryAt = null;
      task.nextAttemptAt = null;
      item.updatedAt = clock.instant();
      task.updatedAt = item.updatedAt;
    }
  }

  private void markAttemptStarted(BatchTask task, BatchItem item) {
    synchronized (task) {
      task.status = "RUNNING";
      item.status = "RUNNING";
      item.mainStatus = "RUNNING";
      item.attempts++;
      if (item.startedAt == null) item.startedAt = clock.instant();
      item.nextRetryAt = null;
      task.nextAttemptAt = null;
      item.updatedAt = clock.instant();
      task.updatedAt = item.updatedAt;
    }
  }

  private void markPendingAfterCancellation(BatchTask task, BatchItem item) {
    synchronized (task) {
      item.status = "PENDING";
      item.mainStatus = "PENDING";
      item.source = null;
      item.mainSource = null;
      item.mainChannel = null;
      item.mainFetchedAt = null;
      item.mainCacheStale = false;
      item.dataChanged = null;
      item.mainError = null;
      item.mainErrorCode = null;
      item.error = null;
      item.errorCode = null;
      item.nextRetryAt = null;
      task.nextAttemptAt = null;
      item.updatedAt = clock.instant();
      if (item.startedAt != null) item.finishedAt = item.updatedAt;
      task.updatedAt = item.updatedAt;
    }
  }

  private void markFinalFailure(BatchTask task, BatchItem item, RuntimeException error) {
    synchronized (task) {
      item.status = "FAILED";
      item.error = safeMessage(error);
      item.errorCode = errorCode(error);
      item.proxyAttempts = proxyAttempts(error);
      item.mainStatus = "FAILED";
      item.mainError = item.error;
      item.mainErrorCode = item.errorCode;
      captureErrorDiagnostics(item, error);
      item.nextRetryAt = null;
      task.nextAttemptAt = null;
      item.updatedAt = clock.instant();
      item.finishedAt = item.updatedAt;
      task.updatedAt = item.updatedAt;
    }
    persistRefreshOutcome(task, item);
  }

  private void persistRefreshOutcome(BatchTask task, BatchItem item) {
    String shipmentId = item.shipmentId;
    if ((shipmentId == null || shipmentId.isBlank()) && task.mode.startsWith("REFRESH_")) {
      String requestId = item.request.id();
      shipmentId = requestId != null && requestId.startsWith("refresh-")
          ? requestId.substring("refresh-".length())
          : null;
    }
    if (shipmentId == null || shipmentId.isBlank()) return;
    String message = "PARTIAL".equals(item.status)
        ? supplementalErrorMessage(item)
        : item.error;
    try {
      trackingService.recordRefreshOutcome(
          shipmentId,
          item.status,
          item.errorCode,
          message,
          item.attempts,
          item.proxyAttempts
      );
    } catch (RuntimeException error) {
      synchronized (task) {
        item.errorDetails.put("refreshOutcomePersistenceError", safeMessage(error));
      }
    }
    if (!"PARTIAL".equals(item.status)) return;
    List<String> failedSources = item.subtasks.stream()
        .filter(subtask -> "FAILED".equals(subtask.get("status")))
        .map(subtask -> "BOOKING_REFERENCE".equals(subtask.get("type"))
            ? "bookingInfo"
            : "containerInfo")
        .distinct()
        .toList();
    try {
      boolean scheduled = trackingService.scheduleSupplementalRetry(
          shipmentId, failedSources, item.errorCode, message
      );
      synchronized (task) {
        item.supplementalRetryPending = scheduled;
        if (!scheduled) {
          item.errorDetails.put(
              "supplementalRetryScheduleError",
              "The supplemental retry scheduler is disabled or no durable job was created"
          );
        }
      }
    } catch (RuntimeException error) {
      synchronized (task) {
        item.supplementalRetryPending = false;
        item.errorDetails.put("supplementalRetryScheduleError", safeMessage(error));
      }
    }
  }

  private String supplementalErrorCode(BatchItem item) {
    return item.subtasks.stream()
        .filter(subtask -> "FAILED".equals(subtask.get("status")))
        .map(subtask -> String.valueOf(subtask.getOrDefault("errorCode", "")))
        .filter(code -> !code.isBlank() && !"null".equals(code))
        .distinct()
        .reduce((left, right) -> left + "," + right)
        .orElse("COSCO_SUPPLEMENTAL_PARTIAL");
  }

  private String supplementalErrorMessage(BatchItem item) {
    return item.subtasks.stream()
        .filter(subtask -> "FAILED".equals(subtask.get("status")))
        .map(subtask -> String.valueOf(subtask.getOrDefault("error", "")))
        .filter(message -> !message.isBlank() && !"null".equals(message))
        .distinct()
        .reduce((left, right) -> left + "; " + right)
        .orElse("Supplemental tracking details are incomplete");
  }

  private boolean recordBatchCircuitOutcome(BatchTask task, BatchItem item) {
    String errorCode = batchCircuitErrorCode(item);
    synchronized (task) {
      if (errorCode == null) {
        task.consecutiveCircuitFailures = 0;
        task.circuitErrorCode = null;
        return false;
      }
      task.consecutiveCircuitFailures++;
      task.circuitErrorCode = errorCode;
      if (task.consecutiveCircuitFailures < BATCH_CIRCUIT_FAILURE_THRESHOLD) {
        return false;
      }
      task.stopReason = "CIRCUIT_BREAKER";
      task.stopMessage = "Batch stopped after "
          + task.consecutiveCircuitFailures
          + " consecutive upstream failures ("
          + errorCode
          + ")";
      task.updatedAt = clock.instant();
      return true;
    }
  }

  private String batchCircuitErrorCode(BatchItem item) {
    List<String> candidates = new ArrayList<>();
    if (item.errorCode != null) candidates.add(item.errorCode);
    for (Map<String, Object> subtask : item.subtasks) {
      Object value = subtask.get("errorCode");
      if (value != null) candidates.add(String.valueOf(value));
    }
    for (String candidate : candidates) {
      for (String code : candidate.toUpperCase(Locale.ROOT).split(",")) {
        String normalized = code.trim();
        if (BATCH_CIRCUIT_ERROR_CODES.contains(normalized)) return normalized;
      }
    }
    return null;
  }

  private int proxyAttempts(RuntimeException error) {
    if (error instanceof ApiException apiError) {
      Object structured = apiError.details().get("proxyAttempts");
      if (!(structured instanceof Number)) structured = apiError.details().get("attempts");
      int attempts = structured instanceof Number number ? Math.max(0, number.intValue()) : 0;
      Object apiAttempts = apiError.details().get("apiProxyAttempts");
      if (apiAttempts instanceof Number number) {
        attempts = Math.max(attempts, Math.max(0, number.intValue()));
      }
      Object playwrightAttempts = apiError.details().get("playwrightAttempts");
      if (playwrightAttempts instanceof Number number) {
        attempts = Math.max(attempts, Math.max(0, number.intValue()));
      }
      if (attempts > 0) return attempts;
    }
    Matcher matcher = PROXY_ATTEMPTS_PATTERN.matcher(safeMessage(error));
    if (!matcher.find()) return 0;
    try {
      return Math.max(0, Integer.parseInt(matcher.group(1)));
    } catch (NumberFormatException ignored) {
      return 0;
    }
  }

  private void captureErrorDiagnostics(BatchItem item, RuntimeException error) {
    if (!(error instanceof ApiException apiError) || apiError.details().isEmpty()) return;
    item.errorDetails = new LinkedHashMap<>(apiError.details());
    String fallbackSource = diagnosticString(apiError.details().get("fallbackSource"));
    if (fallbackSource != null) {
      item.source = fallbackSource;
      item.mainSource = fallbackSource;
      item.mainCacheStale = Boolean.TRUE.equals(apiError.details().get("stale"));
      if (item.mainCacheStale) item.mainChannel = "CACHE";
    }
    String snapshotFetchedAt = diagnosticString(apiError.details().get("snapshotFetchedAt"));
    if (snapshotFetchedAt != null) item.mainFetchedAt = snapshotFetchedAt;
    String proxyNode = diagnosticString(apiError.details().get("playwrightProxyNode"));
    if (proxyNode == null) proxyNode = diagnosticString(apiError.details().get("proxyNode"));
    if (proxyNode != null) item.proxyNode = proxyNode;
    List<Object> diagnosticNodes = new ArrayList<>();
    Object apiNodes = apiError.details().get("apiTriedNodes");
    if (apiNodes instanceof List<?> list) diagnosticNodes.addAll(list);
    Object nodes = apiError.details().get("triedNodes");
    if (nodes instanceof List<?> list) diagnosticNodes.addAll(list);
    if (proxyNode != null) diagnosticNodes.add(proxyNode);
    if (!diagnosticNodes.isEmpty()) {
      item.triedProxyNodes = diagnosticNodes.stream()
          .map(this::diagnosticString)
          .filter(value -> value != null && !value.isBlank())
          .distinct()
          .toList();
    }
  }

  private String diagnosticString(Object value) {
    return cleanDiagnosticText(value == null ? null : String.valueOf(value), 128);
  }

  private void finish(BatchTask task, String status) {
    synchronized (task) {
      task.status = status;
      task.nextAttemptAt = null;
      task.cooldownUntil = null;
      task.finishedAt = clock.instant();
      task.updatedAt = task.finishedAt;
      for (BatchItem item : task.items) {
        if (item.startedAt != null && item.finishedAt == null) {
          item.finishedAt = task.finishedAt;
          item.updatedAt = task.finishedAt;
        }
      }
    }
    activeTaskByUser.remove(task.owner.id(), task.id);
  }

  private void waitForCarrierCooldown(BatchTask task, BatchItem item) {
    while (!task.cancelRequested.get()) {
      Instant until = carrierState(task.channel).cooldownUntil;
      Instant now = clock.instant();
      if (until == null || !until.isAfter(now)) {
        synchronized (throttleMonitor) {
          CarrierChannelState channelState = carrierState(task.channel);
          if (channelState.cooldownUntil != null
              && !channelState.cooldownUntil.isAfter(now)) {
            channelState.cooldownUntil = null;
          }
        }
        synchronized (task) {
          task.cooldownUntil = null;
          if (item.nextRetryAt != null && !item.nextRetryAt.isAfter(now)) {
            item.nextRetryAt = null;
          }
        }
        return;
      }
      synchronized (task) {
        task.status = "COOLDOWN";
        item.status = "RETRY_WAIT";
        item.nextRetryAt = until;
        task.cooldownUntil = until;
        task.nextAttemptAt = until;
        task.updatedAt = now;
      }
      waitUntil(task, until);
    }
  }

  private Instant registerCarrierFailure(
      String channel,
      RuntimeException error,
      int attempt
  ) {
    long delayMs = retryDelayMs(error, attempt);
    synchronized (throttleMonitor) {
      CarrierChannelState channelState = carrierState(channel);
      channelState.consecutiveFailures++;
      if (isImmediateProtectionFailure(error)) {
        delayMs = Math.max(
            delayMs,
            Math.min(RATE_LIMIT_COOLDOWN_MS, retryMaxMs)
        );
      } else if (channelState.consecutiveFailures >= 2 && isChannelUnavailable(error)) {
        delayMs = Math.max(
            delayMs,
            Math.min(CHANNEL_UNAVAILABLE_COOLDOWN_MS, retryMaxMs)
        );
      }
      Instant candidate = clock.instant().plusMillis(delayMs);
      if (channelState.cooldownUntil == null || candidate.isAfter(channelState.cooldownUntil)) {
        channelState.cooldownUntil = candidate;
      }
      throttleMonitor.notifyAll();
      return channelState.cooldownUntil;
    }
  }

  private CarrierChannelState carrierState(String channel) {
    return carrierStateByChannel.computeIfAbsent(channel, ignored -> new CarrierChannelState());
  }

  long retryDelayMs(RuntimeException error, int attempt) {
    long exponent = Math.max(0, Math.min(10, attempt - 1));
    long exponential;
    try {
      exponential = Math.multiplyExact(retryBaseMs, 1L << exponent);
    } catch (ArithmeticException overflow) {
      exponential = retryMaxMs;
    }
    exponential = Math.min(retryMaxMs, exponential);
    double jitter = 0.75D + ThreadLocalRandom.current().nextDouble() * 0.5D;
    long delayMs = Math.min(retryMaxMs, Math.max(0L, Math.round(exponential * jitter)));
    if (error instanceof ApiException apiError && apiError.retryAfterMs() != null) {
      delayMs = Math.max(
          delayMs,
          Math.min(MAX_EXPLICIT_RETRY_AFTER_MS, apiError.retryAfterMs())
      );
    }
    return delayMs;
  }

  private boolean isRetryable(RuntimeException error) {
    if (!(error instanceof ApiException apiError)) return false;
    return apiError.status() == HttpStatus.TOO_MANY_REQUESTS
        || apiError.status() == HttpStatus.BAD_GATEWAY
        || apiError.status() == HttpStatus.SERVICE_UNAVAILABLE
        || apiError.status() == HttpStatus.GATEWAY_TIMEOUT;
  }

  private boolean isChannelUnavailable(RuntimeException error) {
    String code = errorCode(error);
    return "COSCO_CHANNELS_UNAVAILABLE".equals(code)
        || "COSCO_UPSTREAM_BLOCKED".equals(code)
        || "COSCO_UPSTREAM_RATE_LIMITED".equals(code)
        || "RATE_LIMITED".equals(code)
        || "ADAPTER_FAILURE".equals(code);
  }

  private boolean isImmediateProtectionFailure(RuntimeException error) {
    if (error instanceof ApiException apiError
        && apiError.status() == HttpStatus.TOO_MANY_REQUESTS) {
      return true;
    }
    String code = errorCode(error);
    return "COSCO_UPSTREAM_BLOCKED".equals(code)
        || "COSCO_UPSTREAM_RATE_LIMITED".equals(code)
        || "RATE_LIMITED".equals(code)
        || "HTTP_429".equals(code);
  }

  private boolean isProtectionFailure(RuntimeException error) {
    String code = errorCode(error);
    return isImmediateProtectionFailure(error)
        || "COSCO_CHANNELS_UNAVAILABLE".equals(code)
        || "COSCO_UPSTREAM_UNAVAILABLE".equals(code);
  }

  private String errorCode(RuntimeException error) {
    if (error instanceof ApiException apiError
        && apiError.code() != null && !apiError.code().isBlank()) {
      return apiError.code();
    }
    return error instanceof ApiException apiError
        ? "HTTP_" + apiError.status().value()
        : "TRACKING_FAILED";
  }

  private void waitUntil(BatchTask task, Instant until) {
    synchronized (throttleMonitor) {
      while (!task.cancelRequested.get()) {
        long remaining = until.toEpochMilli() - clock.instant().toEpochMilli();
        if (remaining <= 0) return;
        try {
          throttleMonitor.wait(Math.min(remaining, 250L));
        } catch (InterruptedException interrupted) {
          Thread.currentThread().interrupt();
          task.cancelRequested.set(true);
          return;
        }
      }
    }
  }

  private void waitForTrackingWindow(BatchTask task) {
    synchronized (throttleMonitor) {
      if (lastTrackingStartedAt > 0) {
        long dueAt = lastTrackingStartedAt + randomInterval();
        while (!task.cancelRequested.get()) {
          long remaining = dueAt - System.currentTimeMillis();
          if (remaining <= 0) break;
          try {
            throttleMonitor.wait(Math.min(remaining, 250L));
          } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            task.cancelRequested.set(true);
            break;
          }
        }
      }
      if (!task.cancelRequested.get()) lastTrackingStartedAt = System.currentTimeMillis();
    }
  }

  private long randomInterval() {
    if (maxIntervalMs <= minIntervalMs) return minIntervalMs;
    double highBiasedJitter = Math.sqrt(ThreadLocalRandom.current().nextDouble());
    return minIntervalMs + Math.round((maxIntervalMs - minIntervalMs) * highBiasedJitter);
  }

  private BatchItem normalizeItem(ShipmentBatchItemRequest request, int index) {
    if (request == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment row " + (index + 1) + " is empty");
    }
    String type = clean(request.type(), 24, "BOOKING").toUpperCase(Locale.ROOT);
    if (!"BOOKING".equals(type)) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Shipment row " + (index + 1) + " must use a booking number"
      );
    }
    String carrier = clean(request.carrier(), 32, null);
    if (carrier != null) carrier = carrier.toUpperCase(Locale.ROOT);
    String number = canonicalBookingNumber(
        carrier,
        type,
        compact(clean(request.number(), 128, null))
    );
    String displayNumber = clean(request.displayNumber(), 128, null);
    ShipmentImportDetails details = sanitizeImportedDetails(request.importedDetails());
    if (displayNumber == null || displayNumber.isBlank()) {
      displayNumber = number;
    }
    if (number.isBlank()) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Shipment row " + (index + 1) + " has no shipment number"
      );
    }
    boolean supportedCarrier = carrier != null && List.of("COSCO", "CMA").contains(carrier);
    boolean manualOnly = Boolean.TRUE.equals(request.manualOnly()) || !supportedCarrier;
    ShipmentBatchItemRequest normalized = new ShipmentBatchItemRequest(
        clean(request.id(), 120, "row-" + (index + 1)),
        carrier,
        type,
        number,
        displayNumber,
        manualOnly,
        details
    );
    return new BatchItem(normalized, number, manualOnly);
  }

  private BatchItem normalizeExistingReference(ShipmentBatchItemRequest request, int index) {
    if (request == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment row " + (index + 1) + " is empty");
    }
    String carrier = clean(request.carrier(), 32, "").toUpperCase(Locale.ROOT);
    String type = clean(request.type(), 24, "").toUpperCase(Locale.ROOT);
    String number = canonicalBookingNumber(
        carrier,
        type,
        compact(clean(request.number(), 128, null))
    );
    if (!List.of("COSCO", "CMA").contains(carrier)
        || !"BOOKING".equals(type)
        || number.isBlank()) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Shipment row " + (index + 1) + " has no supported booking reference"
      );
    }
    String displayNumber = clean(request.displayNumber(), 128, number);
    ShipmentBatchItemRequest normalized = new ShipmentBatchItemRequest(
        clean(request.id(), 120, "refresh-" + (index + 1)),
        carrier,
        type,
        number,
        displayNumber,
        false,
        null
    );
    return new BatchItem(normalized, number, false);
  }

  private String canonicalBookingNumber(String carrier, String type, String number) {
    if ("COSCO".equals(carrier)
        && "BOOKING".equals(type)
        && number.matches("COSU[0-9]{6,20}")) {
      return number.substring(4);
    }
    return number;
  }

  private ShipmentImportDetails sanitizeImportedDetails(ShipmentImportDetails details) {
    if (details == null) return null;
    String prefix = clean(details.carrierPrefix(), 8, null);
    if (prefix != null) prefix = prefix.toUpperCase(Locale.ROOT);
    String originalBill = compact(clean(details.originalBillOfLading(), 64, null));
    ShipmentImportDetails sanitized = new ShipmentImportDetails(
        prefix,
        originalBill.isBlank() ? null : originalBill,
        clean(details.forwarderJobNumber(), 160, null),
        clean(details.vesselVoyage(), 240, null),
        clean(details.portOfLoading(), 160, null),
        clean(details.portOfDischarge(), 160, null),
        clean(details.clientPoNumber(), 160, null),
        clean(details.estimatedDeparture(), 80, null),
        clean(details.estimatedArrival(), 80, null),
        clean(details.volume(), 80, null),
        clean(details.clientNameCode(), 160, null)
    );
    return java.util.stream.Stream.of(
        sanitized.carrierPrefix(), sanitized.originalBillOfLading(),
        sanitized.forwarderJobNumber(), sanitized.vesselVoyage(),
        sanitized.portOfLoading(), sanitized.portOfDischarge(),
        sanitized.clientPoNumber(), sanitized.estimatedDeparture(),
        sanitized.estimatedArrival(), sanitized.volume(), sanitized.clientNameCode()
    ).anyMatch(value -> value != null && !value.isBlank()) ? sanitized : null;
  }

  private BatchTask requireOwnedTask(String taskId, AuthenticatedUser user) {
    String normalized = taskId == null ? "" : taskId.trim();
    BatchTask task = tasks.get(normalized);
    if (task == null) throw new ApiException(HttpStatus.NOT_FOUND, "Batch task not found");
    if (!user.isAdmin() && task.owner.id() != user.id()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Batch task access has not been granted");
    }
    return task;
  }

  private Map<String, Object> snapshot(BatchTask task) {
    synchronized (task) {
      Instant snapshotAt = clock.instant();
      int succeeded = 0;
      int failed = 0;
      int partial = 0;
      int manual = 0;
      int pending = 0;
      List<Map<String, Object>> items = new ArrayList<>();
      for (BatchItem item : task.items) {
        switch (item.status) {
          case "SUCCEEDED" -> succeeded++;
          case "FAILED" -> failed++;
          case "PARTIAL" -> partial++;
          case "MANUAL" -> manual++;
          default -> pending++;
        }
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("id", item.request.id());
        value.put("carrier", item.request.carrier());
        value.put("type", item.request.type());
        value.put("number", item.request.number());
        value.put("displayNumber", item.request.displayNumber());
        value.put("manualOnly", item.manualOnly);
        value.put("importedDetails", item.request.importedDetails());
        value.put("status", item.status);
        value.put("source", item.source);
        value.put("mainStatus", item.mainStatus);
        value.put("mainSource", item.mainSource);
        value.put("mainChannel", item.mainChannel);
        value.put("mainFetchedAt", item.mainFetchedAt);
        value.put("mainCacheStale", item.mainCacheStale);
        value.put("mainDataChanged", item.dataChanged);
        value.put("mainError", item.mainError);
        value.put("mainErrorCode", item.mainErrorCode);
        value.put("error", item.error);
        value.put("errorCode", item.errorCode);
        value.put("errorDetails", new LinkedHashMap<>(item.errorDetails));
        value.put("attempts", item.attempts);
        value.put("proxyAttempts", item.proxyAttempts);
        value.put("proxyNode", item.proxyNode);
        value.put("triedProxyNodes", List.copyOf(item.triedProxyNodes));
        value.put("supplementalRetryPending", item.supplementalRetryPending);
        value.put("nextRetryAt", iso(item.nextRetryAt));
        value.put("shipmentId", item.shipmentId);
        value.put("startedAt", iso(item.startedAt));
        value.put("finishedAt", iso(item.finishedAt));
        value.put("elapsedMs", elapsedMs(item.startedAt, item.finishedAt, snapshotAt));
        value.put("updatedAt", iso(item.updatedAt));
        value.put("subtasks", item.subtasks.stream().map(LinkedHashMap::new).toList());
        value.put("subtaskTotal", item.subtasks.size());
        value.put(
            "subtaskProcessed",
            item.subtasks.stream()
                .filter(subtask -> List.of("SUCCEEDED", "FAILED").contains(subtask.get("status")))
                .count()
        );
        items.add(value);
      }
      Map<String, Object> value = new LinkedHashMap<>();
      value.put("taskId", task.id);
      value.put("sourceFileName", task.sourceFileName);
      value.put("channel", task.channel);
      value.put("mode", task.mode);
      value.put("customerId", task.customerId);
      value.put("publishToCustomer", task.publishToCustomer);
      value.put("status", task.status);
      value.put("cancelRequested", task.cancelRequested.get());
      value.put("total", task.items.size());
      value.put("ignoredDuplicateCount", task.ignoredDuplicateCount);
      value.put("succeeded", succeeded);
      value.put("failed", failed);
      value.put("partial", partial);
      value.put("manual", manual);
      value.put("pending", pending);
      value.put("processed", succeeded + failed + partial + manual);
      value.put("createdAt", iso(task.createdAt));
      value.put("startedAt", iso(task.startedAt));
      value.put("updatedAt", iso(task.updatedAt));
      value.put("finishedAt", iso(task.finishedAt));
      value.put("elapsedMs", elapsedMs(task.startedAt, task.finishedAt, snapshotAt));
      value.put("cooldownUntil", iso(task.cooldownUntil));
      value.put("nextAttemptAt", iso(task.nextAttemptAt));
      value.put("stopReason", task.stopReason);
      value.put("stopMessage", task.stopMessage);
      value.put("circuitFailureCount", task.consecutiveCircuitFailures);
      value.put("circuitFailureThreshold", BATCH_CIRCUIT_FAILURE_THRESHOLD);
      value.put("circuitErrorCode", task.circuitErrorCode);
      value.put("items", items);
      return value;
    }
  }

  private void pruneExpiredTasks() {
    Instant cutoff = clock.instant().minusSeconds(TASK_RETENTION_SECONDS);
    tasks.entrySet().removeIf(entry -> {
      BatchTask task = entry.getValue();
      return task.terminal() && task.updatedAt != null && task.updatedAt.isBefore(cutoff);
    });
  }

  private boolean isCancellation(RuntimeException error) {
    if (error instanceof ApiException apiError && "BATCH_CANCELLED".equals(apiError.code())) {
      return true;
    }
    String message = error.getMessage();
    return message != null
        && message.toLowerCase(Locale.ROOT).contains("batch")
        && message.toLowerCase(Locale.ROOT).contains("cancel");
  }

  private String safeMessage(RuntimeException error) {
    String message = error.getMessage();
    if (message == null || message.isBlank()) return "Shipment processing failed";
    return message.length() <= 4_000 ? message : message.substring(0, 4_000);
  }

  private void requireManager(AuthenticatedUser user) {
    if (user == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Sign in is required");
    if (!user.canManageShipmentFiles()) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Business user or administrator permission is required"
      );
    }
  }

  private String clean(String value, int limit, String fallback) {
    if (value == null || value.isBlank()) return fallback;
    String cleaned = value.replaceAll("\\s+", " ").trim();
    return cleaned.length() <= limit ? cleaned : cleaned.substring(0, limit);
  }

  private String normalizeChannel(String value) {
    String channel = clean(value, 24, "AUTO").toUpperCase(Locale.ROOT);
    if (!SUPPORTED_CHANNELS.contains(channel)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported tracking channel");
    }
    return channel;
  }

  private String compact(String value) {
    if (value == null) return "";
    return Normalizer.normalize(value, Normalizer.Form.NFKC)
        .replaceAll("\\s+", "")
        .toUpperCase(Locale.ROOT);
  }

  private String iso(Instant value) {
    return value == null ? null : value.toString();
  }

  private long elapsedMs(Instant startedAt, Instant finishedAt, Instant snapshotAt) {
    if (startedAt == null) return 0L;
    Instant end = finishedAt == null ? snapshotAt : finishedAt;
    return Math.max(0L, Duration.between(startedAt, end).toMillis());
  }

  @PreDestroy
  void shutdown() {
    executor.shutdownNow();
  }

  private static final class BatchTask {
    private final String id;
    private final AuthenticatedUser owner;
    private final String sourceFileName;
    private final List<BatchItem> items;
    private final String channel;
    private final String mode;
    private final boolean forceRefresh;
    private final String customerId;
    private final boolean publishToCustomer;
    private final int ignoredDuplicateCount;
    private final AtomicBoolean cancelRequested = new AtomicBoolean(false);
    private final Instant createdAt;
    private volatile String status = "QUEUED";
    private volatile Instant startedAt;
    private volatile Instant updatedAt;
    private volatile Instant finishedAt;
    private volatile Instant cooldownUntil;
    private volatile Instant nextAttemptAt;
    private volatile String stopReason;
    private volatile String stopMessage;
    private int consecutiveCircuitFailures;
    private String circuitErrorCode;

    private BatchTask(
        String id,
        AuthenticatedUser owner,
        String sourceFileName,
        List<BatchItem> items,
        String channel,
        String mode,
        boolean forceRefresh,
        String customerId,
        boolean publishToCustomer,
        int ignoredDuplicateCount,
        Instant createdAt
    ) {
      this.id = id;
      this.owner = owner;
      this.sourceFileName = sourceFileName;
      this.items = items;
      this.channel = channel;
      this.mode = mode;
      this.forceRefresh = forceRefresh;
      this.customerId = customerId;
      this.publishToCustomer = publishToCustomer;
      this.ignoredDuplicateCount = Math.max(0, ignoredDuplicateCount);
      this.createdAt = createdAt;
      this.updatedAt = createdAt;
    }

    private boolean terminal() {
      return "COMPLETED".equals(status)
          || "STOPPED".equals(status)
          || "PAUSED".equals(status);
    }
  }

  private static final class CarrierChannelState {
    private Instant cooldownUntil;
    private int consecutiveFailures;
  }

  private static final class BatchItem {
    private final ShipmentBatchItemRequest request;
    private final String queryNumber;
    private final boolean manualOnly;
    private String status = "PENDING";
    private String source;
    private String mainStatus = "PENDING";
    private String mainSource;
    private String mainChannel;
    private String mainFetchedAt;
    private boolean mainCacheStale;
    private Boolean dataChanged;
    private String mainError;
    private String mainErrorCode;
    private String error;
    private String errorCode;
    private Map<String, Object> errorDetails = new LinkedHashMap<>();
    private int attempts;
    private int proxyAttempts;
    private String proxyNode;
    private List<String> triedProxyNodes = List.of();
    private boolean supplementalRetryPending;
    private Instant nextRetryAt;
    private String shipmentId;
    private Instant startedAt;
    private Instant finishedAt;
    private Instant updatedAt;
    private final List<Map<String, Object>> subtasks = new ArrayList<>();

    private BatchItem(
        ShipmentBatchItemRequest request,
        String queryNumber,
        boolean manualOnly
    ) {
      this.request = request;
      this.queryNumber = queryNumber;
      this.manualOnly = manualOnly;
    }
  }

  private record SupplementalFailure(
      String message,
      String code,
      int proxyAttempts,
      String route,
      String proxyNode,
      List<String> triedNodes
  ) {
    private SupplementalFailure(String message, String code, int proxyAttempts) {
      this(message, code, proxyAttempts, null, null, List.of());
    }
  }

  private static final class ProtectionPauseException extends RuntimeException {
    private ProtectionPauseException(RuntimeException cause) {
      super(cause);
    }
  }
}
