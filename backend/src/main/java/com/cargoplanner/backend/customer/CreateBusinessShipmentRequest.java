package com.cargoplanner.backend.customer;

import java.util.List;

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
    String clientNameCode,
    String bookingNumber,
    String billOfLading,
    String trafficTerm,
    List<String> serviceScopes,
    String estimatedDelivery,
    String latestEventName,
    String latestEventTime,
    String latestEventLocation,
    List<ManualRouteNodeRequest> routeNodes,
    List<ManualRoutingLegRequest> routingLegs,
    List<ManualContainerSummaryRequest> containerTypes,
    List<ManualContainerRequest> containers
) {
  public CreateBusinessShipmentRequest(
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
    this(
        carrier, referenceType, referenceNo, trackingStatus, note,
        forwarderJobNumber, vesselVoyage, portOfLoading, portOfDischarge,
        clientPoNumber, estimatedDeparture, estimatedArrival, actualDeparture,
        actualArrival, actualDelivery, currentLocation, volume, clientNameCode,
        null, null, null, null, null, null, null, null,
        null, null, null, null
    );
  }

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
        null, null, null, null, null, null,
        null, null, null, null, null, null, null, null,
        null, null, null, null
    );
  }
}
