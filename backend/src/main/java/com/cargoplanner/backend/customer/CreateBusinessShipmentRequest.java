package com.cargoplanner.backend.customer;

public record CreateBusinessShipmentRequest(
    String carrier,
    String referenceType,
    String referenceNo,
    String trackingStatus,
    String note
) {}
