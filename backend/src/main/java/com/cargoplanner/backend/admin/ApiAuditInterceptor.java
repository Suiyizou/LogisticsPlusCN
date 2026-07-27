package com.cargoplanner.backend.admin;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ClientInfo;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Records an interface-level audit trail without storing request bodies, credentials,
 * authorization tokens, cookies, or other secrets.
 */
@Component
public class ApiAuditInterceptor implements HandlerInterceptor {
  private static final String START_ATTRIBUTE = ApiAuditInterceptor.class.getName() + ".start";
  private static final String REQUEST_ID_ATTRIBUTE = ApiAuditInterceptor.class.getName() + ".requestId";

  private final JdbcTemplate jdbcTemplate;

  public ApiAuditInterceptor(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public boolean preHandle(
      HttpServletRequest request,
      HttpServletResponse response,
      Object handler
  ) {
    request.setAttribute(START_ATTRIBUTE, System.nanoTime());
    String requestId = ClientInfo.trim(request.getHeader("X-Request-Id"), 64);
    if (requestId == null || requestId.isBlank()) requestId = UUID.randomUUID().toString();
    request.setAttribute(REQUEST_ID_ATTRIBUTE, requestId);
    response.setHeader("X-Request-Id", requestId);
    return true;
  }

  @Override
  public void afterCompletion(
      HttpServletRequest request,
      HttpServletResponse response,
      Object handler,
      Exception exception
  ) {
    Object current = request.getAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE);
    if (!(current instanceof AuthenticatedUser actor)) return;
    Object startValue = request.getAttribute(START_ATTRIBUTE);
    long durationMs = startValue instanceof Long start
        ? Math.max(0L, (System.nanoTime() - start) / 1_000_000L)
        : 0L;
    int status = response.getStatus();
    boolean success = exception == null && status < 400;
    String method = ClientInfo.trim(request.getMethod(), 12);
    String path = ClientInfo.trim(request.getRequestURI(), 255);
    String requestId = ClientInfo.trim(
        String.valueOf(request.getAttribute(REQUEST_ID_ATTRIBUTE)),
        64
    );
    try {
      jdbcTemplate.update(
          """
          INSERT INTO cp_admin_audit_log (
            admin_user_id, action, target_type, detail, ip_address,
            username_snapshot, role_snapshot, http_method, request_path,
            http_status, success, duration_ms, request_id, user_agent
          ) VALUES (?, 'API_REQUEST', 'API', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          actor.id(),
          ClientInfo.trim(method + " " + path, 512),
          ClientInfo.trim(ClientInfo.ip(request), 64),
          ClientInfo.trim(actor.username(), 100),
          ClientInfo.trim(actor.role(), 32),
          method,
          path,
          status,
          success,
          durationMs,
          requestId,
          ClientInfo.trim(request.getHeader("User-Agent"), 255)
      );
    } catch (DataAccessException ignored) {
      // Auditing must not turn a successful business request into a failed response.
    }
  }
}
