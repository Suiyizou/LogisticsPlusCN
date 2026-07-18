package com.cargoplanner.backend.customer;

public record CustomerPrincipal(
    long id,
    String publicId,
    String username,
    String displayName,
    String partyRole,
    String status
) {}
