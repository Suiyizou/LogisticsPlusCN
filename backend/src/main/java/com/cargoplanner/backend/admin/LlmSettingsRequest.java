package com.cargoplanner.backend.admin;

public record LlmSettingsRequest(
    Boolean enabled,
    String baseUrl,
    String model,
    String apiKey,
    Boolean clearApiKey
) {}
