package com.cargoplanner.backend.common;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
  private static final Logger LOGGER = LoggerFactory.getLogger(ApiExceptionHandler.class);

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Map<String, Object>> handleApiException(ApiException error) {
    Map<String, Object> body = body(error.status(), error.getMessage());
    if (error.code() != null && !error.code().isBlank()) body.put("code", error.code());
    if (!error.details().isEmpty()) body.put("details", error.details());
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

  @ExceptionHandler({
      HttpMessageNotReadableException.class,
      ConstraintViolationException.class,
      MissingServletRequestParameterException.class,
      MethodArgumentTypeMismatchException.class
  })
  public ResponseEntity<Map<String, Object>> handleMalformedRequest(Exception error) {
    // Parser/validation causes may contain submitted secrets. Never echo them.
    Map<String, Object> response = body(HttpStatus.BAD_REQUEST, "Invalid request");
    response.put("code", "INVALID_REQUEST");
    return ResponseEntity.badRequest().body(response);
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> handleUnexpected(
      Exception error,
      HttpServletRequest request
  ) {
    String errorId = UUID.randomUUID().toString();
    LOGGER.error(
        "Unhandled request failure errorId={} method={} path={}",
        errorId,
        request.getMethod(),
        request.getRequestURI(),
        error
    );
    Map<String, Object> body = body(HttpStatus.INTERNAL_SERVER_ERROR, "Server error");
    body.put("errorId", errorId);
    return ResponseEntity.internalServerError().body(body);
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
