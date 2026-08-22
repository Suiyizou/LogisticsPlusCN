package com.cargoplanner.backend.shipment;

public record ShipmentTrackRequest(
    String carrier,
    String channel,
    String type,
    String number,
    Boolean forceRefresh,
    ShipmentImportDetails importedDetails,
    String batchTaskId
) {
  public ShipmentTrackRequest(
      String carrier,
      String channel,
      String type,
      String number,
      Boolean forceRefresh
  ) {
    this(carrier, channel, type, number, forceRefresh, null, null);
  }

  public ShipmentTrackRequest(
      String carrier,
      String channel,
      String type,
      String number,
      Boolean forceRefresh,
      ShipmentImportDetails importedDetails
  ) {
    this(carrier, channel, type, number, forceRefresh, importedDetails, null);
  }
}
