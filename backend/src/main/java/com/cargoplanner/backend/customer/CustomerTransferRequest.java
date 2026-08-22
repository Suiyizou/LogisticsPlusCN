package com.cargoplanner.backend.customer;

import java.util.List;

public record CustomerTransferRequest(
    List<String> customerIds,
    String targetAgentId
) {}
