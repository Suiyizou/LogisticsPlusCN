package com.cargoplanner.backend.customer;

public record UpdateCustomerRequest(
    String username,
    String displayName,
    String partyRole,
    String status
) {}
