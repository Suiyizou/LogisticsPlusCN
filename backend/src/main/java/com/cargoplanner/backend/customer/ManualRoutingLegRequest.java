package com.cargoplanner.backend.customer;

public record ManualRoutingLegRequest(
    String mode,
    String vesselName,
    String service,
    String voyage,
    String loadPort,
    String loadCountryCode,
    String dischargePort,
    String dischargeCountryCode,
    String estimatedDeparture,
    String actualDeparture,
    String estimatedArrival,
    String actualArrival,
    String masterBill
) {
}
