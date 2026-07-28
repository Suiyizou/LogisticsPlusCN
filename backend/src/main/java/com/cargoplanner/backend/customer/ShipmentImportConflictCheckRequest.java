package com.cargoplanner.backend.customer;

import java.util.List;

public record ShipmentImportConflictCheckRequest(
    List<CreateBusinessShipmentRequest> shipments
) {}
