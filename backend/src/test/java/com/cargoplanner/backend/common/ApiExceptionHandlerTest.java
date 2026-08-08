package com.cargoplanner.backend.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class ApiExceptionHandlerTest {

  @Test
  @SuppressWarnings("unchecked")
  void structuredTrackingDiagnosticsReachTheAuthorizedOperatorUi() {
    ApiException error = new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "COSCO_PROXY_POOL_EXHAUSTED",
        "COSCO proxy pool failed",
        900_000L,
        Map.of(
            "route", "PROXY",
            "proxyNode", "HK-S02",
            "proxyAttempts", 3,
            "triedNodes", java.util.List.of("HK-S01", "HK-S02")
        )
    );

    ResponseEntity<Map<String, Object>> response =
        new ApiExceptionHandler().handleApiException(error);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat((Map<String, Object>) response.getBody().get("details"))
        .containsEntry("route", "PROXY")
        .containsEntry("proxyNode", "HK-S02")
        .containsEntry("proxyAttempts", 3);
  }

  @Test
  void unexpectedErrorsReturnCorrelationIdWithoutExposingInternalMessage() {
    HttpServletRequest request = mock(HttpServletRequest.class);
    when(request.getMethod()).thenReturn("POST");
    when(request.getRequestURI()).thenReturn("/api/business/shipments/batch-update");

    ResponseEntity<Map<String, Object>> response = new ApiExceptionHandler().handleUnexpected(
        new IllegalStateException("database credential must stay private"),
        request
    );

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    assertThat(response.getBody())
        .containsEntry("message", "Server error")
        .containsKey("errorId");
    assertThat(response.getBody().toString()).doesNotContain("database credential");
  }
}
