package com.cargoplanner.backend.shipment;

public record ShipmentTrackRequest(
    String carrier,
    String channel,
    String type,
    String number,
    Boolean forceRefresh
) {}
