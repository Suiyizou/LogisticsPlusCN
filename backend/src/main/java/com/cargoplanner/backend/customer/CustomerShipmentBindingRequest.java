package com.cargoplanner.backend.customer;

public record CustomerShipmentBindingRequest(
    String shipmentId,
    String carrier,
    String referenceType,
    String referenceNo
) {}
