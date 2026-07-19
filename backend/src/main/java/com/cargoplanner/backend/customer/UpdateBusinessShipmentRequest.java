package com.cargoplanner.backend.customer;

public record UpdateBusinessShipmentRequest(
    String referenceType,
    String referenceNo,
    String trackingStatus,
    String note
) {}
