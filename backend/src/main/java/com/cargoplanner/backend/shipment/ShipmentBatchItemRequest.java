package com.cargoplanner.backend.shipment;

public record ShipmentBatchItemRequest(
    String id,
    String carrier,
    String type,
    String number,
    String displayNumber,
    Boolean manualOnly,
    ShipmentImportDetails importedDetails,
    String recognitionErrorCode,
    String recognitionError,
    Integer sourceRow,
    String sourceReference
) {
  public ShipmentBatchItemRequest(String id, String carrier, String type, String number,
      String displayNumber, Boolean manualOnly, ShipmentImportDetails importedDetails) {
    this(id, carrier, type, number, displayNumber, manualOnly, importedDetails, null, null, null, null);
  }
}
