package com.cargoplanner.backend.shipment;

public record CustomerShipmentUpdateRequest(
    String note,
    String forwarderJobNumber,
    String clientPoNumber,
    String clientNameCode
) {}
