package com.cargoplanner.backend.shipment;

import java.util.List;

public record ShipmentBatchTaskRequest(
    String sourceFileName,
    String channel,
    List<ShipmentBatchItemRequest> items
) {
  public ShipmentBatchTaskRequest(
      String sourceFileName,
      List<ShipmentBatchItemRequest> items
  ) {
    this(sourceFileName, "AUTO", items);
  }
}
