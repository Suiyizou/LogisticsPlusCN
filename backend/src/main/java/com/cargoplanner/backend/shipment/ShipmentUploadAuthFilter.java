package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthService;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerAuthInterceptor;
import com.cargoplanner.backend.customer.CustomerAuthService;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Authenticates upload requests before DispatcherServlet parses multipart bodies. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class ShipmentUploadAuthFilter extends OncePerRequestFilter {
  private static final Pattern INTERNAL_UPLOAD = Pattern.compile(
      "^/api/(?:shipments/[^/;]+/files|workspace-files|excel-cleaning/tasks|cargo-imports/preview)(?:;[^/]*)?/?$"
  );
  private static final Pattern CUSTOMER_UPLOAD = Pattern.compile(
      "^/api/customer/shipments/[^/;]+/files(?:;[^/]*)?/?$"
  );

  private final AuthService authService;
  private final CustomerAuthService customerAuthService;
  private final ObjectMapper objectMapper;

  public ShipmentUploadAuthFilter(
      AuthService authService,
      CustomerAuthService customerAuthService,
      ObjectMapper objectMapper
  ) {
    this.authService = authService;
    this.customerAuthService = customerAuthService;
    this.objectMapper = objectMapper;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String uri = request.getRequestURI();
    boolean uploadPath = INTERNAL_UPLOAD.matcher(uri).matches()
        || CUSTOMER_UPLOAD.matcher(uri).matches();
    if (!uploadPath) return true;
    if ("POST".equalsIgnoreCase(request.getMethod())) return false;
    return request.getContentLengthLong() <= 0
        && request.getHeader("Transfer-Encoding") == null;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request,
      HttpServletResponse response,
      FilterChain filterChain
  ) throws ServletException, IOException {
    try {
      if (!"POST".equalsIgnoreCase(request.getMethod())) {
        response.setStatus(HttpServletResponse.SC_METHOD_NOT_ALLOWED);
        response.setHeader("Allow", "GET, POST, OPTIONS");
        return;
      }
      String uri = request.getRequestURI();
      if (CUSTOMER_UPLOAD.matcher(uri).matches()) {
        CustomerPrincipal customer = customerAuthService.authenticate(
            request.getHeader("X-Customer-Token"),
            request
        );
        request.setAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE, customer);
      } else {
        AuthenticatedUser user = authService.authenticate(request.getHeader("X-Auth-Token"), request);
        request.setAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, user);
      }
      filterChain.doFilter(request, response);
    } catch (ApiException error) {
      response.setStatus(error.status().value());
      response.setContentType(MediaType.APPLICATION_JSON_VALUE);
      response.setCharacterEncoding("UTF-8");
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("timestamp", Instant.now().toString());
      body.put("status", error.status().value());
      body.put("error", error.status().getReasonPhrase());
      body.put("message", error.getMessage());
      objectMapper.writeValue(response.getOutputStream(), body);
    }
  }
}
