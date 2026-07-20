package com.cargoplanner.backend.customer;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class CustomerAuthController {
  private final CustomerAuthService authService;
  private final BusinessCustomerService businessCustomerService;

  public CustomerAuthController(
      CustomerAuthService authService,
      BusinessCustomerService businessCustomerService
  ) {
    this.authService = authService;
    this.businessCustomerService = businessCustomerService;
  }

  @PostMapping("/public/customers/login")
  public CustomerLoginResponse login(
      @RequestBody CustomerLoginRequest request,
      HttpServletRequest httpRequest
  ) {
    return authService.login(request, httpRequest);
  }

  @PostMapping("/customer/logout")
  public Map<String, Object> logout(
      @RequestHeader(value = "X-Customer-Token", required = false) String token
  ) {
    authService.logout(token);
    return Map.of("loggedOut", true);
  }

  @GetMapping("/customer/shipments")
  public Map<String, Object> customerShipments(
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer
  ) {
    return businessCustomerService.listCustomerShipments(customer);
  }
}
