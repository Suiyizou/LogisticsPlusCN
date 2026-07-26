package com.cargoplanner.backend.customer;

public record ManualContainerSummaryRequest(
    String type,
    Integer quantity
) {
}
