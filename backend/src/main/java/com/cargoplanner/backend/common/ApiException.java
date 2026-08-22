package com.cargoplanner.backend.common;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
  private final HttpStatus status;
  private final String code;
  private final Long retryAfterMs;
  private final Map<String, Object> details;

  public ApiException(HttpStatus status, String message) {
    this(status, null, message, null, null);
  }

  public ApiException(HttpStatus status, String code, String message) {
    this(status, code, message, null, null);
  }

  public ApiException(HttpStatus status, String code, String message, Long retryAfterMs) {
    this(status, code, message, retryAfterMs, null);
  }

  public ApiException(
      HttpStatus status,
      String code,
      String message,
      Long retryAfterMs,
      Map<String, Object> details
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs == null ? null : Math.max(0L, retryAfterMs);
    this.details = details == null || details.isEmpty()
        ? Map.of()
        : Collections.unmodifiableMap(new LinkedHashMap<>(details));
  }

  public HttpStatus status() {
    return status;
  }

  public String code() {
    return code;
  }

  public Long retryAfterMs() {
    return retryAfterMs;
  }

  public Map<String, Object> details() {
    return details;
  }
}
