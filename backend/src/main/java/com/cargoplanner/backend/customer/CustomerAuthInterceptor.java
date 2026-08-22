package com.cargoplanner.backend.customer;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class CustomerAuthInterceptor implements HandlerInterceptor {
  public static final String CURRENT_CUSTOMER_ATTRIBUTE = "currentCustomer";

  private final CustomerAuthService authService;

  public CustomerAuthInterceptor(CustomerAuthService authService) {
    this.authService = authService;
  }

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
    if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;
    if (request.getAttribute(CURRENT_CUSTOMER_ATTRIBUTE) instanceof CustomerPrincipal) return true;
    CustomerPrincipal customer = authService.authenticate(request.getHeader("X-Customer-Token"), request);
    request.setAttribute(CURRENT_CUSTOMER_ATTRIBUTE, customer);
    return true;
  }
}
