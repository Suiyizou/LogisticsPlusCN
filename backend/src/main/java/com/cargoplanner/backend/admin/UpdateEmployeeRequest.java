package com.cargoplanner.backend.admin;

public record UpdateEmployeeRequest(
    String displayName,
    String role,
    String partyRole,
    String status,
    String password
) {}
