package com.cargoplanner.backend.customer;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateOverseaAgentEmployeeRequest(
    @NotBlank @Size(min = 2, max = 64) String username,
    @NotBlank @Size(min = 2, max = 80) String displayName,
    @NotBlank @Size(min = 12, max = 128) String password
) {}
