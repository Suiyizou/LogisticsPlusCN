package com.cargoplanner.backend.dashboard;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class BusinessDashboardService {
  static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

  private final JdbcTemplate jdbcTemplate;
  private final Clock clock;

  @Autowired
  public BusinessDashboardService(JdbcTemplate jdbcTemplate) {
    this(jdbcTemplate, Clock.system(BUSINESS_ZONE));
  }

  BusinessDashboardService(JdbcTemplate jdbcTemplate, Clock clock) {
    this.jdbcTemplate = jdbcTemplate;
    this.clock = clock;
  }

  public Map<String, Object> todayStats(AuthenticatedUser actor) {
    requireBusinessManager(actor);
    LocalDate date = LocalDate.now(clock.withZone(BUSINESS_ZONE));
    Instant start = date.atStartOfDay(BUSINESS_ZONE).toInstant();
    Instant end = date.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant();
    Timestamp startTimestamp = Timestamp.from(start);
    Timestamp endTimestamp = Timestamp.from(end);
    boolean global = actor.isAdmin();

    long newShipments = global
        ? count(
            """
            SELECT COUNT(*) FROM cp_shipments s
            WHERE s.created_at >= ? AND s.created_at < ?
            """,
            startTimestamp, endTimestamp
        )
        : count(
            """
            SELECT COUNT(*) FROM cp_shipments s
            WHERE s.created_at >= ? AND s.created_at < ?
              AND s.responsible_agent_id = ?
            """,
            startTimestamp, endTimestamp, actor.id()
        );
    long updatedShipments = global
        ? count(
            """
            SELECT COUNT(*) FROM cp_shipments s
            WHERE s.updated_at >= ? AND s.updated_at < ?
              AND s.created_at < ?
            """,
            startTimestamp, endTimestamp, startTimestamp
        )
        : count(
            """
            SELECT COUNT(*) FROM cp_shipments s
            WHERE s.updated_at >= ? AND s.updated_at < ?
              AND s.created_at < ?
              AND s.responsible_agent_id = ?
            """,
            startTimestamp, endTimestamp, startTimestamp, actor.id()
        );
    long followUpFiles = global
        ? count(
            """
            SELECT COUNT(*)
            FROM cp_shipment_files f
            JOIN cp_shipments s ON s.id = f.shipment_id
            WHERE f.created_at >= ? AND f.created_at < ?
              AND f.status <> 'DELETED'
            """,
            startTimestamp, endTimestamp
        )
        : count(
            """
            SELECT COUNT(*)
            FROM cp_shipment_files f
            JOIN cp_shipments s ON s.id = f.shipment_id
            WHERE f.created_at >= ? AND f.created_at < ?
              AND f.status <> 'DELETED'
              AND s.responsible_agent_id = ?
            """,
            startTimestamp, endTimestamp, actor.id()
        );
    long messages = global
        ? count(
            """
            SELECT COUNT(*)
            FROM cp_shipment_file_comments c
            JOIN cp_shipments s ON s.id = c.shipment_id
            WHERE c.created_at >= ? AND c.created_at < ?
            """,
            startTimestamp, endTimestamp
        )
        : count(
            """
            SELECT COUNT(*)
            FROM cp_shipment_file_comments c
            JOIN cp_shipments s ON s.id = c.shipment_id
            WHERE c.created_at >= ? AND c.created_at < ?
              AND s.responsible_agent_id = ?
            """,
            startTimestamp, endTimestamp, actor.id()
        );
    long customerLogins = global
        ? count(
            """
            SELECT COUNT(*)
            FROM cp_customer_sessions sessions
            WHERE sessions.created_at >= ? AND sessions.created_at < ?
            """,
            startTimestamp, endTimestamp
        )
        : count(
            """
            SELECT COUNT(*)
            FROM cp_customer_sessions sessions
            JOIN cp_customers customer ON customer.id = sessions.customer_id
            WHERE sessions.created_at >= ? AND sessions.created_at < ?
              AND customer.responsible_agent_id = ?
            """,
            startTimestamp, endTimestamp, actor.id()
        );

    Map<String, Object> definitions = new LinkedHashMap<>();
    definitions.put("newShipments", "created_at is within the current business day");
    definitions.put(
        "updatedShipments",
        "updated_at is within the current business day and created_at is before today"
    );
    definitions.put(
        "followUpFiles",
        "non-deleted files created today on shipments in the operator scope"
    );
    definitions.put("messages", "shipment comments created today in the operator scope");
    definitions.put(
        "customerLogins",
        "customer sessions created today for customers in the operator scope"
    );

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("date", date.toString());
    response.put("timeZone", BUSINESS_ZONE.getId());
    response.put("scope", global ? "GLOBAL" : "RESPONSIBLE_AGENT");
    response.put("newShipments", newShipments);
    response.put("updatedShipments", updatedShipments);
    response.put("followUpFiles", followUpFiles);
    response.put("messages", messages);
    response.put("customerLogins", customerLogins);
    response.put("definitions", definitions);
    return response;
  }

  private long count(String sql, Object... parameters) {
    Long value = jdbcTemplate.queryForObject(sql, Long.class, parameters);
    return value == null ? 0L : value;
  }

  private void requireBusinessManager(AuthenticatedUser actor) {
    if (actor == null || (!actor.isBusiness() && !actor.isAdmin())) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Business operator or administrator permission is required"
      );
    }
  }
}
