package com.cargoplanner.backend.customer;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record OverseaAgentBatchCreateRequest(
    @NotEmpty @Size(max = 200) List<@Valid CreateOverseaAgentEmployeeRequest> items
) {}
