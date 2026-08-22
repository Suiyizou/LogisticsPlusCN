package com.cargoplanner.backend.customer;

import java.util.List;

public record ShipmentBusinessFieldsBatchUpdateRequest(
    List<ShipmentBusinessFieldsUpdateItem> items
) {}
