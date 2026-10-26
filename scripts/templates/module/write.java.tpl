package com.cargoplanner.backend.__PACKAGE__.api;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.JsonNode;
__WRITE_IMPORTS__

/** Complete writable form. A nullable field is explicitly cleared by null. */
public record __NAME__Write(
__WRITE_FIELDS__
) {
  @JsonAnySetter
  public void rejectUnknown(String name, JsonNode value) {
    throw new IllegalArgumentException("Unknown field: " + name);
  }
}
