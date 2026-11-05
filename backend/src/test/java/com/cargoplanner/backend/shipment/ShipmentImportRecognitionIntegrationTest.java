package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.cargoplanner.backend.admin.LlmSettingsService;
import com.cargoplanner.backend.admin.LlmSettingsService.LlmRuntimeSettings;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ApiExceptionHandler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestClient;

class ShipmentImportRecognitionIntegrationTest {
  private static final String ROUTE = "/api/business/shipment-import/recognize-schema";
  private static final String ENDPOINT = "https://api.deepseek.com/chat/completions";
  private static final String SAFE_REQUEST = """
      {"headers":[{"index":2,"label":"Maritime document ref"},{"index":5,"label":"Shipping line"}],
       "carrierLabels":["Hapag-Lloyd"]}
      """;
  private static final AuthenticatedUser BUSINESS = user("BUSINESS");

  private final ObjectMapper json = new ObjectMapper();
  private final LlmSettingsService settings = mock(LlmSettingsService.class);
  private MockMvc mvc;
  private MockRestServiceServer model;

  @BeforeEach
  void setup() {
    RestClient.Builder builder = RestClient.builder();
    model = MockRestServiceServer.bindTo(builder).build();
    ShipmentImportRecognitionService service = new ShipmentImportRecognitionService(settings, json, builder.build());
    mvc = MockMvcBuilders.standaloneSetup(new ShipmentImportRecognitionController(service))
        .setControllerAdvice(new ApiExceptionHandler()).build();
    when(settings.runtimeSettings()).thenReturn(new LlmRuntimeSettings(true, "https://api.deepseek.com", "model", "fake-key"));
  }

  @Test
  void passesOnlySafeCandidatesToTheConfiguredModelAndReturnsValidatedSuggestions() throws Exception {
    model.expect(once(), requestTo(ENDPOINT))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header("Authorization", "Bearer fake-key"))
        .andExpect(request -> {
          String outbound = ((MockClientHttpRequest) request).getBodyAsString(StandardCharsets.UTF_8);
          assertThat(outbound).doesNotContain("fake-key", "BK10000", "contact@", "http://",
              "12345", "private.invalid", ".xlsx", "secret", "123456789");
          JsonNode body = json.readTree(outbound);
          assertThat(body.path("model").asText()).isEqualTo("model");
          assertThat(body.path("thinking").path("type").asText()).isEqualTo("disabled");
          JsonNode candidates = json.readTree(body.path("messages").path(1).path("content").asText());
          assertThat(candidates.path("headers")).isEqualTo(json.readTree("""
              [{"index":2,"label":"海运主单编号"},{"index":5,"label":"Shipping line"}]
              """));
          assertThat(candidates.path("carrierLabels")).isEqualTo(json.readTree("[\"Hapag-Lloyd\"]"));
          assertThat(candidates.path("carrierCodes")).isEqualTo(json.valueToTree(TrackingCarriers.CODES));
        })
        .andRespond(withSuccess(completion("""
            {"referenceColumnIndex":2,"referenceType":"BILLOFLADING","carrierColumnIndex":5,
             "carrierMappings":[{"label":"Hapag-Lloyd","carrier":"HAPAG_LLOYD"}]}
            """), MediaType.APPLICATION_JSON));

