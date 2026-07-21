package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Runs imported shipment queues on the server while the browser only monitors progress. */
@Service
public class ShipmentBatchTrackingService {
  static final int MAX_ITEMS = 500;
  static final long DEFAULT_MIN_INTERVAL_MS = 3_000L;
  static final long DEFAULT_MAX_INTERVAL_MS = 6_000L;
  static final int MAX_TRACK_ATTEMPTS = 3;
  static final long DEFAULT_RETRY_BASE_MS = 15_000L;
  static final long DEFAULT_RETRY_MAX_MS = 15 * 60_000L;
  static final long CHANNEL_UNAVAILABLE_COOLDOWN_MS = 2 * 60_000L;
  static final long RATE_LIMIT_COOLDOWN_MS = 15 * 60_000L;
  static final long MAX_INLINE_COOLDOWN_MS = 15 * 60_000L;
  static final long MAX_EXPLICIT_RETRY_AFTER_MS = 24 * 60 * 60_000L;
  private static final long TASK_RETENTION_SECONDS = 24 * 60 * 60;

  private final ShipmentTrackingService trackingService;
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
  private volatile Instant carrierCooldownUntil;
  private int consecutiveCarrierFailures;

  public ShipmentBatchTrackingService(ShipmentTrackingService trackingService) {
    this(
        trackingService,
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
        trackingService, executor, minIntervalMs, maxIntervalMs,
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
    this.trackingService = trackingService;
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
    requireManager(user);
    pruneExpiredTasks();
    List<ShipmentBatchItemRequest> requestedItems = request == null || request.items() == null
        ? List.of()
        : request.items();
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

    List<BatchItem> items = new ArrayList<>();
    for (int index = 0; index < requestedItems.size(); index++) {
      items.add(normalizeItem(requestedItems.get(index), index));
    }
    String taskId = "batch_" + UUID.randomUUID().toString().replace("-", "");
    Instant now = clock.instant();
    BatchTask task = new BatchTask(
        taskId,
        user,
        clean(request == null ? null : request.sourceFileName(), 255, "Imported spreadsheet"),
        items,
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
              item.shipmentId = response.path("shipmentId").asText(null);
              item.error = null;
              item.errorCode = null;
              item.nextRetryAt = null;
              item.updatedAt = clock.instant();
              task.updatedAt = item.updatedAt;
            }
          } else {
            trackWithRetry(task, item);
          }
        } catch (ProtectionPauseException paused) {
          finalStatus = "PAUSED";
          break;
        } catch (RuntimeException error) {
          if (task.cancelRequested.get() || isCancellation(error)) {
            markPendingAfterCancellation(task, item);
            break;
          }
          markFinalFailure(task, item, error);
        }
      }
    } finally {
      finish(task, task.cancelRequested.get() ? "STOPPED" : finalStatus);
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
                "COSCO",
                "AUTO",
                "BILLOFLADING",
                item.queryNumber,
                false,
                item.request.importedDetails(),
                task.id
            ),
            task.owner
        );
        synchronized (throttleMonitor) {
          consecutiveCarrierFailures = 0;
          if (carrierCooldownUntil != null && !carrierCooldownUntil.isAfter(clock.instant())) {
            carrierCooldownUntil = null;
          }
        }
        synchronized (task) {
          item.status = "SUCCEEDED";
          item.source = response.path("cacheSource").asText("LIVE");
          item.shipmentId = response.path("shipmentId").asText(null);
          item.error = null;
          item.errorCode = null;
          item.nextRetryAt = null;
          task.nextAttemptAt = null;
          item.updatedAt = clock.instant();
          task.updatedAt = item.updatedAt;
        }
        return;
      } catch (RuntimeException error) {
        if (task.cancelRequested.get() || isCancellation(error)) throw error;
        if (!isRetryable(error)) throw error;
        boolean protectionFailure = isProtectionFailure(error);
        if (item.attempts >= MAX_TRACK_ATTEMPTS && !protectionFailure) {
          registerCarrierFailure(error, item.attempts);
          throw error;
        }
        Instant retryAt = registerCarrierFailure(error, item.attempts);
        synchronized (task) {
          item.status = "RETRY_WAIT";
          item.source = null;
          item.error = safeMessage(error);
          item.errorCode = errorCode(error);
          item.nextRetryAt = retryAt;
          task.nextAttemptAt = retryAt;
          task.updatedAt = clock.instant();
        }
        if (protectionFailure
            && !isImmediateProtectionFailure(error)
            && (item.attempts >= MAX_TRACK_ATTEMPTS
                || retryAt.isAfter(clock.instant().plusMillis(MAX_INLINE_COOLDOWN_MS)))) {
          throw new ProtectionPauseException(error);
        }
      }
    }
    if (task.cancelRequested.get()) markPendingAfterCancellation(task, item);
  }

  private void markWaitingForTrackingWindow(BatchTask task, BatchItem item) {
    synchronized (task) {
      task.status = "RUNNING";
      item.status = "RUNNING";
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
      item.attempts++;
      item.nextRetryAt = null;
      task.nextAttemptAt = null;
      item.updatedAt = clock.instant();
      task.updatedAt = item.updatedAt;
    }
  }

  private void markPendingAfterCancellation(BatchTask task, BatchItem item) {
    synchronized (task) {
      item.status = "PENDING";
      item.source = null;
      item.error = null;
      item.errorCode = null;
      item.nextRetryAt = null;
      task.nextAttemptAt = null;
      item.updatedAt = clock.instant();
      task.updatedAt = item.updatedAt;
    }
  }

  private void markFinalFailure(BatchTask task, BatchItem item, RuntimeException error) {
    synchronized (task) {
      item.status = "FAILED";
      item.source = null;
      item.error = safeMessage(error);
      item.errorCode = errorCode(error);
      item.nextRetryAt = null;
      task.nextAttemptAt = null;
      item.updatedAt = clock.instant();
      task.updatedAt = item.updatedAt;
    }
  }

  private void finish(BatchTask task, String status) {
    synchronized (task) {
      task.status = status;
      task.nextAttemptAt = null;
      task.cooldownUntil = null;
      task.finishedAt = clock.instant();
      task.updatedAt = task.finishedAt;
    }
    activeTaskByUser.remove(task.owner.id(), task.id);
  }

  private void waitForCarrierCooldown(BatchTask task, BatchItem item) {
    while (!task.cancelRequested.get()) {
      Instant until = carrierCooldownUntil;
      Instant now = clock.instant();
      if (until == null || !until.isAfter(now)) {
        synchronized (throttleMonitor) {
          if (carrierCooldownUntil != null && !carrierCooldownUntil.isAfter(now)) {
            carrierCooldownUntil = null;
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

  private Instant registerCarrierFailure(RuntimeException error, int attempt) {
    long delayMs = retryDelayMs(error, attempt);
    synchronized (throttleMonitor) {
      consecutiveCarrierFailures++;
      if (isImmediateProtectionFailure(error)) {
        delayMs = Math.max(
            delayMs,
            Math.min(RATE_LIMIT_COOLDOWN_MS, retryMaxMs)
        );
      } else if (consecutiveCarrierFailures >= 2 && isChannelUnavailable(error)) {
        delayMs = Math.max(
            delayMs,
            Math.min(CHANNEL_UNAVAILABLE_COOLDOWN_MS, retryMaxMs)
        );
      }
      Instant candidate = clock.instant().plusMillis(delayMs);
      if (carrierCooldownUntil == null || candidate.isAfter(carrierCooldownUntil)) {
        carrierCooldownUntil = candidate;
      }
      throttleMonitor.notifyAll();
      return carrierCooldownUntil;
    }
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
    String type = clean(request.type(), 24, "BILLOFLADING").toUpperCase(Locale.ROOT);
    String number = compact(clean(request.number(), 128, null));
    String displayNumber = clean(request.displayNumber(), 128, null);
    ShipmentImportDetails details = sanitizeImportedDetails(request.importedDetails());
    String originalBill = compact(details == null ? null : details.originalBillOfLading());
    if (displayNumber == null || displayNumber.isBlank()) {
      displayNumber = originalBill.isBlank() ? number : originalBill;
    }
    if (number.isBlank()) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Shipment row " + (index + 1) + " has no shipment number"
      );
    }
    String originalBillCosu = cosuDigits(originalBill);
    String displayNumberCosu = cosuDigits(displayNumber);
    String suppliedNumberCosu = cosuDigits(number);
    List<String> distinctCosuNumbers = java.util.stream.Stream.of(
            originalBillCosu, displayNumberCosu, suppliedNumberCosu
        )
        .filter(value -> value != null && !value.isBlank())
        .distinct()
        .toList();
    if (distinctCosuNumbers.size() > 1) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Shipment row " + (index + 1) + " contains conflicting COSU numbers"
      );
    }
    String matchedCosuNumber = distinctCosuNumbers.isEmpty()
        ? null
        : distinctCosuNumbers.get(0);
    String queryNumber = matchedCosuNumber == null
        ? (number.startsWith("COSU") ? number.substring(4) : number)
        : matchedCosuNumber;
    boolean cosu = "BILLOFLADING".equals(type)
        && "COSCO".equalsIgnoreCase(request.carrier())
        && matchedCosuNumber != null;
    boolean manualOnly = Boolean.TRUE.equals(request.manualOnly()) || !cosu;
    ShipmentBatchItemRequest normalized = new ShipmentBatchItemRequest(
        clean(request.id(), 120, "row-" + (index + 1)),
        cosu ? "COSCO" : clean(request.carrier(), 32, null),
        type,
        number,
        displayNumber,
        manualOnly,
        details
    );
    return new BatchItem(normalized, queryNumber, manualOnly);
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
        value.put("error", item.error);
        value.put("errorCode", item.errorCode);
        value.put("attempts", item.attempts);
        value.put("nextRetryAt", iso(item.nextRetryAt));
        value.put("shipmentId", item.shipmentId);
        value.put("updatedAt", iso(item.updatedAt));
        value.put("subtasks", List.of());
        value.put("subtaskTotal", 0);
        value.put("subtaskProcessed", 0);
        items.add(value);
      }
      Map<String, Object> value = new LinkedHashMap<>();
      value.put("taskId", task.id);
      value.put("sourceFileName", task.sourceFileName);
      value.put("status", task.status);
      value.put("cancelRequested", task.cancelRequested.get());
      value.put("total", task.items.size());
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
      value.put("cooldownUntil", iso(task.cooldownUntil));
      value.put("nextAttemptAt", iso(task.nextAttemptAt));
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
    return message.length() <= 500 ? message : message.substring(0, 500);
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

  private String compact(String value) {
    if (value == null) return "";
    return Normalizer.normalize(value, Normalizer.Form.NFKC)
        .replaceAll("\\s+", "")
        .toUpperCase(Locale.ROOT);
  }

  private String cosuDigits(String value) {
    String normalized = compact(value);
    return normalized.matches("COSU[0-9]{6,20}") ? normalized.substring(4) : null;
  }

  private String iso(Instant value) {
    return value == null ? null : value.toString();
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
    private final AtomicBoolean cancelRequested = new AtomicBoolean(false);
    private final Instant createdAt;
    private volatile String status = "QUEUED";
    private volatile Instant startedAt;
    private volatile Instant updatedAt;
    private volatile Instant finishedAt;
    private volatile Instant cooldownUntil;
    private volatile Instant nextAttemptAt;

    private BatchTask(
        String id,
        AuthenticatedUser owner,
        String sourceFileName,
        List<BatchItem> items,
        Instant createdAt
    ) {
      this.id = id;
      this.owner = owner;
      this.sourceFileName = sourceFileName;
      this.items = items;
      this.createdAt = createdAt;
      this.updatedAt = createdAt;
    }

    private boolean terminal() {
      return "COMPLETED".equals(status)
          || "STOPPED".equals(status)
          || "PAUSED".equals(status);
    }
  }

  private static final class BatchItem {
    private final ShipmentBatchItemRequest request;
    private final String queryNumber;
    private final boolean manualOnly;
    private String status = "PENDING";
    private String source;
    private String error;
    private String errorCode;
    private int attempts;
    private Instant nextRetryAt;
    private String shipmentId;
    private Instant updatedAt;

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

  private static final class ProtectionPauseException extends RuntimeException {
    private ProtectionPauseException(RuntimeException cause) {
      super(cause);
    }
  }
}
