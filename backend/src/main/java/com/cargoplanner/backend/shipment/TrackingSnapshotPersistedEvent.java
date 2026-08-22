package com.cargoplanner.backend.shipment;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;

record TrackingSnapshotPersistedEvent(
    long shipmentId,
    String shipmentPublicId,
    JsonNode snapshot,
    Instant persistedAt
) {}
