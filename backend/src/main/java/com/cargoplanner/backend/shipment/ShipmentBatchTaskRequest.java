package com.cargoplanner.backend.shipment;

import java.util.List;

public record ShipmentBatchTaskRequest(
    String sourceFileName,
    List<ShipmentBatchItemRequest> items
) {}
