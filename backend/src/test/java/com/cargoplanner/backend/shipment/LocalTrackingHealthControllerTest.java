package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class LocalTrackingHealthControllerTest {
  private final TrackingAdapterClient client = mock(TrackingAdapterClient.class);
  private final LocalTrackingHealthController controller = new LocalTrackingHealthController(client);
  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void authorizedDiagnosticsDelegateWithoutCreatingDatabaseWork() {
    var health = mapper.createObjectNode().put("status", "UNVERIFIED");
    var canary = mapper.createObjectNode().put("status", "READY");
    var request = new ShipmentTrackRequest("COSCO", "AUTO", "BILLOFLADING", "COSU9510184670", true);
    when(client.localHealth()).thenReturn(health);
    when(client.localCanary(request)).thenReturn(canary);

    assertThat(controller.health(actor("BUSINESS"))).isSameAs(health);
    assertThat(controller.canary(request, actor("ADMIN"))).isSameAs(canary);
    verify(client).localHealth();
    verify(client).localCanary(request);
  }

  @Test
  void anonymousAndNonManagerRolesCannotInspectOrTriggerQueries() {
    var request = new ShipmentTrackRequest("COSCO", "AUTO", "BILLOFLADING", "COSU9510184670", true);
    for (String role : new String[]{"EMPLOYEE", "OVERSEA_AGENT", "CUSTOMER"}) {
      assertThatThrownBy(() -> controller.health(actor(role)))
          .isInstanceOfSatisfying(ApiException.class,
              error -> assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN));
      assertThatThrownBy(() -> controller.canary(request, actor(role)))
          .isInstanceOfSatisfying(ApiException.class,
              error -> assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN));
    }
    assertThatThrownBy(() -> controller.health(null))
        .isInstanceOfSatisfying(ApiException.class,
            error -> assertThat(error.status()).isEqualTo(HttpStatus.UNAUTHORIZED));
    assertThatThrownBy(() -> controller.canary(request, null))
        .isInstanceOfSatisfying(ApiException.class,
            error -> assertThat(error.status()).isEqualTo(HttpStatus.UNAUTHORIZED));
    verifyNoInteractions(client);
  }

  private AuthenticatedUser actor(String role) {
    return new AuthenticatedUser(1, "operator", "Operator", role, "ACTIVE");
  }
}