    recognize("""
        {"headers":[{"index":2,"label":"海运主单编号"},{"index":5,"label":"Shipping line"},
          {"index":7,"label":"BK10000"},{"index":8,"label":"contact@private.invalid"},
          {"index":9,"label":"http://private.invalid"},{"index":10,"label":"12345"},
          {"index":11,"label":"private.invalid"},{"index":12,"label":"manifest.xlsx"},
          {"index":13,"label":"secret\\nline"}],
         "carrierLabels":["Hapag-Lloyd","Hapag-Lloyd","123456789"]}
        """, BUSINESS)
        .andExpect(status().isOk())
        .andExpect(content().json("""
            {"referenceColumnIndex":2,"referenceType":"BILLOFLADING","carrierColumnIndex":5,
             "carrierMappings":[{"label":"Hapag-Lloyd","carrier":"HAPAG_LLOYD"}],"status":"SUGGESTED"}
            """, true));
    model.verify();
  }

  @Test
  void allowsCarrierOnlyRequestsAndReturnsNoMatchForAValidEmptySuggestion() throws Exception {
    model.expect(once(), requestTo(ENDPOINT))
        .andRespond(withSuccess(completion("""
            {"referenceColumnIndex":null,"referenceType":null,"carrierColumnIndex":null,"carrierMappings":[]}
            """), MediaType.APPLICATION_JSON));

    recognize("{\"carrierLabels\":[\"Unknown line\"]}", user("ADMIN"))
        .andExpect(status().isOk())
        .andExpect(content().json("""
            {"referenceColumnIndex":null,"referenceType":null,"carrierColumnIndex":null,
             "carrierMappings":[],"status":"NO_MATCH"}
            """, true));
    model.verify();
  }

  @Test
  void appliesBatchTaskManagerPermissionBeforeAnyModelLookup() throws Exception {
    mvc.perform(post(ROUTE).contentType(MediaType.APPLICATION_JSON).content(SAFE_REQUEST))
        .andExpect(status().isUnauthorized());
    recognize(SAFE_REQUEST, user("OVERSEA_AGENT")).andExpect(status().isForbidden());
    recognize(SAFE_REQUEST, user("CUSTOMER")).andExpect(status().isForbidden());
    verifyNoInteractions(settings);
    model.verify();
  }

  @Test
  void rejectsUnexpectedRequestFieldsAndOversizedCandidateLists() throws Exception {
    recognize("{\"headers\":[],\"orderNumber\":\"BK10000\"}", BUSINESS)
        .andExpect(status().isBadRequest());
    recognize("{\"headers\":[{\"index\":0,\"label\":\"Column\",\"order\":\"BK10000\"}]}", BUSINESS)
        .andExpect(status().isBadRequest());
    recognize("{\"headers\":[{\"index\":\"0\",\"label\":\"Column\"}]}", BUSINESS)
        .andExpect(status().isBadRequest());
    recognize(json.writeValueAsString(Map.of("carrierLabels", java.util.Collections.nCopies(33, "Name"))), BUSINESS)
        .andExpect(status().isBadRequest());
    recognize("{\"headers\":[{\"index\":0,\"label\":\"ref number " + "A".repeat(60) + "\"}]}", BUSINESS)
        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("NO_MATCH"));
    verifyNoInteractions(settings);
    model.verify();
  }

  @ParameterizedTest
  @ValueSource(strings = {
      "{\"referenceColumnIndex\":6,\"referenceType\":\"BOOKING\",\"carrierColumnIndex\":null,\"carrierMappings\":[]}",
      "{\"referenceColumnIndex\":\"2\",\"referenceType\":\"BOOKING\",\"carrierColumnIndex\":null,\"carrierMappings\":[]}",
      "{\"referenceColumnIndex\":2,\"referenceType\":\"HOUSE_BL\",\"carrierColumnIndex\":null,\"carrierMappings\":[]}",
      "{\"referenceColumnIndex\":2,\"referenceType\":null,\"carrierColumnIndex\":null,\"carrierMappings\":[]}",
      "{\"referenceColumnIndex\":2,\"referenceType\":\"BOOKING\",\"carrierColumnIndex\":2,\"carrierMappings\":[]}",
      "{\"referenceColumnIndex\":null,\"referenceType\":null,\"carrierColumnIndex\":null,\"carrierMappings\":[{\"label\":\"Hapag-Lloyd\",\"carrier\":\"UNKNOWN\"}]}",
      "{\"referenceColumnIndex\":null,\"referenceType\":null,\"carrierColumnIndex\":null,\"carrierMappings\":[{\"label\":\"Unsent label\",\"carrier\":\"CMA\"}]}",
      "{\"referenceColumnIndex\":null,\"referenceType\":null,\"carrierColumnIndex\":null,\"carrierMappings\":[],\"error\":\"raw upstream response\"}",
      "{\"referenceColumnIndex\":null,\"referenceType\":null,\"carrierColumnIndex\":null,\"carrierMappings\":[],\"carrierMappings\":[]}",
      "{\"referenceColumnIndex\":null,\"referenceType\":null,\"carrierColumnIndex\":null,\"carrierMappings\":[]} {}"
  })
  void discardsMalformedSuggestionsInsteadOfEchoingUpstreamContent(String answer) throws Exception {
    model.expect(once(), requestTo(ENDPOINT)).andRespond(withSuccess(completion(answer), MediaType.APPLICATION_JSON));

    expectUnavailable(recognize(SAFE_REQUEST, BUSINESS));
    model.verify();
  }

  @Test
  void fallsBackForDisabledMissingOrUnreadableConfiguration() throws Exception {
    when(settings.runtimeSettings()).thenReturn(new LlmRuntimeSettings(false, ENDPOINT, "model", "fake-key"));
    expectUnavailable(recognize(SAFE_REQUEST, BUSINESS));

    when(settings.runtimeSettings()).thenReturn(new LlmRuntimeSettings(true, ENDPOINT, "model", ""));
    expectUnavailable(recognize(SAFE_REQUEST, BUSINESS));

    when(settings.runtimeSettings()).thenThrow(new IllegalStateException("fake-key from inaccessible configuration"));
    expectUnavailable(recognize(SAFE_REQUEST, BUSINESS));

    model.verify();
  }

  @Test
  void fallsBackWithoutRetryingOrExposingTheProviderError() throws Exception {
    model.expect(once(), requestTo(ENDPOINT))
        .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE).body("fake-key from provider error"));
    expectUnavailable(recognize(SAFE_REQUEST, BUSINESS));
    model.verify();
  }

  private static AuthenticatedUser user(String role) {
    return new AuthenticatedUser(1, "user", "User", role, "ACTIVE");
  }

  private ResultActions recognize(String payload, AuthenticatedUser user) throws Exception {
    return mvc.perform(post(ROUTE).contentType(MediaType.APPLICATION_JSON).content(payload)
        .requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, user));
  }

  private String completion(String answer) throws Exception {
    return json.writeValueAsString(Map.of(
        "choices", List.of(Map.of("message", Map.of("content", answer), "finish_reason", "stop"))
    ));
  }

  private static void expectUnavailable(ResultActions result) throws Exception {
    result.andExpect(status().isOk()).andExpect(content().json("""
        {"referenceColumnIndex":null,"referenceType":null,"carrierColumnIndex":null,
         "carrierMappings":[],"status":"UNAVAILABLE"}
        """, true));
  }
}
