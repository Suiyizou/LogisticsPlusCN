package com.cargoplanner.backend.shipment;

import java.util.List;

public record ShipmentBatchTaskRequest(
    String sourceFileName,
    List<ShipmentBatchItemRequest> items,
    Boolean includeContainerDetails
) {
  public ShipmentBatchTaskRequest(
      String sourceFileName,
      List<ShipmentBatchItemRequest> items
  ) {
    this(sourceFileName, items, false);
  }
}
