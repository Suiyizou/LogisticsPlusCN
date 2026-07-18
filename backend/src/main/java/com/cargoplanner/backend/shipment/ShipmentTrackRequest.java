package com.cargoplanner.backend.shipment;

public record ShipmentTrackRequest(
    String carrier,
    String channel,
    String type,
    String number,
    Boolean forceRefresh,
    ShipmentImportDetails importedDetails
) {
  public ShipmentTrackRequest(
      String carrier,
      String channel,
      String type,
      String number,
      Boolean forceRefresh
  ) {
    this(carrier, channel, type, number, forceRefresh, null);
  }
}
