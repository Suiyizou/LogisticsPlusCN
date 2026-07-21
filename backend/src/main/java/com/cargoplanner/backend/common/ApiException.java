package com.cargoplanner.backend.common;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
  private final HttpStatus status;
  private final String code;
  private final Long retryAfterMs;

  public ApiException(HttpStatus status, String message) {
    this(status, null, message, null);
  }

  public ApiException(HttpStatus status, String code, String message) {
    this(status, code, message, null);
  }

  public ApiException(HttpStatus status, String code, String message, Long retryAfterMs) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs == null ? null : Math.max(0L, retryAfterMs);
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
}
