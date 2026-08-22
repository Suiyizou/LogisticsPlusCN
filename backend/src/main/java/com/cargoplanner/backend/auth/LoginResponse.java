package com.cargoplanner.backend.auth;

public record LoginResponse(
    String token,
    AuthenticatedUser user,
    int deviceLimit,
    String expiresAt
) {}
