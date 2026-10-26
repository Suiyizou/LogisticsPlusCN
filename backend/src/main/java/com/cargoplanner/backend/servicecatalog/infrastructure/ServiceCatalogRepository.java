package com.cargoplanner.backend.servicecatalog.infrastructure;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.servicecatalog.api.ServiceCatalogPatch;
import com.cargoplanner.backend.servicecatalog.domain.ServiceCatalogPolicy;
import com.cargoplanner.backend.platform.PageRequest;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;

/** Customizable repository. All entry points enforce the declared data scope. */
@Repository
public class ServiceCatalogRepository {
  private final ServiceCatalogMapper mapper;

  public ServiceCatalogRepository(ServiceCatalogMapper mapper) {
    this.mapper = mapper;
  }

  public Page<ServiceCatalogEntity> list(AuthenticatedUser actor, PageRequest page, String query) {
    ServiceCatalogPolicy.requireAccess(actor);
    var where = new QueryWrapper<ServiceCatalogEntity>();
    ServiceCatalogMapping.search(where, query);
    where.orderByDesc("updated_at", "id");
    return mapper.selectPage(new Page<>((long) page.page() + 1, page.pageSize()), where);
  }

  public ServiceCatalogEntity require(AuthenticatedUser actor, String publicId) {
    ServiceCatalogPolicy.requireAccess(actor);
    if (publicId == null || publicId.isBlank() || publicId.length() > 64) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ID", "Invalid record id");
    }
    var row = mapper.selectOne(new QueryWrapper<ServiceCatalogEntity>().eq("public_id", publicId));
    if (row == null) throw new ApiException(HttpStatus.NOT_FOUND, "RECORD_NOT_FOUND", "Record not found");
    return row;
  }

  public void insert(AuthenticatedUser actor, ServiceCatalogEntity row) {
    ServiceCatalogPolicy.requireAccess(actor);
    mapper.insert(row);
  }

  public void replace(AuthenticatedUser actor, ServiceCatalogEntity row, long version,
      ServiceCatalogPatch values, Instant now) {
    ServiceCatalogPolicy.requireAccess(actor);
    var update = new UpdateWrapper<ServiceCatalogEntity>()
        .eq("id", row.getId()).eq("version", version)
        .set("version", version + 1).set("updated_by", actor.id()).set("updated_at", now);
    ServiceCatalogMapping.patch(update, values);
    // Explicit set(null) preserves the declared clear operation; no ORM null strategy is assumed.
    if (mapper.update(null, update) != 1) {
      throw new ApiException(HttpStatus.CONFLICT, "STALE_VERSION", "Record changed; reload before saving");
    }
  }
}
