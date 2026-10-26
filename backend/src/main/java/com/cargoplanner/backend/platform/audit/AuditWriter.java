package com.cargoplanner.backend.platform.audit;

import com.cargoplanner.backend.auth.AuthenticatedUser;

/** Transactional business audit port. Implementations must not record request secrets. */
public interface AuditWriter {
  void record(AuthenticatedUser actor, String action, String targetType, long targetId,
      String detail, String ipAddress);
}
