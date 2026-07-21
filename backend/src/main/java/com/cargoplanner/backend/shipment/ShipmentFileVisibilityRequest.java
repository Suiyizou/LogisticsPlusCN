package com.cargoplanner.backend.shipment;

import java.util.List;

public record ShipmentFileVisibilityRequest(
    String visibility,
    String targetCustomerId,
    List<String> visibilityRoles
) {}
