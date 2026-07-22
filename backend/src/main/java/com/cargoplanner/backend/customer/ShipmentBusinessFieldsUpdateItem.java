package com.cargoplanner.backend.customer;

public record ShipmentBusinessFieldsUpdateItem(
    String shipmentId,
    String forwarderJobNumber,
    String clientPoNumber,
    String clientNameCode
) {}
