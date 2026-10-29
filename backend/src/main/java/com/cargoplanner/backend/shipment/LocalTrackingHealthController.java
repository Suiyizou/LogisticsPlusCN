package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Manual diagnostics only: reading health never schedules carrier queries. */
@RestController
@RequestMapping("/api/tracking/local-service")
public class LocalTrackingHealthController {
  private final TrackingAdapterClient adapterClient;

  public LocalTrackingHealthController(TrackingAdapterClient adapterClient) {
    this.adapterClient = adapterClient;
  }

  @GetMapping("/health")
  public JsonNode health(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    requireManager(actor);
    return adapterClient.localHealth();
  }

  @PostMapping("/canary")
  public JsonNode canary(
      @RequestBody ShipmentTrackRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    requireManager(actor);
    return adapterClient.localCanary(request);
  }

  private void requireManager(AuthenticatedUser actor) {
    if (actor == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Sign in is required");
    if (!actor.isBusiness() && !actor.isAdmin()) {
      throw new ApiException(HttpStatus.FORBIDDEN,
          "Only business operators or administrators may inspect local tracking health");
    }
  }
}
