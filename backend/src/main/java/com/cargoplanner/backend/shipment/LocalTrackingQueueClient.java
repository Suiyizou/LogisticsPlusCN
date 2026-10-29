package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.shipment.TrackingAdapterClient.NormalizedTrackRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.springframework.http.HttpStatus;

/** Server-side bridge to the desktop Chrome queue; never launches a cloud browser. */
final class LocalTrackingQueueClient {
  private static final ObjectMapper JSON = new ObjectMapper();
  private final ShipmentTrackingProperties properties;
  private final HttpClient client;
  private final URI baseUri;
  private final TrackingV1SnapshotMapper mapper = new TrackingV1SnapshotMapper(JSON);
  private final LocalTrackingHealth health = new LocalTrackingHealth(JSON);
  // The desktop service currently shares one browser page between jobs.
  private final Semaphore slot = new Semaphore(1, true);
  private final Map<String, Set<String>> activeJobs = new ConcurrentHashMap<>();
  private final Map<String, Instant> cancelledBatches = new ConcurrentHashMap<>();

  LocalTrackingQueueClient(ShipmentTrackingProperties properties) {
    this.properties = properties;
    String base = properties.getLocalBaseUrl().trim().replaceAll("/+$", "");
    baseUri = URI.create(base + "/");
    if (!List.of("http", "https").contains(baseUri.getScheme())
        || baseUri.getHost() == null || baseUri.getRawUserInfo() != null
        || baseUri.getRawQuery() != null || baseUri.getRawFragment() != null) {
      throw new IllegalArgumentException("Local tracking base URL must be an HTTP(S) service URL");
    }
    requirePositive(properties.getLocalJobTimeout());
    requirePositive(properties.getLocalPollInterval());
    requirePositive(properties.getLocalRequestTimeout());
    client = HttpClient.newBuilder()
        .connectTimeout(properties.getConnectTimeout())
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
  }

  JsonNode track(NormalizedTrackRequest request) {
    request = new NormalizedTrackRequest(TrackingCarriers.canonicalCode(request.carrier()),
        request.channel(), request.type(), request.number(), request.batchTaskId());
    if (!TrackingCarriers.CODES.contains(request.carrier())
        || !List.of("BOOKING", "BILLOFLADING").contains(request.type())) {
      throw failure(HttpStatus.BAD_REQUEST, "INVALID_REFERENCE",
          "Local tracking requires a supported carrier and booking or bill of lading reference", null);
    }
    long deadline = System.nanoTime() + properties.getLocalJobTimeout().toNanos();
    String batch = request.batchTaskId();
    String job = null;
    boolean acquired = false;
    boolean finished = false;
    try {
      pruneCancelledBatches();
      while (!acquired) {
        checkCancelled(batch);
        acquired = slot.tryAcquire(Math.min(remainingMillis(deadline), pollMillis()), TimeUnit.MILLISECONDS);
      }
      checkCancelled(batch);
      String carrier = "CMA".equals(request.carrier()) ? "CMA_CGM" : request.carrier();
      JsonNode accepted = exchange("POST", "jobs", Map.of(
          "items", List.of(Map.of("carrier", carrier, "reference", request.number())),
          "source", "LogisticsPlusCN"
      ), deadline);
      job = accepted.path("job_id").asText("");
      if (!job.matches("[A-Za-z0-9_-]{1,100}")) throw invalidResponse(null);
      if (batch != null) {
        String acceptedJob = job;
        activeJobs.compute(batch, (ignored, jobs) -> {
          Set<String> values = jobs == null ? ConcurrentHashMap.newKeySet() : jobs;
          values.add(acceptedJob);
          return values;
        });
      }
      checkCancelled(batch);
      while (true) {
        checkCancelled(batch);
        JsonNode progress = exchange("GET", "jobs/" + job, null, deadline);
        if (!job.equals(progress.path("id").asText())) throw invalidResponse(job);
        String jobState = progress.path("status").asText();
        if (!List.of("queued", "running", "completed", "completed_with_gaps", "failed", "cancelled")
            .contains(jobState)) throw invalidResponse(job);
        if (List.of("completed", "completed_with_gaps", "failed", "cancelled").contains(jobState)) finished = true;
        if (!"cancelled".equals(jobState)) {
          String itemState = progressItemState(progress, request, job);
          if (!List.of("PENDING", "RUNNING", "DONE").contains(itemState)) {
            finished = true;
            requireSuccessfulQuery(itemState, job);
          }
        }
        switch (progress.path("status").asText()) {
          case "completed", "completed_with_gaps": {
            JsonNode result;
            try {
              result = exchange("GET", "jobs/" + job + "/result", null, deadline);
            } catch (ApiException error) {
              if (!"TRACKING_LOCAL_RESULT_NOT_READY".equals(error.code())) throw error;
              pause(deadline);
              continue;
            }
            finished = true;
            checkCancelled(batch);
            JsonNode record = selectRecord(result, request, carrier, job);
            JsonNode envelope = mapper.map(record, request,
                result.path("generated_at").asText(Instant.now().toString()), job);
            health.recordQuerySuccess();
            return envelope;
          }
          case "failed":
            throw failure(HttpStatus.BAD_GATEWAY, "TRACKING_LOCAL_JOB_FAILED",
                "The desktop tracking job failed; check the local service and Chrome", job);
          case "cancelled":
            throw cancelled(job);
          case "queued", "running":
            pause(deadline);
            break;
          default:
            throw invalidResponse(job);
        }
      }
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      if (!finished) cancelQuietly(job);
      throw cancelled(job);
    } catch (ApiException error) {
      if (!finished) cancelQuietly(job);
      throw error;
    } finally {
      if (job != null && batch != null) {
        Set<String> jobs = activeJobs.get(batch);
        if (jobs != null) jobs.remove(job);
      }
      if (acquired) slot.release();
    }
  }

