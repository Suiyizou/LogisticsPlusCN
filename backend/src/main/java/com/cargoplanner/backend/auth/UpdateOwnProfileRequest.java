package com.cargoplanner.backend.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateOwnProfileRequest(
    @NotBlank @Size(min = 2, max = 80) String displayName
) {}
