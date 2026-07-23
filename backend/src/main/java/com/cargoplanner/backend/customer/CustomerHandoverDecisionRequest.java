package com.cargoplanner.backend.customer;

public record CustomerHandoverDecisionRequest(
    String decision,
    String note
) {}
