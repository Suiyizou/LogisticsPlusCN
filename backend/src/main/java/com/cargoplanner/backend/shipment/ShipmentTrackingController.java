package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthService;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.customer.CustomerAuthService;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/public/shipments")
public class ShipmentTrackingController {
  private final ShipmentTrackingService trackingService;
  private final AuthService authService;
  private final CustomerAuthService customerAuthService;

  public ShipmentTrackingController(
      ShipmentTrackingService trackingService,
      AuthService authService,
      CustomerAuthService customerAuthService
  ) {
    this.trackingService = trackingService;
    this.authService = authService;
    this.customerAuthService = customerAuthService;
  }

  @PostMapping("/track")
  public ObjectNode track(
      @RequestBody ShipmentTrackRequest request,
      @RequestHeader(value = "X-Auth-Token", required = false) String token,
      @RequestHeader(value = "X-Customer-Token", required = false) String customerToken,
      HttpServletRequest httpRequest
  ) {
    AuthenticatedUser user = token == null || token.isBlank()
        ? null
        : authService.authenticate(token, httpRequest);
    CustomerPrincipal customer = customerToken == null || customerToken.isBlank()
        ? null
        : customerAuthService.authenticate(customerToken, httpRequest);
    if (customer != null) {
      return trackingService.readAssignedSnapshot(request, customer);
    }
    return trackingService.track(request, user);
  }

  @PostMapping("/batch-tasks/{taskId}/cancel")
  public ResponseEntity<JsonNode> cancelBatchTask(@PathVariable String taskId) {
    return ResponseEntity.accepted().body(trackingService.cancelBatchTask(taskId));
  }
}
