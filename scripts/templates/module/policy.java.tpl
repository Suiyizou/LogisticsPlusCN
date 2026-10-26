package com.cargoplanner.backend.__PACKAGE__.domain;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.platform.PermissionGate;
import java.util.Set;

/** This generator supports internal shared reference data only. */
public final class __NAME__Policy {
  private static final Set<String> ROLES = Set.of(__ROLES__);

  private __NAME__Policy() {}

  public static void requireAccess(AuthenticatedUser actor) {
    PermissionGate.requireRole(actor, ROLES);
  }
}
