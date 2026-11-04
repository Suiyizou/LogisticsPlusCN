package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class PublishedShipmentTaskRepository {
  private static final String TERMINAL_ITEMS = "'SUCCEEDED','FAILED','MANUAL','CANCELLED'";
  private final JdbcTemplate jdbc;
  private final ObjectMapper json;

  PublishedShipmentTaskRepository(JdbcTemplate jdbc, ObjectMapper json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  void insertDraft(String id, long ownerId, ShipmentBatchDraftRequest draft, Instant now) {
    jdbc.update("""
        INSERT INTO cp_shipment_batch_tasks
          (task_id, owner_id, status, revision, draft_json, created_at, updated_at,
           source_file_name, tracking_channel, task_mode, customer_public_id, publish_to_customer, draft_item_count)
        VALUES (?, ?, 'DRAFT', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, id, ownerId, encode(draft), timestamp(now), timestamp(now), draft.sourceFileName(),
        draft.channel(), draft.mode(), draft.customerId(), draft.publishToCustomer(), draft.items().size());
  }

  Task findTask(String id, boolean lock) {
    return jdbc.query(
        "SELECT * FROM cp_shipment_batch_tasks WHERE task_id = ?" + (lock ? " FOR UPDATE" : ""),
        (rs, row) -> readTask(rs), id
    ).stream().findFirst().orElse(null);
  }

  List<Task> listTasks(long ownerId, int limit) {
    return jdbc.query("""
        SELECT * FROM cp_shipment_batch_tasks
        WHERE owner_id = ?
        ORDER BY created_at DESC, task_id DESC LIMIT ?
        """, (rs, row) -> readTask(rs), ownerId, limit);
  }

  List<Overview> listOverviews(long ownerId, int limit) {
    return jdbc.query("""
        SELECT t.task_id, t.status, t.revision, t.source_file_name, t.tracking_channel, t.task_mode,
               t.customer_public_id, t.publish_to_customer, t.draft_item_count, t.cancel_requested,
               t.created_at, t.updated_at, t.published_at, t.started_at, t.finished_at,
               (SELECT i.next_attempt_at FROM cp_shipment_batch_items i
                WHERE i.task_id = t.task_id AND i.next_attempt_at IS NOT NULL
                ORDER BY i.row_no LIMIT 1) AS next_attempt_at
        FROM cp_shipment_batch_tasks t
        WHERE t.owner_id = ?
        ORDER BY t.created_at DESC, t.task_id DESC LIMIT ?
        """, (rs, row) -> new Overview(rs.getString("task_id"), rs.getString("status"), rs.getInt("revision"),
        rs.getString("source_file_name"), rs.getString("tracking_channel"), rs.getString("task_mode"),
        rs.getString("customer_public_id"), rs.getBoolean("publish_to_customer"), rs.getInt("draft_item_count"),
        rs.getBoolean("cancel_requested"), instant(rs, "created_at"), instant(rs, "updated_at"),
        instant(rs, "published_at"), instant(rs, "started_at"), instant(rs, "finished_at"),
        instant(rs, "next_attempt_at")), ownerId, limit);
  }

  Map<String, Map<String, Integer>> countItemsByStatus(List<String> taskIds) {
    if (taskIds.isEmpty()) return Map.of();
    Map<String, Map<String, Integer>> counts = new HashMap<>();
    String placeholders = String.join(", ", Collections.nCopies(taskIds.size(), "?"));
    jdbc.query("""
        SELECT task_id, status, COUNT(*) AS item_count
        FROM cp_shipment_batch_items
        WHERE task_id IN (%s)
        GROUP BY task_id, status
        """.formatted(placeholders), rs -> {
          counts.computeIfAbsent(rs.getString("task_id"), id -> new HashMap<>())
              .put(rs.getString("status"), rs.getInt("item_count"));
        }, taskIds.toArray());
    return counts;
  }

  void updateDraft(Task task, ShipmentBatchDraftRequest draft, Instant now) {
    jdbc.update("""
        UPDATE cp_shipment_batch_tasks
        SET revision = revision + 1, draft_json = ?, updated_at = ?, source_file_name = ?,
            tracking_channel = ?, task_mode = ?, customer_public_id = ?, publish_to_customer = ?, draft_item_count = ?
        WHERE task_id = ?
        """, encode(draft), timestamp(now), draft.sourceFileName(), draft.channel(), draft.mode(),
        draft.customerId(), draft.publishToCustomer(), draft.items().size(), task.id());
  }

  void publish(Task task, List<ShipmentBatchItemRequest> items, Instant now) {
    jdbc.update("""
        UPDATE cp_shipment_batch_tasks
        SET status = 'QUEUED', published_at = ?, updated_at = ?
        WHERE task_id = ?
        """, timestamp(now), timestamp(now), task.id());
    for (int row = 0; row < items.size(); row++) {
      jdbc.update("""
          INSERT INTO cp_shipment_batch_items
            (task_id, row_no, item_json, status, updated_at, next_attempt_at)
          VALUES (?, ?, ?, 'PENDING', ?, ?)
          """, task.id(), row, encode(items.get(row)), timestamp(now), timestamp(now));
    }
  }

  void cancel(Task task, Instant now) {
    jdbc.update("""
        UPDATE cp_shipment_batch_tasks SET cancel_requested = TRUE, updated_at = ?
        WHERE task_id = ?
        """, timestamp(now), task.id());
    jdbc.update("""
        UPDATE cp_shipment_batch_items
        SET status = 'CANCELLED', finished_at = ?, updated_at = ?, next_attempt_at = NULL,
            lease_token = NULL, lease_until = NULL
        WHERE task_id = ? AND dispatch_started_at IS NULL AND status NOT IN (%s)
        """.formatted(TERMINAL_ITEMS), timestamp(now), timestamp(now), task.id());
    jdbc.update("""
        UPDATE cp_shipment_batch_items SET next_attempt_at = ?
        WHERE task_id = ? AND status NOT IN (%s)
        """.formatted(TERMINAL_ITEMS), timestamp(now), task.id());
  }

  void retry(Item item, boolean queryAgain, Instant now) {
    if (queryAgain) {
      jdbc.update("""
          INSERT INTO cp_shipment_batch_item_attempts
            (task_id, row_no, run_no, status, local_job_id, result_json,
             error_code, error_message, started_at, finished_at)
          SELECT task_id, row_no, run_no, status, local_job_id, result_json,
                 error_code, error_message, started_at, finished_at
          FROM cp_shipment_batch_items WHERE task_id = ? AND row_no = ?
          """, item.taskId(), item.row());
      jdbc.update("""
          UPDATE cp_shipment_batch_items
          SET run_no = run_no + 1, dispatch_started_at = NULL, local_job_id = NULL, result_json = NULL,
              started_at = NULL
          WHERE task_id = ? AND row_no = ?
          """, item.taskId(), item.row());
    }
    jdbc.update("""
        UPDATE cp_shipment_batch_items
        SET status = ?, next_attempt_at = ?, updated_at = ?, finished_at = NULL,
            failure_count = 0, error_code = NULL, error_message = NULL
        WHERE task_id = ? AND row_no = ?
        """, queryAgain || item.result() == null ? "PENDING" : "PERSISTING",
        timestamp(now), timestamp(now), item.taskId(), item.row());
  }

  AuthenticatedUser owner(long ownerId) {
    return jdbc.query("""
        SELECT id, username, display_name, role, status, party_role FROM cp_users WHERE id = ?
        """, (rs, row) -> new AuthenticatedUser(rs.getLong("id"), rs.getString("username"),
        rs.getString("display_name"), rs.getString("role"), rs.getString("status"),
        rs.getString("party_role")), ownerId).stream().findFirst().orElse(null);
  }

  List<Item> listItems(String taskId) {
    return jdbc.query("""
        SELECT task_id, row_no, item_json, status, run_no, dispatch_started_at, local_job_id,
               NULL AS result_json,
               payload_json, shipment_public_id, error_code, error_message, failure_count,
               next_attempt_at, lease_token, started_at, updated_at, finished_at
        FROM cp_shipment_batch_items WHERE task_id = ? ORDER BY row_no
        """, (rs, row) -> readItem(rs), taskId);
  }

  Item findItem(ItemKey key) {
    return jdbc.query("SELECT * FROM cp_shipment_batch_items WHERE task_id = ? AND row_no = ?",
        (rs, row) -> readItem(rs), key.taskId(), key.row()).stream().findFirst().orElse(null);
  }

  List<ItemKey> due(Instant now) {
    return jdbc.query("""
        SELECT i.task_id, i.row_no
        FROM cp_shipment_batch_items i
        JOIN cp_shipment_batch_tasks t ON t.task_id = i.task_id
        WHERE t.status IN ('QUEUED', 'WAITING', 'RUNNING', 'STOPPING')
          AND i.next_attempt_at <= ? AND (i.lease_until IS NULL OR i.lease_until <= ?)
          AND NOT EXISTS (
            SELECT 1 FROM cp_shipment_batch_items earlier
            WHERE earlier.task_id = i.task_id AND earlier.row_no < i.row_no
              AND earlier.status NOT IN (%s)
          )
        ORDER BY i.next_attempt_at, i.task_id, i.row_no
        LIMIT 12
        """.formatted(TERMINAL_ITEMS), (rs, row) -> new ItemKey(rs.getString(1), rs.getInt(2)),
        timestamp(now), timestamp(now));
  }

  boolean claim(ItemKey key, String token, Instant now, Instant until) {
    Integer firstPending = jdbc.queryForObject("""
        SELECT MIN(row_no) FROM cp_shipment_batch_items
        WHERE task_id = ? AND status NOT IN (%s)
        """.formatted(TERMINAL_ITEMS), Integer.class, key.taskId());
    if (firstPending == null || firstPending != key.row()) return false;
    return jdbc.update("""
        UPDATE cp_shipment_batch_items
        SET lease_token = ?, lease_until = ?, started_at = COALESCE(started_at, ?), updated_at = ?
        WHERE task_id = ? AND row_no = ? AND next_attempt_at <= ?
          AND (lease_until IS NULL OR lease_until <= ?)
        """, token, timestamp(until), timestamp(now), timestamp(now),
        key.taskId(), key.row(), timestamp(now), timestamp(now)) == 1;
  }

  void delayNextItem(Item item, Instant due) {
    jdbc.update("""
        UPDATE cp_shipment_batch_items SET next_attempt_at = ?
        WHERE task_id = ? AND row_no = ? AND status = 'PENDING' AND next_attempt_at < ?
        """, timestamp(due), item.taskId(), item.row() + 1, timestamp(due));
  }

  void markDispatchStarted(Item item, Instant now) {
    jdbc.update("""
        UPDATE cp_shipment_batch_items
        SET dispatch_started_at = ?, status = 'RUNNING', updated_at = ?
        WHERE task_id = ? AND row_no = ?
        """, timestamp(now), timestamp(now), item.taskId(), item.row());
  }

  void advance(Item item, Outcome outcome, Instant now) {
    jdbc.update("""
        UPDATE cp_shipment_batch_items
        SET status = ?, local_job_id = COALESCE(?, local_job_id),
            result_json = COALESCE(?, result_json), payload_json = COALESCE(?, payload_json),
            shipment_public_id = COALESCE(?, shipment_public_id), error_code = ?, error_message = ?,
            failure_count = ?, next_attempt_at = ?, lease_token = NULL, lease_until = NULL,
            updated_at = ?, finished_at = ?
        WHERE task_id = ? AND row_no = ?
        """, outcome.status(), outcome.jobId(), encodeNullable(outcome.result()),
        encodeNullable(outcome.payload()), outcome.shipmentId(), limit(outcome.errorCode(), 120), limit(outcome.errorMessage(), 1000),
        outcome.failureCount(), timestamp(outcome.nextAttempt()), timestamp(now),
        outcome.nextAttempt() == null ? timestamp(now) : null, item.taskId(), item.row());
  }

  void setTaskProgress(Task task, String status, Instant now, boolean started, boolean finished) {
    jdbc.update("""
        UPDATE cp_shipment_batch_tasks
        SET status = ?, updated_at = ?, started_at = COALESCE(started_at, ?), finished_at = ?
        WHERE task_id = ?
        """, status, timestamp(now), started ? timestamp(now) : null,
        finished ? timestamp(now) : null, task.id());
  }

  void refreshTaskProgress(String id, Instant now) {
    Task task = findTask(id, false);
    String pending = jdbc.query("""
        SELECT status FROM cp_shipment_batch_items
        WHERE task_id = ? AND status NOT IN (%s) ORDER BY row_no LIMIT 1
        """.formatted(TERMINAL_ITEMS), (rs, row) -> rs.getString(1), id).stream().findFirst().orElse(null);
    String status;
    if (task.cancelled()) {
      status = pending == null ? "STOPPED" : "STOPPING";
    } else if (pending == null) {
      status = "COMPLETED";
    } else if ("WAITING".equals(pending)) {
      status = "WAITING";
    } else {
      status = task.started() == null ? "QUEUED" : "RUNNING";
    }
    setTaskProgress(task, status, now, false, pending == null);
  }

  private Task readTask(ResultSet rs) throws SQLException {
    return new Task(rs.getString("task_id"), rs.getLong("owner_id"), rs.getString("status"),
        rs.getInt("revision"), decode(rs.getString("draft_json"), ShipmentBatchDraftRequest.class),
        rs.getBoolean("cancel_requested"), instant(rs, "created_at"), instant(rs, "updated_at"),
        instant(rs, "published_at"), instant(rs, "started_at"), instant(rs, "finished_at"));
  }

  private Item readItem(ResultSet rs) throws SQLException {
    return new Item(rs.getString("task_id"), rs.getInt("row_no"),
        decode(rs.getString("item_json"), ShipmentBatchItemRequest.class), rs.getString("status"),
        rs.getInt("run_no"), instant(rs, "dispatch_started_at"), rs.getString("local_job_id"),
        decode(rs.getString("result_json"), JsonNode.class), decode(rs.getString("payload_json"), JsonNode.class),
        rs.getString("shipment_public_id"), rs.getString("error_code"), rs.getString("error_message"),
        rs.getInt("failure_count"), instant(rs, "next_attempt_at"), rs.getString("lease_token"),
        instant(rs, "started_at"), instant(rs, "updated_at"), instant(rs, "finished_at"));
  }

  String encode(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (JsonProcessingException error) {
      throw new IllegalStateException("Could not serialize a shipment task", error);
    }
  }

  private String encodeNullable(JsonNode value) {
    return value == null ? null : encode(value);
  }

  private <T> T decode(String value, Class<T> type) {
    if (value == null) return null;
    try {
      return json.readValue(value, type);
    } catch (JsonProcessingException error) {
      throw new IllegalStateException("Could not read a shipment task", error);
    }
  }

  private static Instant instant(ResultSet rs, String name) throws SQLException {
    Timestamp value = rs.getTimestamp(name);
    return value == null ? null : value.toInstant();
  }

  private static String limit(String value, int length) {
    return value == null ? null : value.substring(0, Math.min(value.length(), length));
  }

  private static Timestamp timestamp(Instant value) {
    return value == null ? null : Timestamp.from(value);
  }

  record Task(String id, long ownerId, String status, int revision, ShipmentBatchDraftRequest draft,
      boolean cancelled, Instant created, Instant updated, Instant published, Instant started, Instant finished) {
    Overview overview(Instant nextAttempt) {
      return new Overview(id, status, revision, draft.sourceFileName(), draft.channel(), draft.mode(),
          draft.customerId(), Boolean.TRUE.equals(draft.publishToCustomer()), draft.items().size(),
          cancelled, created, updated, published, started, finished, nextAttempt);
    }
  }

  record Overview(String id, String status, int revision, String sourceFileName, String channel, String mode,
      String customerId, boolean publishToCustomer, int draftItemCount, boolean cancelled,
      Instant created, Instant updated, Instant published, Instant started, Instant finished, Instant nextAttempt) {}

  record ItemKey(String taskId, int row) {}

  record Item(String taskId, int row, ShipmentBatchItemRequest input, String status, int run,
      Instant dispatched, String jobId, JsonNode result, JsonNode payload, String shipmentId, String errorCode,
      String errorMessage, int failures, Instant nextAttempt, String lease,
      Instant started, Instant updated, Instant finished) {
    ItemKey key() {
      return new ItemKey(taskId, row);
    }

    String dispatchKey() {
      return taskId + ":row:" + row + ":run:" + run;
    }
  }

  record Outcome(String status, String jobId, JsonNode result, JsonNode payload, String shipmentId,
      String errorCode, String errorMessage, int failureCount, Instant nextAttempt) {}
}
