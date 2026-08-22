package com.cargoplanner.backend.customer;

import java.util.List;

public record CustomerShipmentBatchBindingRequest(List<String> shipmentIds) {}
