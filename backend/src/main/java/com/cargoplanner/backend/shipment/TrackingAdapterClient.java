package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class TrackingAdapterClient {
  private final RestClient restClient;

  public TrackingAdapterClient(ShipmentTrackingProperties properties) {
    SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
    requestFactory.setConnectTimeout(validDuration(properties.getConnectTimeout(), Duration.ofSeconds(5)));
    requestFactory.setReadTimeout(validDuration(properties.getReadTimeout(), Duration.ofSeconds(90)));
    this.restClient = RestClient.builder()
        .baseUrl(trimTrailingSlash(properties.getAdapterBaseUrl()))
        .requestFactory(requestFactory)
        .build();
  }

  public JsonNode track(NormalizedTrackRequest request) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("carrier", request.carrier());
    body.put("channel", request.channel());
    body.put("type", request.type());
    body.put("number", request.number());
    try {
      JsonNode response = restClient.post()
          .uri("/api/track")
          .body(body)
          .retrieve()
          .body(JsonNode.class);
      if (response == null || !response.path("snapshot").isObject()) {
        throw new ApiException(HttpStatus.BAD_GATEWAY, "Tracking adapter returned an incomplete response");
      }
      return response;
    } catch (RestClientResponseException error) {
      HttpStatus status = switch (error.getStatusCode().value()) {
        case 400 -> HttpStatus.BAD_REQUEST;
        case 404 -> HttpStatus.NOT_FOUND;
        case 429 -> HttpStatus.TOO_MANY_REQUESTS;
        default -> HttpStatus.BAD_GATEWAY;
      };
      throw new ApiException(status, adapterMessage(error));
    } catch (ResourceAccessException error) {
      throw new ApiException(HttpStatus.BAD_GATEWAY, "Tracking adapter is unavailable");
    }
  }

  private String adapterMessage(RestClientResponseException error) {
    String response = error.getResponseBodyAsString();
    if (response != null && !response.isBlank()) {
      return "Tracking adapter request failed: " + response.substring(0, Math.min(240, response.length()));
    }
    return "Tracking adapter request failed with status " + error.getStatusCode().value();
  }

  private static Duration validDuration(Duration value, Duration fallback) {
    return value == null || value.isNegative() || value.isZero() ? fallback : value;
  }

  private static String trimTrailingSlash(String value) {
    String normalized = value == null || value.isBlank() ? "http://127.0.0.1:3000" : value.trim();
    while (normalized.endsWith("/")) normalized = normalized.substring(0, normalized.length() - 1);
    return normalized;
  }

  public record NormalizedTrackRequest(String carrier, String channel, String type, String number) {}
}
