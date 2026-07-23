package com.cargoplanner.backend.customer;

import java.util.List;

public record CustomerHandoverCreateRequest(
    List<String> customerIds,
    Long targetBusinessUserId,
    String reason
) {}
