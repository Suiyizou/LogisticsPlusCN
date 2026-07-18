package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CmaTrackingSessionService {
  private static final String CARRIER = "CMA";
  private static final String ENCRYPTION_PURPOSE = "tracking:CMA:session-cookie";
  private static final int MAX_COOKIE_LENGTH = 8192;
  private static final int MAX_USER_AGENT_LENGTH = 512;

  private final JdbcTemplate jdbcTemplate;
  private final SecretValueCodec secretValueCodec;

  public CmaTrackingSessionService(JdbcTemplate jdbcTemplate, SecretValueCodec secretValueCodec) {
    this.jdbcTemplate = jdbcTemplate;
    this.secretValueCodec = secretValueCodec;
  }

  public CmaSessionStatus status(AuthenticatedUser actor) {
    requireManager(actor);
    return jdbcTemplate.query(
        """
        SELECT c.updated_at, u.display_name
        FROM cp_tracking_credentials c
        LEFT JOIN cp_users u ON u.id = c.updated_by
        WHERE c.carrier_code = ?
        """,
        (rs, rowNumber) -> new CmaSessionStatus(
            true,
            "datadome",
            toInstant(rs.getTimestamp("updated_at")),
            rs.getString("display_name")
        ),
        CARRIER
    ).stream().findFirst().orElse(new CmaSessionStatus(false, "datadome", null, null));
  }

  public Optional<CmaSessionCredentials> credentials() {
    return jdbcTemplate.query(
        """
        SELECT encrypted_session_cookie, browser_user_agent
        FROM cp_tracking_credentials
        WHERE carrier_code = ?
        """,
        (rs, rowNumber) -> {
          try {
            return new CmaSessionCredentials(
                secretValueCodec.decrypt(ENCRYPTION_PURPOSE, rs.getString("encrypted_session_cookie")),
                cleanUserAgent(rs.getString("browser_user_agent"))
            );
          } catch (IllegalStateException error) {
            throw new ApiException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "CMA session cannot be decrypted; ask a business user to save it again"
            );
          }
        },
        CARRIER
    ).stream().findFirst();
  }

  public CmaSessionCredentials requireCredentials() {
    return credentials().filter(value -> !value.sessionCookie().isBlank()).orElseThrow(() ->
        new ApiException(
            HttpStatus.SERVICE_UNAVAILABLE,
            "CMA session is not configured; a business user or administrator must update DataDome in the tracking page"
        )
    );
  }

  @Transactional
  public CmaSessionStatus update(
      CmaSessionUpdateRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireManager(actor);
    if (request == null) throw new ApiException(HttpStatus.BAD_REQUEST, "CMA session is required");
    NormalizedCookie normalized = normalizeCookie(request.sessionCookie());
    String userAgent = cleanUserAgent(request.userAgent());
    String encrypted = secretValueCodec.encrypt(ENCRYPTION_PURPOSE, normalized.header());

    int updated = jdbcTemplate.update(
        """
        UPDATE cp_tracking_credentials
        SET encrypted_session_cookie = ?, browser_user_agent = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE carrier_code = ?
        """,
        encrypted,
        userAgent,
        actor.id(),
        CARRIER
    );
    if (updated == 0) insertOrRetryUpdate(encrypted, userAgent, actor.id());
    audit(
        actor,
        "UPDATE_CMA_TRACKING_SESSION",
        "Updated encrypted CMA session (cookies: " + String.join(", ", normalized.names())
            + "; user agent: " + (!userAgent.isBlank()) + ")",
        ipAddress
    );
    return status(actor);
  }

  @Transactional
  public CmaSessionStatus clear(AuthenticatedUser actor, String ipAddress) {
    requireManager(actor);
    int removed = jdbcTemplate.update(
        "DELETE FROM cp_tracking_credentials WHERE carrier_code = ?",
        CARRIER
    );
    audit(
        actor,
        "CLEAR_CMA_TRACKING_SESSION",
        removed == 0 ? "CMA session was already empty" : "Cleared encrypted CMA session",
        ipAddress
    );
    return new CmaSessionStatus(false, "datadome", null, null);
  }

  private void insertOrRetryUpdate(String encrypted, String userAgent, long actorId) {
    try {
      jdbcTemplate.update(
          """
          INSERT INTO cp_tracking_credentials (
            carrier_code, encrypted_session_cookie, browser_user_agent, updated_by
          ) VALUES (?, ?, ?, ?)
          """,
          CARRIER,
          encrypted,
          userAgent,
          actorId
      );
    } catch (DuplicateKeyException concurrentInsert) {
      jdbcTemplate.update(
          """
          UPDATE cp_tracking_credentials
          SET encrypted_session_cookie = ?, browser_user_agent = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
          WHERE carrier_code = ?
          """,
          encrypted,
          userAgent,
          actorId,
          CARRIER
      );
    }
  }

  private NormalizedCookie normalizeCookie(String value) {
    String cookie = value == null ? "" : value.trim();
    if (cookie.regionMatches(true, 0, "Cookie:", 0, 7)) cookie = cookie.substring(7).trim();
    if (!cookie.contains("=")) cookie = "datadome=" + cookie;
    if (cookie.isBlank() || cookie.length() > MAX_COOKIE_LENGTH || cookie.indexOf('\r') >= 0
        || cookie.indexOf('\n') >= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "CMA cookie header is invalid");
    }

    List<String> pairs = new ArrayList<>();
    List<String> names = new ArrayList<>();
    for (String rawPart : cookie.split(";")) {
      String part = rawPart.trim();
      if (part.isBlank()) continue;
      int separator = part.indexOf('=');
      if (separator <= 0) throw new ApiException(HttpStatus.BAD_REQUEST, "CMA cookie header is invalid");
      String name = part.substring(0, separator).trim();
      String cookieValue = part.substring(separator + 1).trim();
      if (!name.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]+") || cookieValue.isBlank()
          || !cookieValue.chars().allMatch(character -> character >= 0x21 && character <= 0x7e)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "CMA cookie header is invalid");
      }
      pairs.add(name + "=" + cookieValue);
      names.add(name.toLowerCase(Locale.ROOT));
    }
    if (!names.contains("datadome")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A datadome cookie is required for CMA tracking");
    }
    return new NormalizedCookie(String.join("; ", pairs), List.copyOf(names));
  }

  private String cleanUserAgent(String value) {
    String userAgent = value == null ? "" : value.trim();
    if (userAgent.indexOf('\r') >= 0 || userAgent.indexOf('\n') >= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Browser user agent is invalid");
    }
    return userAgent.length() <= MAX_USER_AGENT_LENGTH
        ? userAgent
        : userAgent.substring(0, MAX_USER_AGENT_LENGTH);
  }

  private void requireManager(AuthenticatedUser actor) {
    if (actor == null || !actor.canManageShipmentFiles()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Business user or administrator permission is required");
    }
  }

  private void audit(AuthenticatedUser actor, String action, String detail, String ipAddress) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (
          admin_user_id, action, target_type, target_id, detail, ip_address
        ) VALUES (?, ?, 'TRACKING_CREDENTIAL', NULL, ?, ?)
        """,
        actor.id(),
        action,
        ClientInfo.trim(detail, 512),
        ClientInfo.trim(ipAddress, 64)
    );
  }

  private Instant toInstant(Timestamp value) {
    return value == null ? null : value.toInstant();
  }

  private record NormalizedCookie(String header, List<String> names) {}

  public record CmaSessionUpdateRequest(String sessionCookie, String userAgent) {}

  public record CmaSessionStatus(
      boolean configured,
      String cookieName,
      Instant updatedAt,
      String updatedBy
  ) {}

  public record CmaSessionCredentials(String sessionCookie, String userAgent) {}
}
