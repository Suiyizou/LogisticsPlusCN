package com.cargoplanner.backend.servicecatalog.domain;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.platform.PermissionGate;
import java.util.Set;

/** This generator supports internal shared reference data only. */
public final class ServiceCatalogPolicy {
  private static final Set<String> ROLES = Set.of("ADMIN", "BUSINESS");

  private ServiceCatalogPolicy() {}

  public static void requireAccess(AuthenticatedUser actor) {
    PermissionGate.requireRole(actor, ROLES);
  }
}
