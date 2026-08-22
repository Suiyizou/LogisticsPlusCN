package com.cargoplanner.backend.customer;

public record ManualRouteNodeRequest(
    String locationType,
    String city,
    String countryCode,
    String facilityCode,
    String event,
    String estimatedTime,
    String actualTime,
    String timezone
) {
}
