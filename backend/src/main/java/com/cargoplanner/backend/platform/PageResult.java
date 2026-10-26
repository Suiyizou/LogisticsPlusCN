package com.cargoplanner.backend.platform;

import java.util.List;

/** Stable public projection; persistence entities never cross this boundary. */
public record PageResult<T>(List<T> items, int page, int pageSize, long total, long totalPages) {
  public PageResult {
    items = List.copyOf(items);
    if (page < 0 || pageSize < 1 || pageSize > 100 || total < 0 || items.size() > pageSize
        || totalPages != total / pageSize + (total % pageSize == 0 ? 0 : 1)) {
      throw new IllegalArgumentException("Invalid page result");
    }
  }

  public static <T> PageResult<T> of(List<T> items, PageRequest request, long total) {
    return new PageResult<>(items, request.page(), request.pageSize(), total,
        total / request.pageSize() + (total % request.pageSize() == 0 ? 0 : 1));
  }
}
