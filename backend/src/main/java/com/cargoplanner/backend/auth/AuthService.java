package com.cargoplanner.backend.auth;

import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
  private static final SecureRandom RANDOM = new SecureRandom();

  private final JdbcTemplate jdbcTemplate;
  private final PasswordHasher passwordHasher;
  private final int deviceLimit;
  private final Duration tokenTtl;

  public AuthService(
      JdbcTemplate jdbcTemplate,
      PasswordHasher passwordHasher,
      @Value("${app.device-limit-per-user:5}") int deviceLimit,
      @Value("${app.auth-token-hours:6}") long tokenHours
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.passwordHasher = passwordHasher;
    this.deviceLimit = deviceLimit;
    this.tokenTtl = Duration.ofHours(Math.max(1, tokenHours));
  }

  @Transactional
  public LoginResponse login(LoginRequest request, HttpServletRequest httpRequest) {
    String username = request.username().trim();
    String ip = ClientInfo.ip(httpRequest);
    String userAgent = ClientInfo.userAgent(httpRequest);
    expireOldSessions(Instant.now());
    UserAccount account = findAccount(username);

    if (account == null || !"ACTIVE".equals(account.status())) {
      recordEvent(null, username, "LOGIN_FAIL", request.deviceId(), ip, userAgent, "User not found or disabled");
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid username or password");
    }

    boolean passwordValid = passwordHasher.verify(
        request.password(),
        account.passwordSalt(),
        account.passwordHash(),
        account.passwordIterations()
    );
    if (!passwordValid) {
      recordEvent(account.id(), username, "LOGIN_FAIL", request.deviceId(), ip, userAgent, "Bad password");
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid username or password");
    }

    String deviceId = normalizeDeviceId(request.deviceId(), ip, userAgent);
    // Serialize admission for all devices of the same account. Without this row lock,
    // parallel logins with different device ids can all observe a stale count below the cap.
    lockUserForDeviceAdmission(account.id());
    int activeOtherDevices = countActiveOtherDevices(account.id(), deviceId);
    if (activeOtherDevices >= deviceLimit) {
      recordEvent(account.id(), username, "DEVICE_LIMIT", deviceId, ip, userAgent, "Device limit reached");
      throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "This account already has 5 online devices");
    }

    String token = newToken();
    String tokenHash = sha256Hex(token);
    Instant now = Instant.now();
    upsertDevice(account.id(), deviceId, request.deviceName(), request.macAddress(), ip, userAgent, tokenHash, now);
    jdbcTemplate.update("UPDATE cp_users SET last_login_at = ? WHERE id = ?", Timestamp.from(now), account.id());
    recordEvent(account.id(), username, "LOGIN_SUCCESS", deviceId, ip, userAgent, "Login success");

    return new LoginResponse(token, toAuthenticatedUser(account), deviceLimit, now.plus(tokenTtl).toString());
  }

  public AuthenticatedUser authenticate(String token, HttpServletRequest request) {
    if (token == null || token.isBlank()) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Missing auth token");
    }
    expireOldSessions(Instant.now());
    String tokenHash = sha256Hex(token.trim());
    List<AuthenticatedUser> users = jdbcTemplate.query(
        """
        SELECT u.id, u.username, u.display_name, u.role, u.status, u.party_role
        FROM cp_login_devices d
        JOIN cp_users u ON u.id = d.user_id
        WHERE d.session_token_hash = ?
          AND d.online = 1
          AND d.revoked_at IS NULL
          AND u.status = 'ACTIVE'
        """,
        this::mapAuthenticatedUser,
        tokenHash
    );
    if (users.isEmpty()) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid auth token");
    }
    jdbcTemplate.update(
        """
        UPDATE cp_login_devices
        SET last_seen_at = ?, ip_address = ?, user_agent = ?
        WHERE session_token_hash = ? AND online = 1 AND revoked_at IS NULL
        """,
        Timestamp.from(Instant.now()),
        ClientInfo.ip(request),
        ClientInfo.userAgent(request),
        tokenHash
    );
    return users.get(0);
  }

  @Transactional
  public void logout(String token, HttpServletRequest request) {
    if (token == null || token.isBlank()) {
      return;
    }
    String tokenHash = sha256Hex(token.trim());
    DeviceSession session = findDeviceSession(tokenHash);
    jdbcTemplate.update(
        "UPDATE cp_login_devices SET online = 0, session_token_hash = NULL WHERE session_token_hash = ?",
        tokenHash
    );
    if (session != null) {
      recordEvent(
          session.userId(),
          session.username(),
          "LOGOUT",
          session.deviceId(),
          ClientInfo.ip(request),
          ClientInfo.userAgent(request),
          "Logout"
      );
    }
  }

  public int deviceLimit() {
    return deviceLimit;
  }

  public long tokenTtlHours() {
    return tokenTtl.toHours();
  }

  private void expireOldSessions(Instant now) {
    Timestamp expiredBefore = Timestamp.from(now.minus(tokenTtl));
    Timestamp revokedAt = Timestamp.from(now);
    jdbcTemplate.update(
        """
        UPDATE cp_login_devices
        SET online = 0, session_token_hash = NULL, revoked_at = ?
        WHERE online = 1
          AND revoked_at IS NULL
          AND logged_in_at < ?
        """,
        revokedAt,
        expiredBefore
    );
  }

  private void lockUserForDeviceAdmission(long userId) {
    jdbcTemplate.queryForObject(
        "SELECT id FROM cp_users WHERE id = ? FOR UPDATE",
        Long.class,
        userId
    );
  }

  private UserAccount findAccount(String username) {
    List<UserAccount> users = jdbcTemplate.query(
        """
        SELECT id, username, display_name, role, status, party_role,
               password_salt, password_hash, password_iterations
        FROM cp_users
        WHERE username = ?
        """,
        this::mapUserAccount,
        username
    );
    return users.isEmpty() ? null : users.get(0);
  }

  private DeviceSession findDeviceSession(String tokenHash) {
    List<DeviceSession> sessions = jdbcTemplate.query(
        """
        SELECT d.user_id, u.username, d.device_id
        FROM cp_login_devices d
        JOIN cp_users u ON u.id = d.user_id
        WHERE d.session_token_hash = ?
        """,
        (rs, rowNum) -> new DeviceSession(rs.getLong("user_id"), rs.getString("username"), rs.getString("device_id")),
        tokenHash
    );
    return sessions.isEmpty() ? null : sessions.get(0);
  }

  private int countActiveOtherDevices(long userId, String deviceId) {
    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*)
        FROM cp_login_devices
        WHERE user_id = ?
          AND online = 1
          AND revoked_at IS NULL
          AND device_id <> ?
        """,
        Integer.class,
        userId,
        deviceId
    );
    return count == null ? 0 : count;
  }

  private void upsertDevice(
      long userId,
      String deviceId,
      String deviceName,
      String macAddress,
      String ip,
      String userAgent,
      String tokenHash,
      Instant now
  ) {
    Timestamp timestamp = Timestamp.from(now);
    jdbcTemplate.update(
        """
        INSERT INTO cp_login_devices (
          user_id, device_id, device_name, mac_address, ip_address, user_agent,
          session_token_hash, online, logged_in_at, last_seen_at, revoked_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)
        ON DUPLICATE KEY UPDATE
          device_name = VALUES(device_name),
          mac_address = VALUES(mac_address),
          ip_address = VALUES(ip_address),
          user_agent = VALUES(user_agent),
          session_token_hash = VALUES(session_token_hash),
          online = 1,
          logged_in_at = VALUES(logged_in_at),
          last_seen_at = VALUES(last_seen_at),
          revoked_at = NULL
        """,
        userId,
        deviceId,
        ClientInfo.trim(blankToNull(deviceName), 128),
        ClientInfo.trim(blankToNull(macAddress), 64),
        ClientInfo.trim(ip, 64),
        ClientInfo.trim(userAgent, 512),
        tokenHash,
        timestamp,
        timestamp
    );
  }

  public void recordEvent(
      Long userId,
      String username,
      String eventType,
      String deviceId,
      String ip,
      String userAgent,
      String message
  ) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_login_events (user_id, username, event_type, device_id, ip_address, user_agent, message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        userId,
        ClientInfo.trim(username, 64),
        eventType,
        ClientInfo.trim(blankToNull(deviceId), 128),
        ClientInfo.trim(ip, 64),
        ClientInfo.trim(userAgent, 512),
        ClientInfo.trim(message, 255)
    );
  }

  private String normalizeDeviceId(String requestedDeviceId, String ip, String userAgent) {
    String value = blankToNull(requestedDeviceId);
    if (value != null) {
      return ClientInfo.trim(value, 128);
    }
    return "web-" + sha256Hex(ip + "|" + userAgent).substring(0, 24);
  }

  private String newToken() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private static String sha256Hex(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(hash);
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 unavailable", error);
    }
  }

  private UserAccount mapUserAccount(ResultSet rs, int rowNum) throws SQLException {
    return new UserAccount(
        rs.getLong("id"),
        rs.getString("username"),
        rs.getString("display_name"),
        rs.getString("role"),
        rs.getString("status"),
        rs.getString("party_role"),
        rs.getString("password_salt"),
        rs.getString("password_hash"),
        rs.getInt("password_iterations")
    );
  }

  private AuthenticatedUser mapAuthenticatedUser(ResultSet rs, int rowNum) throws SQLException {
    return new AuthenticatedUser(
        rs.getLong("id"),
        rs.getString("username"),
        rs.getString("display_name"),
        rs.getString("role"),
        rs.getString("status"),
        rs.getString("party_role")
    );
  }

  private AuthenticatedUser toAuthenticatedUser(UserAccount account) {
    return new AuthenticatedUser(
        account.id(),
        account.username(),
        account.displayName(),
        account.role(),
        account.status(),
        account.partyRole()
    );
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  private record UserAccount(
      long id,
      String username,
      String displayName,
      String role,
      String status,
      String partyRole,
      String passwordSalt,
      String passwordHash,
      int passwordIterations
  ) {}

  private record DeviceSession(long userId, String username, String deviceId) {}
}
