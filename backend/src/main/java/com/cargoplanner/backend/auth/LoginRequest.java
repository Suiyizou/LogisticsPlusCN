package com.cargoplanner.backend.auth;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
    @NotBlank String username,
    @NotBlank String password,
    String deviceId,
    String deviceName,
    String macAddress
) {}
