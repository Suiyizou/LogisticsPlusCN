package com.cargoplanner.backend.__PACKAGE__.api;

import java.time.Instant;

/** Deliberate public projection: no internal id, actor id or secret columns. */
public record __NAME__Response(String id, long version, Instant createdAt, Instant updatedAt,
__RESPONSE_FIELDS__
) {}
