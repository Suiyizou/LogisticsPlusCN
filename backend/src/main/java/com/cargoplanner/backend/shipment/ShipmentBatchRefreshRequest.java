package com.cargoplanner.backend.shipment;

import java.util.List;

public record ShipmentBatchRefreshRequest(List<String> shipmentIds, String channel) {}