  JsonNode localHealth() {
    JsonNode response = exchange("GET", "health", null,
        System.nanoTime() + properties.getLocalRequestTimeout().toNanos());
    if (!response.path("ok").asBoolean(false)) throw invalidResponse(null);
    return health.snapshot(response, properties.getLocalToken() != null && !properties.getLocalToken().isBlank());
  }

  JsonNode localCanary(NormalizedTrackRequest request) {
    try {
      JsonNode envelope = track(request);
      health.recordCanarySuccess();
      return JSON.createObjectNode().put("status", "SUCCEEDED").put("verified", true)
          .put("persisted", false).put("checkedAt", Instant.now().toString())
          .put("localJobId", envelope.path("snapshot").path("sourceDetails").path("jobId").asText());
    } catch (ApiException error) {
      health.recordCanaryFailure(error.code());
      throw error;
    }
  }

  JsonNode cancelBatchTask(String batch) {
    pruneCancelledBatches();
    cancelledBatches.put(batch, Instant.now());
    int count = 0;
    for (String job : activeJobs.getOrDefault(batch, Set.of())) {
      exchange("POST", "jobs/" + job + "/cancel", Map.of(),
          System.nanoTime() + properties.getLocalRequestTimeout().toNanos());
      count++;
    }
    return JSON.createObjectNode().put("taskId", batch).put("cancelled", true).put("cancelledJobs", count);
  }

  private JsonNode selectRecord(JsonNode result, NormalizedTrackRequest request, String carrier, String job) {
    if (!"tracking.v1".equals(result.path("schema").asText())
        || !result.path("shipments").isArray() || result.path("shipments").size() != 1
        || !job.equals(result.path("batch").path("id").asText())) throw invalidResponse(job);
    JsonNode record = result.path("shipments").get(0);
    if (!"tracking.v1".equals(record.path("schema").asText())
        || !carrier.equals(record.path("carrier").path("code").asText())
        || !request.number().equals(record.path("query").path("reference_input").asText())
        || !record.path("shipment").isObject()) throw invalidResponse(job);
    requireSuccessfulQuery(record.path("query").path("status").asText(), job);
    return record;
  }

  private String progressItemState(JsonNode progress, NormalizedTrackRequest request, String job) {
    // Older queue implementations may omit items. When supplied, their identity and
    // failure state are authoritative even before a canonical result file exists.
    if (!progress.has("items")) return "PENDING";
    JsonNode items = progress.path("items");
    if (!items.isArray() || items.size() != 1) throw invalidResponse(job);
    JsonNode item = items.get(0);
    if (!request.carrier().equals(TrackingCarriers.canonicalCode(item.path("carrier").asText()))
        || !request.number().equals(item.path("reference").asText())) throw invalidResponse(job);
    String state = item.path("status").asText().toUpperCase(Locale.ROOT);
    if (!List.of("PENDING", "RUNNING", "DONE", "HUMAN_REQUIRED", "NO_BUSINESS_DATA",
        "CARRIER_NOT_IMPLEMENTED", "FAILED", "MATCHED_NO_STRUCTURE").contains(state)) throw invalidResponse(job);
    return state;
  }

  private void requireSuccessfulQuery(String value, String job) {
    String state = value.toUpperCase(Locale.ROOT);
    switch (state) {
      case "QUERY_COMPLETED": return;
      case "HUMAN_REQUIRED":
        throw failure(HttpStatus.CONFLICT, "TRACKING_HUMAN_REQUIRED",
            "The carrier requires manual verification in the local Chrome session", job);
      case "NO_BUSINESS_DATA":
        throw failure(HttpStatus.NOT_FOUND, "TRACKING_NO_BUSINESS_DATA",
            "The carrier returned no business data for this reference", job);
      case "MATCHED_NO_STRUCTURE":
        throw failure(HttpStatus.BAD_GATEWAY, "UPSTREAM_EMPTY",
            "The carrier page matched but returned no structured tracking data", job);
      case "CARRIER_NOT_IMPLEMENTED":
        throw failure(HttpStatus.NOT_FOUND, "UNSUPPORTED_CARRIER",
            "This carrier is not implemented by the local tracking service", job);
      case "FAILED":
        throw failure(HttpStatus.BAD_GATEWAY, "TRACKING_QUERY_FAILED", "The local carrier query failed", job);
      default: throw invalidResponse(job);
    }
  }

