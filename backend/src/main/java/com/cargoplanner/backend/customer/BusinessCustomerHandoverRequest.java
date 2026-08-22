package com.cargoplanner.backend.customer;

import java.util.List;

public record BusinessCustomerHandoverRequest(
    List<String> customerIds,
    Long targetBusinessUserId,
    String reason
) {}
