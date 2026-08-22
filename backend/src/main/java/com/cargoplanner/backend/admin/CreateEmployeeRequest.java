package com.cargoplanner.backend.admin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateEmployeeRequest(
    @NotBlank @Size(max = 64) String username,
    @NotBlank @Size(max = 80) String displayName,
    @NotBlank @Size(min = 12, max = 128) String password,
    String role,
    String partyRole
) {}
