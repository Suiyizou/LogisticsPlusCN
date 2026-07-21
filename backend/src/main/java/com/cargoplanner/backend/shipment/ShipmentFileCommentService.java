package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShipmentFileCommentService {
  private static final int MAX_BODY_LENGTH = 2_000;
  private static final int MAX_COMMENTS = 500;

  private final JdbcTemplate jdbcTemplate;
  private final ShipmentAccessService accessService;
  private final Clock clock;

  public ShipmentFileCommentService(
      JdbcTemplate jdbcTemplate,
      ShipmentAccessService accessService
  ) {
    this(jdbcTemplate, accessService, Clock.systemUTC());
  }

  ShipmentFileCommentService(
      JdbcTemplate jdbcTemplate,
      ShipmentAccessService accessService,
      Clock clock
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.accessService = accessService;
    this.clock = clock;
  }

  public Map<String, Object> list(String shipmentPublicId, AuthenticatedUser user) {
    long shipmentId = accessService.requireAccess(shipmentPublicId, user).shipmentId();
    return response(comments(shipmentId));
  }

  public Map<String, Object> listCustomer(
      String shipmentPublicId,
      CustomerPrincipal customer
  ) {
    long shipmentId = accessService.requireCustomerAccess(shipmentPublicId, customer).shipmentId();
    return response(comments(shipmentId));
  }

  @Transactional
  public Map<String, Object> create(
      String shipmentPublicId,
      AuthenticatedUser user,
      ShipmentFileCommentRequest request
  ) {
    long shipmentId = accessService.requireAccess(shipmentPublicId, user).shipmentId();
    String publicId = UUID.randomUUID().toString();
    Instant createdAt = clock.instant();
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_file_comments (
          public_id, shipment_id, author_user_id, author_customer_id,
          author_display_name_snapshot, author_role_snapshot, body, created_at
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
        """,
        publicId,
        shipmentId,
        user.id(),
        displayName(user.displayName(), user.username()),
        actorRole(user.partyRole(), user.role()),
        normalizedBody(request),
        Timestamp.from(createdAt)
    );
    return requireComment(publicId, shipmentId);
  }

  @Transactional
  public Map<String, Object> createCustomer(
      String shipmentPublicId,
      CustomerPrincipal customer,
      ShipmentFileCommentRequest request
  ) {
    long shipmentId = accessService.requireCustomerAccess(shipmentPublicId, customer).shipmentId();
    String publicId = UUID.randomUUID().toString();
    Instant createdAt = clock.instant();
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_file_comments (
          public_id, shipment_id, author_user_id, author_customer_id,
          author_display_name_snapshot, author_role_snapshot, body, created_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
        """,
        publicId,
        shipmentId,
        customer.id(),
        displayName(customer.displayName(), customer.username()),
        actorRole(customer.partyRole(), "CUSTOMER"),
        normalizedBody(request),
        Timestamp.from(createdAt)
    );
    return requireComment(publicId, shipmentId);
  }

  private Map<String, Object> response(List<Map<String, Object>> items) {
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", items);
    response.put("total", items.size());
    return response;
  }

  private List<Map<String, Object>> comments(long shipmentId) {
    return jdbcTemplate.query(
        """
        SELECT c.public_id, c.body, c.author_role_snapshot, c.created_at,
               c.author_user_id, c.author_customer_id,
               c.author_display_name_snapshot,
               u.display_name AS user_display_name,
               cu.display_name AS customer_display_name
        FROM cp_shipment_file_comments c
        LEFT JOIN cp_users u ON u.id = c.author_user_id
        LEFT JOIN cp_customers cu ON cu.id = c.author_customer_id
        WHERE c.shipment_id = ?
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT ?
        """,
        this::commentMap,
        shipmentId,
        MAX_COMMENTS
    );
  }

  private Map<String, Object> requireComment(String publicId, long shipmentId) {
    List<Map<String, Object>> comments = jdbcTemplate.query(
        """
        SELECT c.public_id, c.body, c.author_role_snapshot, c.created_at,
               c.author_user_id, c.author_customer_id,
               c.author_display_name_snapshot,
               u.display_name AS user_display_name,
               cu.display_name AS customer_display_name
        FROM cp_shipment_file_comments c
        LEFT JOIN cp_users u ON u.id = c.author_user_id
        LEFT JOIN cp_customers cu ON cu.id = c.author_customer_id
        WHERE c.public_id = ? AND c.shipment_id = ?
        """,
        this::commentMap,
        publicId,
        shipmentId
    );
    if (comments.isEmpty()) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Shipment file message was not saved");
    }
    return comments.get(0);
  }

  private Map<String, Object> commentMap(ResultSet resultSet, int rowNumber) throws SQLException {
    boolean customerAuthor = resultSet.getObject("author_customer_id") != null;
    String displayName = customerAuthor
        ? resultSet.getString("customer_display_name")
        : resultSet.getString("user_display_name");
    if (displayName == null || displayName.isBlank()) {
      displayName = resultSet.getString("author_display_name_snapshot");
    }
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("id", resultSet.getString("public_id"));
    value.put("body", resultSet.getString("body"));
    value.put("authorDisplayName", displayName == null || displayName.isBlank()
        ? "Unknown user"
        : displayName);
    value.put("authorType", customerAuthor ? "CUSTOMER" : "INTERNAL");
    value.put("authorRole", resultSet.getString("author_role_snapshot"));
    Timestamp createdAt = resultSet.getTimestamp("created_at");
    value.put("createdAt", createdAt == null ? null : createdAt.toInstant().toString());
    return value;
  }

  private String normalizedBody(ShipmentFileCommentRequest request) {
    String body = request == null || request.body() == null ? "" : request.body().trim();
    if (body.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Message body is required");
    }
    if (body.length() > MAX_BODY_LENGTH) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Message body must not exceed " + MAX_BODY_LENGTH + " characters"
      );
    }
    return body;
  }

  private String actorRole(String preferred, String fallback) {
    String role = preferred == null || preferred.isBlank() ? fallback : preferred;
    return role == null || role.isBlank() ? "USER" : role.trim().toUpperCase();
  }

  private String displayName(String preferred, String fallback) {
    String value = preferred == null || preferred.isBlank() ? fallback : preferred;
    return value == null || value.isBlank() ? "Unknown user" : value.trim();
  }
}
