package com.cargoplanner.backend.customer;

public record CreateCustomerRequest(
    String username,
    String password,
    String displayName,
    String partyRole
) {}
