package com.cargoplanner.backend.platform;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import java.util.Set;
import org.springframework.http.HttpStatus;

/** Role gate only. Customer-owned resources also require their domain data policy. */
public final class PermissionGate {
  private PermissionGate() {}

  public static void requireRole(AuthenticatedUser actor, Set<String> roles) {
    if (actor == null || !"ACTIVE".equals(actor.status()) || !roles.contains(actor.role())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "MODULE_ACCESS_DENIED", "Access denied");
    }
  }
}
