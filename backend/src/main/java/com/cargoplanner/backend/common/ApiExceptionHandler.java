package com.cargoplanner.backend.common;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Map<String, Object>> handleApiException(ApiException error) {
    Map<String, Object> body = body(error.status(), error.getMessage());
    if (error.code() != null && !error.code().isBlank()) body.put("code", error.code());
    ResponseEntity.BodyBuilder response = ResponseEntity.status(error.status());
    if (error.retryAfterMs() != null && error.retryAfterMs() > 0) {
      body.put("retryAfterMs", error.retryAfterMs());
      response.header(
          "Retry-After",
          Long.toString(Math.max(1L, (error.retryAfterMs() + 999L) / 1_000L))
      );
    }
    return response.body(body);
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException error) {
    String message = error.getBindingResult().getFieldErrors().stream()
        .findFirst()
        .map((fieldError) -> fieldError.getField() + " " + fieldError.getDefaultMessage())
        .orElse("Invalid request");
    return ResponseEntity.badRequest().body(body(HttpStatus.BAD_REQUEST, message));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> handleUnexpected(Exception error) {
    return ResponseEntity.internalServerError().body(body(HttpStatus.INTERNAL_SERVER_ERROR, "Server error"));
  }

  private Map<String, Object> body(HttpStatus status, String message) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("timestamp", Instant.now().toString());
    body.put("status", status.value());
    body.put("error", status.getReasonPhrase());
    body.put("message", message);
    return body;
  }
}
