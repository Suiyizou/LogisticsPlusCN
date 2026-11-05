package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.BusinessCustomerService;
import com.cargoplanner.backend.customer.CustomerShipmentBindingRequest;
import com.cargoplanner.backend.customer.ShipmentPublicationRequest;
import com.cargoplanner.backend.shipment.PublishedShipmentTaskRepository.Item;
import com.cargoplanner.backend.shipment.PublishedShipmentTaskRepository.ItemKey;
import com.cargoplanner.backend.shipment.PublishedShipmentTaskRepository.Outcome;
import com.cargoplanner.backend.shipment.PublishedShipmentTaskRepository.Task;
import com.cargoplanner.backend.shipment.TrackingAdapterClient.NormalizedTrackRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
class PublishedShipmentTaskWorker {
  private static final Logger LOG = LoggerFactory.getLogger(PublishedShipmentTaskWorker.class);
  private static final Set<String> TERMINAL_JOB_STATES = Set.of("completed", "completed_with_gaps", "failed");
  private static final Set<String> WAIT_FOR_DESKTOP = Set.of(
      "TRACKING_LOCAL_UNAVAILABLE", "TRACKING_LOCAL_TIMEOUT", "TRACKING_LOCAL_HTTP_ERROR",
      "TRACKING_LOCAL_INVALID_RESPONSE", "TRACKING_LOCAL_UNAUTHORIZED", "TRACKING_LOCAL_JOB_NOT_FOUND",
      "TRACKING_LOCAL_OPERATION_UNSUPPORTED", "TRACKING_LOCAL_RESULT_NOT_READY"
  );

