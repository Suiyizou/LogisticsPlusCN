package com.cargoplanner.backend.shipment;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public record ShipmentBatchDraftRequest(
    String sourceFileName,
    String channel,
    List<ShipmentBatchItemRequest> items,
    String customerId,
    Boolean publishToCustomer,
    String mode,
    JsonNode sourceRows,
    Integer expectedRevision
) {}
