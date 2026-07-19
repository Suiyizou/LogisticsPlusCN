package com.cargoplanner.backend.customer;

public record CreateBusinessShipmentRequest(
    String carrier,
    String referenceType,
    String referenceNo,
    String trackingStatus,
    String note,
    String forwarderJobNumber,
    String vesselVoyage,
    String portOfLoading,
    String portOfDischarge,
    String clientPoNumber,
    String estimatedDeparture,
    String estimatedArrival,
    String actualDeparture,
    String actualArrival,
    String actualDelivery,
    String currentLocation,
    String volume,
    String clientNameCode
) {
  public CreateBusinessShipmentRequest(
      String carrier,
      String referenceType,
      String referenceNo,
      String trackingStatus,
      String note
  ) {
    this(
        carrier, referenceType, referenceNo, trackingStatus, note,
        null, null, null, null, null, null, null,
        null, null, null, null, null, null
    );
  }
}
