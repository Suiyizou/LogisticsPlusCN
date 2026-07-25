package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomerAuthService {
  private final JdbcTemplate jdbcTemplate;
  private final CustomerTokenCodec tokenCodec;
  private final PasswordHasher passwordHasher;
  private final Duration sessionTtl;

  public CustomerAuthService(
      JdbcTemplate jdbcTemplate,
      CustomerTokenCodec tokenCodec,
      PasswordHasher passwordHasher,
      @Value("${app.customer-session-hours:24}") long sessionHours
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.tokenCodec = tokenCodec;
    this.passwordHasher = passwordHasher;
    this.sessionTtl = Duration.ofHours(Math.max(1, sessionHours));
  }

  @Transactional
  public CustomerLoginResponse login(CustomerLoginRequest request, HttpServletRequest httpRequest) {
    String username = request == null || request.username() == null
        ? ""
        : request.username().trim();
    String password = request == null ? null : request.password();
    String code = request == null ? null : request.customerCode();
    if (username.isBlank() || password == null || password.isBlank()
        || code == null || code.isBlank() || code.trim().length() < 4) {
      throw invalidCredentials();
    }
    Instant now = Instant.now();
    expireSessions(now);
    List<CustomerAccount> customers = jdbcTemplate.query(
        """
        SELECT id, public_id, username, display_name, party_role, status,
               password_salt, password_hash, password_iterations, customer_code_hash
        FROM cp_customers
        WHERE username = ? AND status = 'ACTIVE'
        """,
        this::mapCustomerAccount,
        username
    );
    if (customers.isEmpty()) throw invalidCredentials();

    CustomerAccount account = customers.get(0);
    if (account.passwordSalt() == null || account.passwordHash() == null
        || account.passwordIterations() == null
        || !passwordHasher.verify(
            password,
            account.passwordSalt(),
            account.passwordHash(),
            account.passwordIterations()
        )) {
      throw invalidCredentials();
    }

    String codeHash = tokenCodec.hash(code.trim());
    CustomerScope scope = resolveScope(account, codeHash);
    CustomerPrincipal customer = scopedPrincipal(account.principal(), scope);
    String token = tokenCodec.newSessionToken();
    Instant expiresAt = now.plus(sessionTtl);
    jdbcTemplate.update(
        """
        INSERT INTO cp_customer_sessions (
          customer_id, scope_customer_id, session_token_hash, expires_at, last_seen_at,
          ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        customer.id(),
        customer.scopeCustomerId(),
        tokenCodec.hash(token),
        Timestamp.from(expiresAt),
        Timestamp.from(now),
        ClientInfo.trim(ClientInfo.ip(httpRequest), 64),
        ClientInfo.trim(ClientInfo.userAgent(httpRequest), 512),
        Timestamp.from(now)
    );
    return new CustomerLoginResponse(
        token,
        expiresAt.toString(),
        new CustomerLoginResponse.CustomerView(
            customer.publicId(), customer.username(), customer.displayName(),
            customer.partyRole(), customer.status(),
            customer.scopeCustomerPublicId(),
            customer.scopeCustomerDisplayName(),
            customer.scopeCustomerPartyRole()
        )
    );
  }

  public CustomerPrincipal authenticate(String token, HttpServletRequest request) {
    if (token == null || token.isBlank()) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Missing customer token");
    }
    Instant now = Instant.now();
    expireSessions(now);
    String hash = tokenCodec.hash(token);
    List<CustomerPrincipal> customers = jdbcTemplate.query(
        """
        SELECT c.id, c.public_id, c.username, c.display_name, c.party_role, c.status,
               scoped.id AS scope_customer_id,
               scoped.public_id AS scope_customer_public_id,
               scoped.display_name AS scope_customer_display_name,
               scoped.party_role AS scope_customer_party_role
        FROM cp_customer_sessions s
        JOIN cp_customers c ON c.id = s.customer_id
        LEFT JOIN cp_customers scoped ON scoped.id = s.scope_customer_id
        WHERE s.session_token_hash = ?
          AND s.revoked_at IS NULL
          AND s.expires_at > ?
          AND c.status = 'ACTIVE'
          AND (
            (UPPER(c.party_role) <> 'OVERSEA_AGENT'
              AND scoped.id = c.id
              AND scoped.status = 'ACTIVE')
            OR
            (UPPER(c.party_role) = 'OVERSEA_AGENT' AND s.scope_customer_id IS NULL)
          )
        """,
        this::mapCustomer,
        hash,
        Timestamp.from(now)
    );
    if (customers.isEmpty()) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid or expired customer token");
    }
    jdbcTemplate.update(
        """
        UPDATE cp_customer_sessions
        SET last_seen_at = ?, ip_address = ?, user_agent = ?
        WHERE session_token_hash = ? AND revoked_at IS NULL
        """,
        Timestamp.from(now),
        ClientInfo.trim(ClientInfo.ip(request), 64),
        ClientInfo.trim(ClientInfo.userAgent(request), 512),
        hash
    );
    return customers.get(0);
  }

  public void logout(String token) {
    if (token == null || token.isBlank()) return;
    jdbcTemplate.update(
        "UPDATE cp_customer_sessions SET revoked_at = ? WHERE session_token_hash = ? AND revoked_at IS NULL",
        Timestamp.from(Instant.now()),
        tokenCodec.hash(token)
    );
  }

  public long sessionTtlHours() {
    return sessionTtl.toHours();
  }

  private void expireSessions(Instant now) {
    jdbcTemplate.update(
        "UPDATE cp_customer_sessions SET revoked_at = ? WHERE revoked_at IS NULL AND expires_at <= ?",
        Timestamp.from(now),
        Timestamp.from(now)
    );
  }

  private CustomerPrincipal mapCustomer(ResultSet rs, int rowNumber) throws SQLException {
    return new CustomerPrincipal(
        rs.getLong("id"),
        rs.getString("public_id"),
        rs.getString("username"),
        rs.getString("display_name"),
        rs.getString("party_role"),
        rs.getString("status"),
        nullableLong(rs, "scope_customer_id"),
        rs.getString("scope_customer_public_id"),
        rs.getString("scope_customer_display_name"),
        rs.getString("scope_customer_party_role")
    );
  }

  private CustomerAccount mapCustomerAccount(ResultSet rs, int rowNumber) throws SQLException {
    int iterations = rs.getInt("password_iterations");
    Integer nullableIterations = rs.wasNull() ? null : iterations;
    return new CustomerAccount(
        new CustomerPrincipal(
            rs.getLong("id"),
            rs.getString("public_id"),
            rs.getString("username"),
            rs.getString("display_name"),
            rs.getString("party_role"),
            rs.getString("status")
        ),
        rs.getString("password_salt"),
        rs.getString("password_hash"),
        nullableIterations,
        rs.getString("customer_code_hash")
    );
  }

  private CustomerScope resolveScope(CustomerAccount account, String codeHash) {
    CustomerPrincipal principal = account.principal();
    if (!codeHash.equals(account.customerCodeHash())) throw invalidCredentials();
    if (principal.isOverseaAgent()) return null;
    return new CustomerScope(
        principal.id(),
        principal.publicId(),
        principal.displayName(),
        principal.partyRole()
    );
  }

  private CustomerPrincipal scopedPrincipal(
      CustomerPrincipal principal,
      CustomerScope scope
  ) {
    if (scope == null) return principal;
    return new CustomerPrincipal(
        principal.id(),
        principal.publicId(),
        principal.username(),
        principal.displayName(),
        principal.partyRole(),
        principal.status(),
        scope.id(),
        scope.publicId(),
        scope.displayName(),
        scope.partyRole()
    );
  }

  private Long nullableLong(ResultSet rs, String column) throws SQLException {
    long value = rs.getLong(column);
    return rs.wasNull() ? null : value;
  }

  private ApiException invalidCredentials() {
    return new ApiException(HttpStatus.UNAUTHORIZED, "Invalid customer credentials");
  }

  private record CustomerAccount(
      CustomerPrincipal principal,
      String passwordSalt,
      String passwordHash,
      Integer passwordIterations,
      String customerCodeHash
  ) {}

  private record CustomerScope(
      long id,
      String publicId,
      String displayName,
      String partyRole
  ) {}
}
