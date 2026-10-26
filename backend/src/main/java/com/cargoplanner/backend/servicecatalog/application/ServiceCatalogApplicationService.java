package com.cargoplanner.backend.servicecatalog.application;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.servicecatalog.api.ServiceCatalogResponse;
import com.cargoplanner.backend.servicecatalog.api.ServiceCatalogUpdate;
import com.cargoplanner.backend.servicecatalog.api.ServiceCatalogWrite;
import com.cargoplanner.backend.servicecatalog.domain.ServiceCatalogPolicy;
import com.cargoplanner.backend.servicecatalog.infrastructure.ServiceCatalogEntity;
import com.cargoplanner.backend.servicecatalog.infrastructure.ServiceCatalogMapping;
import com.cargoplanner.backend.servicecatalog.infrastructure.ServiceCatalogRepository;
import com.cargoplanner.backend.platform.PageRequest;
import com.cargoplanner.backend.platform.PageResult;
import com.cargoplanner.backend.platform.audit.AuditWriter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

/** Customizable use cases. Transaction, authorization and audit stay explicit. */
@Service
@Validated
public class ServiceCatalogApplicationService {
  private final ServiceCatalogRepository repository;
  private final AuditWriter audit;

  public ServiceCatalogApplicationService(ServiceCatalogRepository repository, AuditWriter audit) {
    this.repository = repository;
    this.audit = audit;
  }

  public PageResult<ServiceCatalogResponse> list(AuthenticatedUser actor, PageRequest page, String query) {
    ServiceCatalogPolicy.requireAccess(actor);
    if (query != null && query.length() > 100) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_QUERY", "Search is limited to 100 characters");
    }
    var result = repository.list(actor, page, query == null ? "" : query.trim());
    return PageResult.of(result.getRecords().stream().map(this::response).toList(), page, result.getTotal());
  }

  public ServiceCatalogResponse get(AuthenticatedUser actor, String id) {
    return response(repository.require(actor, id));
  }

  @Transactional
  public ServiceCatalogResponse create(AuthenticatedUser actor, @NotNull @Valid ServiceCatalogWrite values, String ip) {
    ServiceCatalogPolicy.requireAccess(actor);
    var now = Instant.now();
    var row = ServiceCatalogMapping.create(values);
    row.setPublicId(UUID.randomUUID().toString());
    row.setVersion(0L);
    row.setCreatedBy(actor.id());
    row.setUpdatedBy(actor.id());
    row.setCreatedAt(now);
    row.setUpdatedAt(now);
    try {
      repository.insert(actor, row);
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "DUPLICATE_RECORD", "A record with this unique value already exists");
    }
    audit.record(actor, "CREATE_SERVICE_CATALOG", "SERVICE_CATALOG", row.getId(), row.getPublicId(), ip);
    return response(row);
  }

  @Transactional
  public ServiceCatalogResponse replace(AuthenticatedUser actor, String id, @NotNull @Valid ServiceCatalogUpdate request, String ip) {
    var row = repository.require(actor, id);
    try {
      repository.replace(actor, row, request.version(), request.values(), Instant.now());
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "DUPLICATE_RECORD", "A record with this unique value already exists");
    }
    audit.record(actor, "UPDATE_SERVICE_CATALOG", "SERVICE_CATALOG", row.getId(), row.getPublicId(), ip);
    return get(actor, id);
  }

  private ServiceCatalogResponse response(ServiceCatalogEntity row) {
    return ServiceCatalogMapping.response(row);
  }
}
