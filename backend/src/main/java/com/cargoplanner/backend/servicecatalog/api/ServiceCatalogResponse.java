package com.cargoplanner.backend.servicecatalog.api;

import java.time.Instant;

/** Deliberate public projection: no internal id, actor id or secret columns. */
public record ServiceCatalogResponse(String id, long version, Instant createdAt, Instant updatedAt,
    String code,
    String name,
    String description,
    Boolean enabled
) {}
