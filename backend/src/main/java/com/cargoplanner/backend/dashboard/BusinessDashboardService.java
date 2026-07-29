package com.cargoplanner.backend.dashboard;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
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
              AND (s.responsible_agent_id = ? OR EXISTS (
                SELECT 1 FROM cp_shipment_participants participant
                WHERE participant.shipment_id = s.id AND participant.user_id = ?
              ))
            """,
            startTimestamp, endTimestamp, actor.id(), actor.id()
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
              AND (s.responsible_agent_id = ? OR EXISTS (
                SELECT 1 FROM cp_shipment_participants participant
                WHERE participant.shipment_id = s.id AND participant.user_id = ?
              ))
            """,
            startTimestamp, endTimestamp, startTimestamp, actor.id(), actor.id()
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
              AND (s.responsible_agent_id = ? OR EXISTS (
                SELECT 1 FROM cp_shipment_participants participant
                WHERE participant.shipment_id = s.id AND participant.user_id = ?
              ))
            """,
            startTimestamp, endTimestamp, actor.id(), actor.id()
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
              AND (s.responsible_agent_id = ? OR EXISTS (
                SELECT 1 FROM cp_shipment_participants participant
                WHERE participant.shipment_id = s.id AND participant.user_id = ?
              ))
            """,
            startTimestamp, endTimestamp, actor.id(), actor.id()
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
    response.put("scope", global ? "GLOBAL" : "SHIPMENT_ACCESS");
    response.put("newShipments", newShipments);
    response.put("updatedShipments", updatedShipments);
    response.put("followUpFiles", followUpFiles);
    response.put("messages", messages);
    response.put("customerLogins", customerLogins);
    response.putAll(resourceStats(actor));
    response.put("dailyTrend", dailyTrend(actor, date));
    response.put("shipmentStatusDistribution", shipmentStatusDistribution(actor));
    response.put("definitions", definitions);
    return response;
  }

  private Map<String, Object> resourceStats(AuthenticatedUser actor) {
    boolean global = actor.isAdmin();
    long shipmentTotal = global
        ? count("SELECT COUNT(*) FROM cp_shipments")
        : count(
            """
            SELECT COUNT(*) FROM cp_shipments s
            WHERE s.responsible_agent_id = ? OR EXISTS (
              SELECT 1 FROM cp_shipment_participants participant
              WHERE participant.shipment_id = s.id AND participant.user_id = ?
            )
            """,
            actor.id(), actor.id()
        );
    long customerTotal = global
        ? count(
            """
            SELECT COUNT(*) FROM cp_customers
            WHERE status = 'ACTIVE' AND party_role IN ('SHIPPER', 'CONSIGNEE')
            """
        )
        : count(
            """
            SELECT COUNT(*) FROM cp_customers
            WHERE status = 'ACTIVE' AND party_role IN ('SHIPPER', 'CONSIGNEE')
              AND responsible_agent_id = ?
            """,
            actor.id()
        );
    long activeAgentCount = count(
        "SELECT COUNT(*) FROM cp_users WHERE role = 'OVERSEA_AGENT' AND status = 'ACTIVE'"
    );
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("shipmentTotal", shipmentTotal);
    result.put("customerTotal", customerTotal);
    result.put("activeCustomerCount", customerTotal);
    result.put("activeAgentCount", activeAgentCount);
    return result;
  }

  private List<Map<String, Object>> dailyTrend(
      AuthenticatedUser actor,
      LocalDate today
  ) {
    LocalDate firstDay = today.minusDays(6);
    Timestamp start = Timestamp.from(firstDay.atStartOfDay(BUSINESS_ZONE).toInstant());
    Timestamp end = Timestamp.from(today.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant());
    Map<LocalDate, long[]> counts = new LinkedHashMap<>();
    for (int offset = 0; offset < 7; offset++) {
      counts.put(firstDay.plusDays(offset), new long[] {0L, 0L});
    }
    collectDailyCounts(
        counts,
        """
        SELECT CAST(s.created_at AS DATE) AS event_day, COUNT(*) AS event_count
        FROM cp_shipments s
        WHERE s.created_at >= ? AND s.created_at < ?
        """,
        actor,
        start,
        end,
        0
    );
    collectDailyCounts(
        counts,
        """
        SELECT CAST(s.updated_at AS DATE) AS event_day, COUNT(*) AS event_count
        FROM cp_shipments s
        WHERE s.updated_at >= ? AND s.updated_at < ?
          AND s.updated_at > s.created_at
        """,
        actor,
        start,
        end,
        1
    );
    List<Map<String, Object>> result = new ArrayList<>();
    counts.forEach((day, values) -> {
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("date", day.toString());
      item.put("created", values[0]);
      item.put("updated", values[1]);
      result.add(item);
    });
    return result;
  }

  private void collectDailyCounts(
      Map<LocalDate, long[]> target,
      String sqlPrefix,
      AuthenticatedUser actor,
      Timestamp start,
      Timestamp end,
      int valueIndex
  ) {
    boolean global = actor.isAdmin();
    String sql = sqlPrefix
        + (global ? "" : """
             AND (s.responsible_agent_id = ? OR EXISTS (
               SELECT 1 FROM cp_shipment_participants participant
               WHERE participant.shipment_id = s.id AND participant.user_id = ?
             ))
            """)
        + " GROUP BY CAST(" + (valueIndex == 0 ? "s.created_at" : "s.updated_at") + " AS DATE)"
        + " ORDER BY event_day";
    List<Object> parameters = new ArrayList<>(List.of(start, end));
    if (!global) {
      parameters.add(actor.id());
      parameters.add(actor.id());
    }
    jdbcTemplate.query(
        sql,
        rs -> {
          LocalDate day = rs.getDate("event_day").toLocalDate();
          long[] values = target.get(day);
          if (values != null) values[valueIndex] = rs.getLong("event_count");
        },
        parameters.toArray()
    );
  }

  private List<Map<String, Object>> shipmentStatusDistribution(AuthenticatedUser actor) {
    boolean global = actor.isAdmin();
    String sql = """
        SELECT COALESCE(NULLIF(TRIM(s.tracking_status), ''), 'UNKNOWN') AS status_name,
               COUNT(*) AS status_count
        FROM cp_shipments s
        """
        + (global ? "" : """
             WHERE s.responsible_agent_id = ? OR EXISTS (
               SELECT 1 FROM cp_shipment_participants participant
               WHERE participant.shipment_id = s.id AND participant.user_id = ?
             )
            """)
        + " GROUP BY COALESCE(NULLIF(TRIM(s.tracking_status), ''), 'UNKNOWN')"
        + " ORDER BY status_count DESC, status_name";
    List<Map<String, Object>> result = new ArrayList<>();
    jdbcTemplate.query(
        sql,
        rs -> {
          Map<String, Object> item = new LinkedHashMap<>();
          item.put("name", rs.getString("status_name"));
          item.put("value", rs.getLong("status_count"));
          result.add(item);
        },
        global ? new Object[0] : new Object[] {actor.id(), actor.id()}
    );
    return result;
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
