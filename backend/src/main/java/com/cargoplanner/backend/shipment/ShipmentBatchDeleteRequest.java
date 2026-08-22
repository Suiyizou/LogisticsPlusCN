package com.cargoplanner.backend.shipment;

import java.util.List;

public record ShipmentBatchDeleteRequest(List<String> shipmentIds) {}
