package com.cargoplanner.backend.customer;

public record UpdateOverseaAgentRequest(
    String displayName,
    String status,
    String password
) {}
