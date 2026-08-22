package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.shipment.TrackingAdapterClient.NormalizedTrackRequest;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TrackingAdapterClientTest {

  @Test
  @SuppressWarnings("unchecked")
  void preservesBoundedPerSourceWarningsFromSupplementalHttpFailure() throws Exception {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/api/track/cosco/supplemental-details", exchange -> {
      byte[] body = """
          {
            "error": {
              "message": "COSCO did not return usable supplemental details",
              "details": {
                "code": "COSCO_SUPPLEMENTAL_UNAVAILABLE",
                "route": "PLAYWRIGHT_PROXY",
                "proxyNode": "browser-proxy-a1b2",
                "warnings": [{
                  "source": "bookingInfo",
                  "code": "COSCO_UPSTREAM_BLOCKED",
                  "causeCode": "HTTP_403",
                  "message": "Booking endpoint rejected the API proxy",
                  "route": "PROXY",
                  "proxyNode": "HK-S02",
                  "attempts": 2,
                  "triedNodes": ["HK-S01", "HK-S02"],
                  "retryAfterMs": 900000
                }]
              }
            }
          }
          """.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", "application/json");
      exchange.sendResponseHeaders(502, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.start();
    try {
      ShipmentTrackingProperties properties = new ShipmentTrackingProperties();
      properties.setAdapterBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
      properties.setConnectTimeout(Duration.ofSeconds(2));
      properties.setReadTimeout(Duration.ofSeconds(2));
      TrackingAdapterClient client = new TrackingAdapterClient(properties);

      assertThatThrownBy(() -> client.loadSupplementalDetails(
          new NormalizedTrackRequest("COSCO", "AUTO", "BOOKING", "6505740970")
      )).isInstanceOfSatisfying(ApiException.class, error -> {
        List<Map<String, Object>> warnings =
            (List<Map<String, Object>>) error.details().get("warnings");
        org.assertj.core.api.Assertions.assertThat(error.code())
            .isEqualTo("COSCO_SUPPLEMENTAL_UNAVAILABLE");
        org.assertj.core.api.Assertions.assertThat(error.details())
            .containsEntry("route", "PLAYWRIGHT_PROXY")
            .containsEntry("proxyNode", "browser-proxy-a1b2");
        org.assertj.core.api.Assertions.assertThat(warnings).singleElement().satisfies(warning -> {
          org.assertj.core.api.Assertions.assertThat(warning)
              .containsEntry("source", "bookingInfo")
              .containsEntry("code", "COSCO_UPSTREAM_BLOCKED")
              .containsEntry("proxyNode", "HK-S02")
              .containsEntry("attempts", 2)
              .containsEntry("triedNodes", List.of("HK-S01", "HK-S02"));
        });
      });
    } finally {
      server.stop(0);
    }
  }
}
