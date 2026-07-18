package com.cargoplanner.backend.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.regex.Pattern;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Rejects matrix-parameter delimiters before Spring normalizes controller paths. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class ApiPathSanitizationFilter extends OncePerRequestFilter {
  private static final Pattern MATRIX_DELIMITER = Pattern.compile(
      "(?:;|%(?:25)*3b)",
      Pattern.CASE_INSENSITIVE
  );

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String uri = request.getRequestURI();
    return uri == null || !uri.startsWith("/api/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request,
      HttpServletResponse response,
      FilterChain filterChain
  ) throws ServletException, IOException {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    if (MATRIX_DELIMITER.matcher(request.getRequestURI()).find()) {
      response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Matrix parameters are not supported");
      return;
    }
    filterChain.doFilter(request, response);
  }
}
