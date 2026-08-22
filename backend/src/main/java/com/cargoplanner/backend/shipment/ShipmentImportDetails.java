package com.cargoplanner.backend.shipment;

public record ShipmentImportDetails(
    String carrierPrefix,
    String originalBillOfLading,
    String forwarderJobNumber,
    String vesselVoyage,
    String portOfLoading,
    String portOfDischarge,
    String clientPoNumber,
    String estimatedDeparture,
    String estimatedArrival,
    String volume,
    String clientNameCode
) {}