  private JsonNode exchange(String method, String path, Object body, long deadline) {
    try {
      Duration timeout = Duration.ofMillis(Math.min(remainingMillis(deadline),
          properties.getLocalRequestTimeout().toMillis()));
      HttpRequest.Builder builder = HttpRequest.newBuilder(baseUri.resolve(path))
          .timeout(timeout).header("Accept", "application/json");
      String token = properties.getLocalToken();
      if (token != null && !token.isBlank()) builder.header("Authorization", "Bearer " + token.trim());
      if ("POST".equals(method)) {
        builder.header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)));
      } else builder.GET();
      HttpResponse<String> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
      int status = response.statusCode();
      if (status == 401 || status == 403) throw failure(HttpStatus.BAD_GATEWAY,
          "TRACKING_LOCAL_UNAUTHORIZED", "Local tracking API authentication failed; check the server token", null);
      if (status == 409 && path.endsWith("/result")) {
        throw failure(HttpStatus.CONFLICT, "TRACKING_LOCAL_RESULT_NOT_READY", "Tracking result is not ready", null);
      }
      if (status == 400 && "jobs".equals(path)) throw failure(HttpStatus.BAD_REQUEST,
          "INVALID_REFERENCE", "Local tracking rejected the submitted items or carrier reference", null);
      if (status < 200 || status >= 300) throw failure(HttpStatus.BAD_GATEWAY,
          "TRACKING_LOCAL_HTTP_ERROR", "Local tracking API returned HTTP " + status, null);
      JsonNode value = JSON.readTree(response.body());
      if (value == null || !value.isObject()) throw invalidResponse(null);
      return value;
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw cancelled(null);
    } catch (IOException error) {
      if (error instanceof com.fasterxml.jackson.core.JsonProcessingException) throw invalidResponse(null);
      if (System.nanoTime() >= deadline) throw failure(HttpStatus.GATEWAY_TIMEOUT,
          "TRACKING_LOCAL_TIMEOUT", "The local tracking job exceeded its time limit", null);
      throw failure(HttpStatus.SERVICE_UNAVAILABLE, "TRACKING_LOCAL_UNAVAILABLE",
          "Cannot reach the local tracking API; check the service and tunnel", null);
    }
  }

  private void checkCancelled(String batch) {
    if (Thread.currentThread().isInterrupted() || (batch != null && cancelledBatches.containsKey(batch))) {
      throw cancelled(null);
    }
  }

  private void pause(long deadline) throws InterruptedException {
    Thread.sleep(Math.min(remainingMillis(deadline), pollMillis()));
  }

  private long pollMillis() { return Math.max(1L, properties.getLocalPollInterval().toMillis()); }

  private long remainingMillis(long deadline) {
    long nanos = deadline - System.nanoTime();
    if (nanos <= 0) throw failure(HttpStatus.GATEWAY_TIMEOUT, "TRACKING_LOCAL_TIMEOUT",
        "The local tracking job exceeded its time limit", null);
    return Math.max(1L, TimeUnit.NANOSECONDS.toMillis(nanos));
  }

  private void cancelQuietly(String job) {
    if (job == null) return;
    boolean interrupted = Thread.interrupted();
    try {
      exchange("POST", "jobs/" + job + "/cancel", Map.of(),
          System.nanoTime() + properties.getLocalRequestTimeout().toNanos());
    } catch (ApiException ignored) {
      // Preserve the original failure when the tunnel is unavailable.
    } finally {
      if (interrupted) Thread.currentThread().interrupt();
    }
  }

  private void pruneCancelledBatches() {
    Instant cutoff = Instant.now().minus(Duration.ofDays(1));
    cancelledBatches.entrySet().removeIf(entry -> entry.getValue().isBefore(cutoff));
    activeJobs.entrySet().removeIf(entry -> entry.getValue().isEmpty());
  }

  private static void requirePositive(Duration value) {
    if (value == null || value.isNegative() || value.isZero() || value.toMillis() < 1) {
      throw new IllegalArgumentException("Local tracking timeouts and poll interval must be positive");
    }
  }

  private ApiException invalidResponse(String job) {
    return failure(HttpStatus.BAD_GATEWAY, "TRACKING_LOCAL_INVALID_RESPONSE",
        "Local tracking returned an invalid or mismatched result", job);
  }

  private ApiException cancelled(String job) {
    return failure(HttpStatus.CONFLICT, "TRACKING_CANCELLED", "The tracking request was cancelled", job);
  }

  private ApiException failure(HttpStatus status, String code, String message, String job) {
    return new ApiException(status, code, message, null,
        job == null ? Map.of() : Map.of("localJobId", job));
  }
}
