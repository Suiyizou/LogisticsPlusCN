package com.cargoplanner.backend.__PACKAGE__.api;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** Optimistic PATCH envelope; absent values preserve and explicit null clears optional fields. */
public record __NAME__Update(@NotNull @Min(0) Long version, @NotNull @Valid __NAME__Patch values) {
  @JsonAnySetter
  public void rejectUnknown(String name, JsonNode value) {
    throw new IllegalArgumentException("Unknown field: " + name);
  }
}