  private final PublishedShipmentTaskRepository repository;
  private final PublishedShipmentTaskService tasks;
  private final ShipmentTrackingService tracking;
  private final TrackingAdapterClient adapter;
  private final BusinessCustomerService customers;
  private final TransactionTemplate transactions;
  private final Clock clock;
  private final Duration leaseDuration;
  private final Duration pollInterval;
  private final Duration itemInterval;
  private final AtomicBoolean scheduled = new AtomicBoolean();
  private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
    Thread thread = new Thread(runnable, "published-shipment-task");
    thread.setDaemon(true);
    return thread;
  });

  @Autowired
  PublishedShipmentTaskWorker(PublishedShipmentTaskRepository repository, PublishedShipmentTaskService tasks,
      ShipmentTrackingService tracking, TrackingAdapterClient adapter, BusinessCustomerService customers,
      PlatformTransactionManager transactionManager, ShipmentTrackingProperties properties) {
    this(repository, tasks, tracking, adapter, customers, transactionManager, properties, Clock.systemUTC(),
        Duration.ofMillis(ShipmentBatchTrackingService.DEFAULT_MIN_INTERVAL_MS));
  }

  PublishedShipmentTaskWorker(PublishedShipmentTaskRepository repository, PublishedShipmentTaskService tasks,
      ShipmentTrackingService tracking, TrackingAdapterClient adapter, BusinessCustomerService customers,
      PlatformTransactionManager transactionManager, ShipmentTrackingProperties properties,
      Clock clock, Duration itemInterval) {
    this.repository = repository;
    this.tasks = tasks;
    this.tracking = tracking;
    this.adapter = adapter;
    this.customers = customers;
    this.transactions = new TransactionTemplate(transactionManager);
    this.clock = clock;
    this.leaseDuration = properties.getLocalRequestTimeout().multipliedBy(2).plusSeconds(30);
    this.pollInterval = properties.getLocalPollInterval();
    this.itemInterval = itemInterval;
  }

  @Scheduled(fixedDelay = 1_000)
  void schedule() {
    if (executor.isShutdown() || !scheduled.compareAndSet(false, true)) return;
    executor.execute(() -> {
      try {
        runDue();
      } catch (RuntimeException error) {
        LOG.warn("Could not process durable shipment tasks", error);
      } finally {
        scheduled.set(false);
      }
    });
  }

  void runDue() {
    for (ItemKey key : repository.due(clock.instant())) {
      if (Thread.currentThread().isInterrupted()) break;
      runStep(key);
    }
  }

  private void runStep(ItemKey key) {
    String token = UUID.randomUUID().toString();
    Work work = transactions.execute(transaction -> {
      Task task = repository.findTask(key.taskId(), true);
      Instant now = clock.instant();
      if (task == null || !repository.claim(key, token, now, now.plus(leaseDuration))) return null;
      Item item = repository.findItem(key);
      String status = task.cancelled() ? "STOPPING" : "WAITING".equals(item.status()) ? "WAITING" : "RUNNING";
      repository.setTaskProgress(task, status, now, true, false);
      return new Work(task, item);
    });
    if (work == null) return;
    try {
      if (work.task().cancelled()) {
        record(work, cancelDesktopJob(work.item()));
      } else if (work.item().result() != null || Boolean.TRUE.equals(work.item().input().manualOnly())) {
        persist(work);
      } else {
        record(work, queryDesktop(work));
      }
    } catch (ApiException error) {
      if (Thread.currentThread().isInterrupted()) return;
      record(work, onApiFailure(work, error));
    } catch (RuntimeException error) {
      if (Thread.currentThread().isInterrupted()) return;
      if (!(error instanceof TransientDataAccessException)) {
        LOG.warn("Could not process shipment task {} row {}", key.taskId(), key.row(), error);
      }
      boolean saving = work.item().result() != null || Boolean.TRUE.equals(work.item().input().manualOnly());
      record(work, waitToRetry(work.item(), saving ? "PERSISTING" : "WAITING",
          saving ? "RESULT_PERSISTENCE_RETRY" : "TASK_STEP_RETRY",
          saving ? "Could not save the shipment yet" : "Could not reconcile the desktop job yet"));
    }
  }

  private Outcome queryDesktop(Work work) {
    Task task = work.task();
    Item item = work.item();
    AuthenticatedUser owner = tasks.executionOwner(task);
    boolean submitting = item.jobId() == null;
    if (submitting) authorizeCustomer(task, owner);
    NormalizedTrackRequest request = tracking.validatePublishedRequest(
        PublishedShipmentTaskService.trackRequest(task, item.input()),
        owner, submitting && !PublishedShipmentTaskService.queryOnly(task));
    LocalTrackingQueueClient queue = adapter.requireLocalQueue();
    if (submitting) {
      boolean mayDispatch = Boolean.TRUE.equals(transactions.execute(transaction -> {
        Task current = repository.findTask(task.id(), true);
        if (current == null || current.cancelled() || !ownsLease(item)) return false;
        repository.markDispatchStarted(item, clock.instant());
        return true;
      }));
      if (!mayDispatch) return again("WAITING", null);
      String jobId = queue.submitPublished(request, item.dispatchKey());
      return again("RUNNING", jobId);
    }
    LocalTrackingQueueClient.PublishedProgress progress = queue.publishedStatus(request, item.jobId());
    String status = progress.status();
    if ("cancelled".equals(status)) {
      return new Outcome("FAILED", null, null, null, null, "TRACKING_CANCELLED",
          "The desktop queue cancelled the tracking job", 0, null);
    }
    if (!TERMINAL_JOB_STATES.contains(status)) return again("RUNNING", null);
    JsonNode result = null;
    try {
      result = queue.publishedResult(item.jobId());
    } catch (ApiException error) {
      // A failed job can lack a result file. Its verified progress still settles this attempt.
      if (progress.itemFailure() == null || Thread.currentThread().isInterrupted()) throw error;
    }
    if (progress.itemFailure() != null) {
      return new Outcome("FAILED", null, result, null, null, progress.itemFailure().code(),
          progress.itemFailure().getMessage(), 0, null);
    }
    return new Outcome("PERSISTING", null, result, null, null, null, null, 0, clock.instant());
  }

  private void persist(Work work) {
    Item item = work.item();
    transactions.executeWithoutResult(transaction -> {
      Task task = repository.findTask(work.task().id(), true);
      if (task == null || !ownsLease(item)) return;
      if (task.cancelled()) {
        advance(task, item, new Outcome("CANCELLED", null, null, null, null, null, null, 0, null));
        return;
      }
      AuthenticatedUser owner = tasks.executionOwner(task);
      authorizeCustomer(task, owner);
      ShipmentTrackRequest request = PublishedShipmentTaskService.trackRequest(task, item.input());
      boolean manual = Boolean.TRUE.equals(item.input().manualOnly());
      ObjectNode response;
      if (manual) {
        response = tracking.recordImportedPlaceholder(item.input(), owner);
      } else {
        NormalizedTrackRequest normalized = tracking.validatePublishedRequest(request, owner, false);
        response = adapter.requireLocalQueue().mapPublishedResult(normalized, item.result(), item.jobId());
        if (PublishedShipmentTaskService.queryOnly(task)) {
          ShipmentTrackingService.markSingleResponse(response);
          advance(task, item, new Outcome("SUCCEEDED", null, null, response, null, null, null, 0, null));
          return;
        }
        response = tracking.persistPublishedResult(request, response, owner);
      }
      String shipmentId = response.path("shipmentId").asText(null);
      if (shipmentId == null || shipmentId.isBlank()) {
        throw new ApiException(HttpStatus.BAD_GATEWAY, "UPSTREAM_EMPTY",
            "Tracking returned no shipment that can be saved");
      }
      String auditSource = "batch:" + task.id();
      customers.bindShipment(task.draft().customerId(),
          new CustomerShipmentBindingRequest(shipmentId, null, null, null), owner, auditSource);
      if (Boolean.TRUE.equals(task.draft().publishToCustomer())) {
        customers.setShipmentPublication(task.draft().customerId(), shipmentId,
            new ShipmentPublicationRequest(true), owner, auditSource);
      }
      advance(task, item, new Outcome(manual ? "MANUAL" : "SUCCEEDED", null, null, null, shipmentId,
          null, null, 0, null));
    });
  }

  private void authorizeCustomer(Task task, AuthenticatedUser owner) {
    if (!PublishedShipmentTaskService.queryOnly(task)) {
      customers.requireShipmentImportCustomer(task.draft().customerId(), owner);
    }
  }

  private Outcome cancelDesktopJob(Item item) {
    if (item.dispatched() == null || item.result() != null) {
      return new Outcome("CANCELLED", null, null, null, null, null, null, 0, null);
    }
    LocalTrackingQueueClient queue = adapter.requireLocalQueue();
    String jobId = item.jobId() == null ? queue.findPublishedJob(item.dispatchKey()) : item.jobId();
    if (jobId == null && clock.instant().isBefore(item.dispatched().plus(leaseDuration))) {
      return again("WAITING", null);
    }
    boolean cancelled = jobId == null || queue.cancelPublished(jobId);
    return cancelled
        ? new Outcome("CANCELLED", jobId, null, null, null, null, null, 0, null)
        : again("RUNNING", jobId);
  }

  private Outcome onApiFailure(Work work, ApiException error) {
    Item item = work.item();
    String code = error.code() == null ? "HTTP_" + error.status().value() : error.code();
    if (work.task().cancelled()) {
      return waitToRetry(item, "WAITING", code, error.getMessage());
    }
    if (item.result() == null && WAIT_FOR_DESKTOP.contains(code)) {
      return waitToRetry(item, "WAITING", code, error.getMessage());
    }
    return new Outcome("FAILED", null, null, null, null, code, error.getMessage(), 0, null);
  }

  private Outcome waitToRetry(Item item, String status, String code, String message) {
    int failures = Math.min(30, item.failures() + 1);
    long seconds = Math.min(300L, 5L << Math.min(6, failures - 1));
    return new Outcome(status, null, null, null, null, code, message,
        failures, clock.instant().plusSeconds(seconds));
  }

  private Outcome again(String status, String jobId) {
    return new Outcome(status, jobId, null, null, null, null, null, 0, clock.instant().plus(pollInterval));
  }

  private void record(Work work, Outcome outcome) {
    transactions.executeWithoutResult(transaction -> {
      Task task = repository.findTask(work.task().id(), true);
      if (task != null && ownsLease(work.item())) advance(task, work.item(), outcome);
    });
  }

  private boolean ownsLease(Item item) {
    Item current = repository.findItem(item.key());
    return current != null && item.run() == current.run() && item.lease().equals(current.lease());
  }

  private void advance(Task task, Item item, Outcome outcome) {
    Instant now = clock.instant();
    repository.advance(item, outcome, now);
    if (!task.cancelled() && outcome.nextAttempt() == null && item.dispatched() != null) {
      repository.delayNextItem(item, now.plus(itemInterval));
    }
    repository.refreshTaskProgress(task.id(), now);
  }

  @PreDestroy
  void shutdown() {
    executor.shutdownNow();
  }

  private record Work(Task task, Item item) {}
}
