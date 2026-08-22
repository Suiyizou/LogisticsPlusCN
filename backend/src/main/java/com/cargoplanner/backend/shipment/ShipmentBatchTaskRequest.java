package com.cargoplanner.backend.shipment;

import java.util.List;

public record ShipmentBatchTaskRequest(
    String sourceFileName,
    String channel,
    List<ShipmentBatchItemRequest> items,
    String customerId,
    Boolean publishToCustomer
) {
  public ShipmentBatchTaskRequest(
      String sourceFileName,
      String channel,
      List<ShipmentBatchItemRequest> items
  ) {
    this(sourceFileName, channel, items, null, null);
  }

  public ShipmentBatchTaskRequest(
      String sourceFileName,
      List<ShipmentBatchItemRequest> items
  ) {
    this(sourceFileName, "AUTO", items, null, null);
  }
}
