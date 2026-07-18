package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthService;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.customer.CustomerAuthService;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/shipments")
public class ShipmentTrackingController {
  private final ShipmentTrackingService trackingService;
  private final AuthService authService;
  private final CustomerAuthService customerAuthService;
  private final ShipmentAccessService accessService;

  public ShipmentTrackingController(
      ShipmentTrackingService trackingService,
      AuthService authService,
      CustomerAuthService customerAuthService,
      ShipmentAccessService accessService
  ) {
    this.trackingService = trackingService;
    this.authService = authService;
    this.customerAuthService = customerAuthService;
    this.accessService = accessService;
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
    ObjectNode response = trackingService.track(request, user);
    if (customer != null) {
      response.put(
          "fileAccess",
          accessService.hasCustomerAccess(response.path("shipmentId").asText(), customer)
      );
    }
    return response;
  }
}
