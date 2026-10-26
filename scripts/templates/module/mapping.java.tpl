package com.cargoplanner.backend.__PACKAGE__.infrastructure;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cargoplanner.backend.__PACKAGE__.api.__NAME__Patch;
import com.cargoplanner.backend.__PACKAGE__.api.__NAME__Response;
import com.cargoplanner.backend.__PACKAGE__.api.__NAME__Write;

/** Generated field mapping. Adding a field never requires editing handwritten use cases. */
public final class __NAME__Mapping {
  private __NAME__Mapping() {}

  public static __NAME__Entity create(__NAME__Write values) {
    var row = new __NAME__Entity();
__CREATE_SETS__
    return row;
  }

  public static void patch(UpdateWrapper<__NAME__Entity> update, __NAME__Patch values) {
__UPDATE_SETS__
  }

  public static void search(QueryWrapper<__NAME__Entity> where, String query) {
    if (query != null && !query.isBlank()) where.and(filter -> filter__SEARCH_FIELDS__);
  }

  public static __NAME__Response response(__NAME__Entity row) {
    return new __NAME__Response(row.getPublicId(), row.getVersion(), row.getCreatedAt(), row.getUpdatedAt(),
__RESPONSE_GETTERS__);
  }
}
