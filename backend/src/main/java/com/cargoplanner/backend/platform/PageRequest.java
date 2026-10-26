package com.cargoplanner.backend.platform;

import com.cargoplanner.backend.common.ApiException;
import org.springframework.http.HttpStatus;

/** New module contract: zero-based pages, never an unbounded query. */
public record PageRequest(int page, int pageSize) {
  public PageRequest {
    if (page < 0 || pageSize < 1 || pageSize > 100) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PAGE", "page must be >= 0 and pageSize between 1 and 100");
    }
  }

  public long offset() {
    return (long) page * pageSize;
  }
}
