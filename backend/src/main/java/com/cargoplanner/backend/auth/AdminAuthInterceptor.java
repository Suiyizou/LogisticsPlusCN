package com.cargoplanner.backend.auth;

import com.cargoplanner.backend.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AdminAuthInterceptor implements HandlerInterceptor {
  public static final String CURRENT_USER_ATTRIBUTE = "currentUser";

  private final AuthService authService;

  public AdminAuthInterceptor(AuthService authService) {
    this.authService = authService;
  }

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
    if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
      return true;
    }
    AuthenticatedUser user = (AuthenticatedUser) request.getAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE);
    if (user == null) {
      user = authService.authenticate(request.getHeader("X-Auth-Token"), request);
      request.setAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, user);
    }
    if (!user.isAdmin()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Admin permission required");
    }
    request.setAttribute(CURRENT_USER_ATTRIBUTE, user);
    return true;
  }
}
