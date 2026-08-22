package com.cargoplanner.backend.customer;

public record ManualContainerRequest(
    String number,
    String type,
    String transportMode,
    String trafficTerm,
    String currentLocation,
    String latestEvent,
    String latestEventTime
) {
}
