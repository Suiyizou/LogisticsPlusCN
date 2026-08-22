package com.cargoplanner.backend.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestStatsFilter extends OncePerRequestFilter {
  private final RequestStats requestStats;

  public RequestStatsFilter(RequestStats requestStats) {
    this.requestStats = requestStats;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request,
      HttpServletResponse response,
      FilterChain filterChain
  ) throws ServletException, IOException {
    try {
      filterChain.doFilter(request, response);
    } finally {
      requestStats.record(request.getMethod(), request.getRequestURI(), response.getStatus());
    }
  }
}
