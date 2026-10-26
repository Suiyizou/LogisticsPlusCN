package com.cargoplanner.backend.customer.persistence;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerAccessGuard;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;

/** Profile writes only; assignment/publication/password-reset workflows keep explicit use cases. */
@Repository
public class CustomerProfileRepository {
  private final CustomerProfileMapper mapper;
  private final CustomerAccessGuard guard;

  public CustomerProfileRepository(CustomerProfileMapper mapper, CustomerAccessGuard guard) {
    this.mapper = mapper;
    this.guard = guard;
  }

  public void create(CustomerProfileEntity row, AuthenticatedUser actor) {
    guard.requireManager(actor);
    row.id = null;
    row.createdBy = actor.id();
    row.responsibleAgentId = actor.id();
    mapper.insert(row);
  }

  /** Input has already resolved omission/clearing; explicit SET preserves intentional nulls. */
  public void updateProfile(CustomerProfileEntity row, boolean codeChanged, AuthenticatedUser actor) {
    guard.requireManager(actor);
    var update = new UpdateWrapper<CustomerProfileEntity>().eq("id", row.id)
        .eq("public_id", row.publicId).ne("status", "DELETED")
        .eq(!actor.isAdmin(), "responsible_agent_id", actor.id())
        .set("username", row.username).set("display_name", row.displayName)
        .set("client_code", row.clientCode).set("party_role", row.partyRole)
        .set("status", row.status).set("remark", row.remark)
        .set("contact_email", row.contactEmail);
    if (codeChanged) {
      update.set("customer_code_hash", row.customerCodeHash)
          .set("customer_code_prefix", row.customerCodePrefix).set("customer_code_mode", "MANUAL");
    }
    if (mapper.update(null, update) != 1) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Customer not found");
    }
  }
}
