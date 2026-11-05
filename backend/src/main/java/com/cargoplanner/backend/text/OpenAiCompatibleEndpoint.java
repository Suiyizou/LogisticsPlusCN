package com.cargoplanner.backend.text;

import java.util.Locale;

public final class OpenAiCompatibleEndpoint {
  private OpenAiCompatibleEndpoint() {}

  public static String chatCompletionsUrl(String baseUrl) {
    String url = baseUrl == null ? "" : baseUrl.trim().replaceAll("/+$", "");
    if (url.isBlank()) url = "https://api.deepseek.com";
    if (url.endsWith("/chat/completions")) return url;
    if (isDeepSeek(url) || url.endsWith("/v1")) return url + "/chat/completions";
    return url + "/v1/chat/completions";
  }

  public static boolean isDeepSeek(String baseUrl) {
    return baseUrl != null && baseUrl.toLowerCase(Locale.ROOT).contains("deepseek.com");
  }
}
