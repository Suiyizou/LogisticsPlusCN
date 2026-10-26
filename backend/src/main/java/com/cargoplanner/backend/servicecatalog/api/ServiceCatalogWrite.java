package com.cargoplanner.backend.servicecatalog.api;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Complete writable form. A nullable field is explicitly cleared by null. */
public record ServiceCatalogWrite(
    @NotBlank @Size(max = 64) String code,
    @NotBlank @Size(max = 160) String name,
    @Size(max = 4000) String description,
    @NotNull Boolean enabled
) {
  @JsonAnySetter
  public void rejectUnknown(String name, JsonNode value) {
    throw new IllegalArgumentException("Unknown field: " + name);
  }
}
