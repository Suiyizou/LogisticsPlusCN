package com.cargoplanner.backend.__PACKAGE__.application;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.__PACKAGE__.api.__NAME__Response;
import com.cargoplanner.backend.__PACKAGE__.api.__NAME__Update;
import com.cargoplanner.backend.__PACKAGE__.api.__NAME__Write;
import com.cargoplanner.backend.__PACKAGE__.domain.__NAME__Policy;
import com.cargoplanner.backend.__PACKAGE__.infrastructure.__NAME__Entity;
import com.cargoplanner.backend.__PACKAGE__.infrastructure.__NAME__Mapping;
import com.cargoplanner.backend.__PACKAGE__.infrastructure.__NAME__Repository;
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
public class __NAME__ApplicationService {
  private final __NAME__Repository repository;
  private final AuditWriter audit;

  public __NAME__ApplicationService(__NAME__Repository repository, AuditWriter audit) {
    this.repository = repository;
    this.audit = audit;
  }

  public PageResult<__NAME__Response> list(AuthenticatedUser actor, PageRequest page, String query) {
    __NAME__Policy.requireAccess(actor);
    if (query != null && query.length() > 100) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_QUERY", "Search is limited to 100 characters");
    }
    var result = repository.list(actor, page, query == null ? "" : query.trim());
    return PageResult.of(result.getRecords().stream().map(this::response).toList(), page, result.getTotal());
  }

  public __NAME__Response get(AuthenticatedUser actor, String id) {
    return response(repository.require(actor, id));
  }

  @Transactional
  public __NAME__Response create(AuthenticatedUser actor, @NotNull @Valid __NAME__Write values, String ip) {
    __NAME__Policy.requireAccess(actor);
    var now = Instant.now();
    var row = __NAME__Mapping.create(values);
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
    audit.record(actor, "CREATE___ACTION__", "__ACTION__", row.getId(), row.getPublicId(), ip);
    return response(row);
  }

  @Transactional
  public __NAME__Response replace(AuthenticatedUser actor, String id, @NotNull @Valid __NAME__Update request, String ip) {
    var row = repository.require(actor, id);
    try {
      repository.replace(actor, row, request.version(), request.values(), Instant.now());
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "DUPLICATE_RECORD", "A record with this unique value already exists");
    }
    audit.record(actor, "UPDATE___ACTION__", "__ACTION__", row.getId(), row.getPublicId(), ip);
    return get(actor, id);
  }

  private __NAME__Response response(__NAME__Entity row) {
    return __NAME__Mapping.response(row);
  }
}
