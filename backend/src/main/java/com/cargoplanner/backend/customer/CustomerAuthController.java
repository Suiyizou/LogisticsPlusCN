package com.cargoplanner.backend.customer;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class CustomerAuthController {
  private final CustomerAuthService authService;

  public CustomerAuthController(CustomerAuthService authService) {
    this.authService = authService;
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
}
