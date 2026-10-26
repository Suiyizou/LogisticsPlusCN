package com.cargoplanner.backend.servicecatalog.api;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;

/** Generated presence-aware values: absent keeps, null clears only nullable fields. */
public class ServiceCatalogPatch {
  private String code;
  private boolean codePresent;
  @JsonSetter("code")
  public void setCode(String value) { code = value; codePresent = true; }
  public String code() { return code; }
  @JsonIgnore
  public boolean hasCode() { return codePresent; }
  @JsonIgnore
  @AssertTrue(message = "Invalid code")
  public boolean isCodeValid() { return !codePresent || ((code != null) && (code == null || !code.isBlank() && code.length() <= 64)); }

  private String name;
  private boolean namePresent;
  @JsonSetter("name")
  public void setName(String value) { name = value; namePresent = true; }
  public String name() { return name; }
  @JsonIgnore
  public boolean hasName() { return namePresent; }
  @JsonIgnore
  @AssertTrue(message = "Invalid name")
  public boolean isNameValid() { return !namePresent || ((name != null) && (name == null || !name.isBlank() && name.length() <= 160)); }

  private String description;
  private boolean descriptionPresent;
  @JsonSetter("description")
  public void setDescription(String value) { description = value; descriptionPresent = true; }
  public String description() { return description; }
  @JsonIgnore
  public boolean hasDescription() { return descriptionPresent; }
  @JsonIgnore
  @AssertTrue(message = "Invalid description")
  public boolean isDescriptionValid() { return !descriptionPresent || ((description == null || description.length() <= 4000)); }

  private Boolean enabled;
  private boolean enabledPresent;
  @JsonSetter("enabled")
  public void setEnabled(Boolean value) { enabled = value; enabledPresent = true; }
  public Boolean enabled() { return enabled; }
  @JsonIgnore
  public boolean hasEnabled() { return enabledPresent; }
  @JsonIgnore
  @AssertTrue(message = "Invalid enabled")
  public boolean isEnabledValid() { return !enabledPresent || ((enabled != null)); }

  @JsonAnySetter
  public void rejectUnknown(String name, JsonNode value) {
    throw new IllegalArgumentException("Unknown field: " + name);
  }
}
