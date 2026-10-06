package com.cargoplanner.backend.customer.dto;

import java.util.List;

/** Keeps the existing {items, total} JSON contract. */
public record CustomerDirectoryResponse(List<CustomerDirectoryItem> items, int total) {
  public CustomerDirectoryResponse {
    items = List.copyOf(items);
  }
}
