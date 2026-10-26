package com.cargoplanner.backend.servicecatalog.infrastructure;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cargoplanner.backend.servicecatalog.api.ServiceCatalogPatch;
import com.cargoplanner.backend.servicecatalog.api.ServiceCatalogResponse;
import com.cargoplanner.backend.servicecatalog.api.ServiceCatalogWrite;

/** Generated field mapping. Adding a field never requires editing handwritten use cases. */
public final class ServiceCatalogMapping {
  private ServiceCatalogMapping() {}

  public static ServiceCatalogEntity create(ServiceCatalogWrite values) {
    var row = new ServiceCatalogEntity();
    row.setCode(values.code().trim());
    row.setName(values.name().trim());
    row.setDescription(values.description());
    row.setEnabled(values.enabled());
    return row;
  }

  public static void patch(UpdateWrapper<ServiceCatalogEntity> update, ServiceCatalogPatch values) {
    if (values.hasCode()) update.set("code", values.code().trim());
    if (values.hasName()) update.set("name", values.name().trim());
    if (values.hasDescription()) update.set("description", values.description());
    if (values.hasEnabled()) update.set("enabled", values.enabled());
  }

  public static void search(QueryWrapper<ServiceCatalogEntity> where, String query) {
    if (query != null && !query.isBlank()) where.and(filter -> filter.like("code", query).or().like("name", query));
  }

  public static ServiceCatalogResponse response(ServiceCatalogEntity row) {
    return new ServiceCatalogResponse(row.getPublicId(), row.getVersion(), row.getCreatedAt(), row.getUpdatedAt(),
        row.getCode(),
        row.getName(),
        row.getDescription(),
        row.getEnabled());
  }
}
