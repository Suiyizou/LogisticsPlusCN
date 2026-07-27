package com.cargoplanner.backend.customer;

public record AssignedBusinessShipmentRequest(
    String customerId,
    Boolean publishToCustomer,
    CreateBusinessShipmentRequest shipment
) {}
