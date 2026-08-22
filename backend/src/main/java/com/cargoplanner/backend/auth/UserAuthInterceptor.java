package com.cargoplanner.backend.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class UserAuthInterceptor implements HandlerInterceptor {
  public static final String CURRENT_USER_ATTRIBUTE = "currentUser";

  private final AuthService authService;

  public UserAuthInterceptor(AuthService authService) {
    this.authService = authService;
  }

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
    if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
      return true;
    }
    if (request.getAttribute(CURRENT_USER_ATTRIBUTE) instanceof AuthenticatedUser) {
      return true;
    }
    AuthenticatedUser user = authService.authenticate(request.getHeader("X-Auth-Token"), request);
    request.setAttribute(CURRENT_USER_ATTRIBUTE, user);
    return true;
  }
}
