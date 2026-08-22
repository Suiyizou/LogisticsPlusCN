package com.cargoplanner.backend.common;

import jakarta.servlet.http.HttpServletRequest;

public final class ClientInfo {
  private ClientInfo() {}

  public static String ip(HttpServletRequest request) {
    String forwarded = request.getHeader("X-Forwarded-For");
    if (hasText(forwarded)) {
      return forwarded.split(",")[0].trim();
    }
    String realIp = request.getHeader("X-Real-IP");
    if (hasText(realIp)) {
      return realIp.trim();
    }
    return request.getRemoteAddr();
  }

  public static String userAgent(HttpServletRequest request) {
    String userAgent = request.getHeader("User-Agent");
    return userAgent == null ? "" : trim(userAgent, 512);
  }

  public static String trim(String value, int maxLength) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
  }

  private static boolean hasText(String value) {
    return value != null && !value.isBlank();
  }
}
