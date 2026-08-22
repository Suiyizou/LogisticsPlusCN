package com.cargoplanner.backend.common;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Component;

@Component
public class RequestStats {
  private final Instant startedAt = Instant.now();
  private final AtomicLong totalRequests = new AtomicLong();
  private final AtomicLong failedRequests = new AtomicLong();
  private final ConcurrentHashMap<String, AtomicLong> endpointHits = new ConcurrentHashMap<>();

  public void record(String method, String path, int status) {
    totalRequests.incrementAndGet();
    if (status >= 500) {
      failedRequests.incrementAndGet();
    }
    endpointHits.computeIfAbsent(method + " " + path, (key) -> new AtomicLong()).incrementAndGet();
  }

  public Map<String, Object> snapshot() {
    Runtime runtime = Runtime.getRuntime();
    long maxMemory = runtime.maxMemory();
    long totalMemory = runtime.totalMemory();
    long freeMemory = runtime.freeMemory();

    Map<String, Object> stats = new LinkedHashMap<>();
    stats.put("startedAt", startedAt.toString());
    stats.put("totalRequests", totalRequests.get());
    stats.put("failedRequests", failedRequests.get());
    stats.put("heapUsedMb", mb(totalMemory - freeMemory));
    stats.put("heapMaxMb", mb(maxMemory));
    stats.put("topEndpoints", topEndpoints());
    return stats;
  }

  private List<Map<String, Object>> topEndpoints() {
    return endpointHits.entrySet().stream()
        .sorted(Comparator.comparingLong((Map.Entry<String, AtomicLong> item) -> item.getValue().get()).reversed())
        .limit(8)
        .map((item) -> {
          Map<String, Object> row = new LinkedHashMap<>();
          row.put("endpoint", item.getKey());
          row.put("hits", item.getValue().get());
          return row;
        })
        .toList();
  }

  private long mb(long bytes) {
    return Math.round(bytes / 1024.0 / 1024.0);
  }
}
