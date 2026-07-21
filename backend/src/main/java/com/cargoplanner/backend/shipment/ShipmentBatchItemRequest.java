package com.cargoplanner.backend.shipment;

public record ShipmentBatchItemRequest(
    String id,
    String carrier,
    String type,
    String number,
    String displayNumber,
    Boolean manualOnly,
    ShipmentImportDetails importedDetails
) {}
