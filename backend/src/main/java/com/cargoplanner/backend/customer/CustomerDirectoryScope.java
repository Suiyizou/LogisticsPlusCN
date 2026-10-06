package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import org.springframework.http.HttpStatus;

/** Data visibility is derived from the authenticated identity, never from request parameters. */
public record CustomerDirectoryScope(Access access, long userId) {
  public enum Access {
    ALL, OWNED, ASSIGNED
  }

  public static CustomerDirectoryScope forActor(AuthenticatedUser actor) {
    if (actor == null) throw forbidden();
    if (actor.isAdmin()) return new CustomerDirectoryScope(Access.ALL, actor.id());
    if (actor.isBusiness()) return new CustomerDirectoryScope(Access.OWNED, actor.id());
    if (actor.isOverseaAgent()) return new CustomerDirectoryScope(Access.ASSIGNED, actor.id());
    throw forbidden();
  }

  private static ApiException forbidden() {
    return new ApiException(HttpStatus.FORBIDDEN, "Internal operations permission is required");
  }
}
