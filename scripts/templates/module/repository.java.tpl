package com.cargoplanner.backend.__PACKAGE__.infrastructure;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.__PACKAGE__.api.__NAME__Patch;
import com.cargoplanner.backend.__PACKAGE__.domain.__NAME__Policy;
import com.cargoplanner.backend.platform.PageRequest;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;

/** Customizable repository. All entry points enforce the declared data scope. */
@Repository
public class __NAME__Repository {
  private final __NAME__Mapper mapper;

  public __NAME__Repository(__NAME__Mapper mapper) {
    this.mapper = mapper;
  }

  public Page<__NAME__Entity> list(AuthenticatedUser actor, PageRequest page, String query) {
    __NAME__Policy.requireAccess(actor);
    var where = new QueryWrapper<__NAME__Entity>();
    __NAME__Mapping.search(where, query);
    where.orderByDesc("updated_at", "id");
    return mapper.selectPage(new Page<>((long) page.page() + 1, page.pageSize()), where);
  }

  public __NAME__Entity require(AuthenticatedUser actor, String publicId) {
    __NAME__Policy.requireAccess(actor);
    if (publicId == null || publicId.isBlank() || publicId.length() > 64) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ID", "Invalid record id");
    }
    var row = mapper.selectOne(new QueryWrapper<__NAME__Entity>().eq("public_id", publicId));
    if (row == null) throw new ApiException(HttpStatus.NOT_FOUND, "RECORD_NOT_FOUND", "Record not found");
    return row;
  }

  public void insert(AuthenticatedUser actor, __NAME__Entity row) {
    __NAME__Policy.requireAccess(actor);
    mapper.insert(row);
  }

  public void replace(AuthenticatedUser actor, __NAME__Entity row, long version,
      __NAME__Patch values, Instant now) {
    __NAME__Policy.requireAccess(actor);
    var update = new UpdateWrapper<__NAME__Entity>()
        .eq("id", row.getId()).eq("version", version)
        .set("version", version + 1).set("updated_by", actor.id()).set("updated_at", now);
    __NAME__Mapping.patch(update, values);
    // Explicit set(null) preserves the declared clear operation; no ORM null strategy is assumed.
    if (mapper.update(null, update) != 1) {
      throw new ApiException(HttpStatus.CONFLICT, "STALE_VERSION", "Record changed; reload before saving");
    }
  }
}
