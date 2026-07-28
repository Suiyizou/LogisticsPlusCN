package com.cargoplanner.backend.announcement;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AnnouncementService {
  static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");
  private static final List<String> AUDIENCES = List.of("CUSTOMER", "EMPLOYEE", "ALL");
  private static final List<String> STATUSES = List.of("DRAFT", "PUBLISHED", "DISABLED");

  private final JdbcTemplate jdbcTemplate;
  private final Clock clock;

  @Autowired
  public AnnouncementService(JdbcTemplate jdbcTemplate) {
    this(jdbcTemplate, Clock.system(BUSINESS_ZONE));
  }

  AnnouncementService(JdbcTemplate jdbcTemplate, Clock clock) {
    this.jdbcTemplate = jdbcTemplate;
    this.clock = clock;
  }

  public Map<String, Object> listAdmin(
      AuthenticatedUser actor,
      int requestedPage,
      int requestedSize,
      String requestedStatus
  ) {
    requireAdmin(actor);
    int page = Math.max(0, requestedPage);
    int pageSize = Math.max(1, Math.min(100, requestedSize));
    String status = requestedStatus == null || requestedStatus.isBlank()
        ? null
        : normalizeStatus(requestedStatus, null);
    String where = status == null ? "" : " WHERE a.status = ?";
    Object[] listParameters = status == null
        ? new Object[] { pageSize, (long) page * pageSize }
        : new Object[] { status, pageSize, (long) page * pageSize };
    List<Map<String, Object>> items = jdbcTemplate.query(
        announcementSelect()
            + where
            + " ORDER BY a.display_date DESC, a.updated_at DESC, a.id DESC LIMIT ? OFFSET ?",
        this::mapAnnouncement,
        listParameters
    );
    Long totalValue = status == null
        ? jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cp_announcements", Long.class)
        : jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM cp_announcements WHERE status = ?",
            Long.class,
            status
        );
    return pageResult(items, page, pageSize, totalValue == null ? 0 : totalValue);
  }

  public Map<String, Object> getAdmin(long announcementId, AuthenticatedUser actor) {
    requireAdmin(actor);
    return requireAnnouncement(announcementId);
  }

  @Transactional
  public Map<String, Object> create(
      AnnouncementRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireAdmin(actor);
    NormalizedAnnouncement value = normalize(request, null);
    Instant now = clock.instant();
    Timestamp publishedAt = "PUBLISHED".equals(value.status()) ? Timestamp.from(now) : null;
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbcTemplate.update(connection -> {
      PreparedStatement statement = connection.prepareStatement(
          """
          INSERT INTO cp_announcements (
            title, content_markdown, image_url, illustration_ref, audience,
            display_date, status, created_by, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          new String[] { "id" }
      );
      statement.setString(1, value.title());
      statement.setString(2, value.contentMarkdown());
      statement.setString(3, value.imageUrl());
      statement.setString(4, value.illustrationRef());
      statement.setString(5, value.audience());
      statement.setDate(6, Date.valueOf(value.displayDate()));
      statement.setString(7, value.status());
      statement.setLong(8, actor.id());
      statement.setTimestamp(9, publishedAt);
      statement.setTimestamp(10, Timestamp.from(now));
      statement.setTimestamp(11, Timestamp.from(now));
      return statement;
    }, keyHolder);
    Number key = keyHolder.getKey();
    if (key == null) throw new IllegalStateException("Announcement id was not generated");
    long announcementId = key.longValue();
    audit(actor, "CREATE_ANNOUNCEMENT", announcementId, value.title(), ipAddress);
    return requireAnnouncement(announcementId);
  }

  @Transactional
  public Map<String, Object> update(
      long announcementId,
      AnnouncementRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireAdmin(actor);
    Map<String, Object> existing = requireAnnouncement(announcementId);
    NormalizedAnnouncement value = normalize(request, existing);
    Instant now = clock.instant();
    Timestamp publishedAt = "PUBLISHED".equals(value.status())
        && existing.get("publishedAt") == null
        ? Timestamp.from(now)
        : timestamp(existing.get("publishedAt"));
    jdbcTemplate.update(
        """
        UPDATE cp_announcements
        SET title = ?, content_markdown = ?, image_url = ?, illustration_ref = ?,
            audience = ?, display_date = ?, status = ?, published_at = ?, updated_at = ?
        WHERE id = ?
        """,
        value.title(),
        value.contentMarkdown(),
        value.imageUrl(),
        value.illustrationRef(),
        value.audience(),
        Date.valueOf(value.displayDate()),
        value.status(),
        publishedAt,
        Timestamp.from(now),
        announcementId
    );
    audit(actor, "UPDATE_ANNOUNCEMENT", announcementId, value.title(), ipAddress);
    return requireAnnouncement(announcementId);
  }

  @Transactional
  public Map<String, Object> publish(
      long announcementId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireAdmin(actor);
    Map<String, Object> existing = requireAnnouncement(announcementId);
    Instant now = clock.instant();
    jdbcTemplate.update(
        """
        UPDATE cp_announcements
        SET status = 'PUBLISHED', published_at = ?, updated_at = ?
        WHERE id = ?
        """,
        Timestamp.from(now),
        Timestamp.from(now),
        announcementId
    );
    audit(actor, "PUBLISH_ANNOUNCEMENT", announcementId, String.valueOf(existing.get("title")), ipAddress);
    return requireAnnouncement(announcementId);
  }

  @Transactional
  public Map<String, Object> disable(
      long announcementId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireAdmin(actor);
    Map<String, Object> existing = requireAnnouncement(announcementId);
    jdbcTemplate.update(
        "UPDATE cp_announcements SET status = 'DISABLED', updated_at = ? WHERE id = ?",
        Timestamp.from(clock.instant()),
        announcementId
    );
    audit(actor, "DISABLE_ANNOUNCEMENT", announcementId, String.valueOf(existing.get("title")), ipAddress);
    return requireAnnouncement(announcementId);
  }

  @Transactional
  public Map<String, Object> delete(
      long announcementId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    requireAdmin(actor);
    Map<String, Object> existing = requireAnnouncement(announcementId);
    jdbcTemplate.update("DELETE FROM cp_announcements WHERE id = ?", announcementId);
    audit(actor, "DELETE_ANNOUNCEMENT", announcementId, String.valueOf(existing.get("title")), ipAddress);
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("id", announcementId);
    response.put("deleted", true);
    return response;
  }

  public Map<String, Object> todayForEmployee(AuthenticatedUser actor) {
    if (actor == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Login is required");
    return today("EMPLOYEE", actor.id());
  }

  public Map<String, Object> todayForCustomer(CustomerPrincipal customer) {
    if (customer == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Customer login is required");
    return today("CUSTOMER", customer.id());
  }

  @Transactional
  public Map<String, Object> markReadForEmployee(long announcementId, AuthenticatedUser actor) {
    if (actor == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Login is required");
    return markRead(announcementId, "EMPLOYEE", actor.id());
  }

  @Transactional
  public Map<String, Object> markReadForCustomer(long announcementId, CustomerPrincipal customer) {
    if (customer == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Customer login is required");
    return markRead(announcementId, "CUSTOMER", customer.id());
  }

  private Map<String, Object> today(String readerType, long readerId) {
    LocalDate today = LocalDate.now(clock.withZone(BUSINESS_ZONE));
    List<Map<String, Object>> items = visibleToday(readerType, readerId, null, today);
    long unread = items.stream().filter(item -> !Boolean.TRUE.equals(item.get("read"))).count();
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("date", today.toString());
    response.put("audience", readerType);
    response.put("items", items);
    response.put("total", items.size());
    response.put("unreadCount", unread);
    return response;
  }

  private Map<String, Object> markRead(long announcementId, String readerType, long readerId) {
    LocalDate today = LocalDate.now(clock.withZone(BUSINESS_ZONE));
    List<Map<String, Object>> visible = visibleToday(readerType, readerId, announcementId, today);
    if (visible.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Today's visible announcement was not found");
    }
    Timestamp readAt = Timestamp.from(clock.instant());
    int updated = jdbcTemplate.update(
        """
        UPDATE cp_announcement_reads
        SET read_at = ?
        WHERE announcement_id = ? AND reader_type = ? AND reader_id = ?
        """,
        readAt,
        announcementId,
        readerType,
        readerId
    );
    if (updated == 0) {
      try {
        jdbcTemplate.update(
            """
            INSERT INTO cp_announcement_reads (announcement_id, reader_type, reader_id, read_at)
            VALUES (?, ?, ?, ?)
            """,
            announcementId,
            readerType,
            readerId,
            readAt
        );
      } catch (DuplicateKeyException ignored) {
        jdbcTemplate.update(
            """
            UPDATE cp_announcement_reads
            SET read_at = ?
            WHERE announcement_id = ? AND reader_type = ? AND reader_id = ?
            """,
            readAt,
            announcementId,
            readerType,
            readerId
        );
      }
    }
    Map<String, Object> response = new LinkedHashMap<>(visibleToday(
        readerType, readerId, announcementId, today
    ).get(0));
    response.put("markedRead", true);
    return response;
  }

  private List<Map<String, Object>> visibleToday(
      String readerType,
      long readerId,
      Long announcementId,
      LocalDate today
  ) {
    String audience = "CUSTOMER".equals(readerType) ? "CUSTOMER" : "EMPLOYEE";
    String idFilter = announcementId == null ? "" : " AND a.id = ?";
    Object[] parameters = announcementId == null
        ? new Object[] { readerType, readerId, Date.valueOf(today), audience }
        : new Object[] { readerType, readerId, Date.valueOf(today), audience, announcementId };
    return jdbcTemplate.query(
        """
        SELECT a.id, a.title, a.content_markdown, a.image_url, a.illustration_ref,
               a.audience, a.display_date, a.status, a.created_by, a.published_at,
               a.created_at, a.updated_at, reads.read_at
        FROM cp_announcements a
        LEFT JOIN cp_announcement_reads reads
          ON reads.announcement_id = a.id
         AND reads.reader_type = ?
         AND reads.reader_id = ?
        WHERE a.status = 'PUBLISHED'
          AND a.display_date = ?
          AND a.audience IN (?, 'ALL')
        """.stripTrailing()
            + idFilter
            + " ORDER BY a.published_at DESC, a.id DESC",
        this::mapAnnouncement,
        parameters
    );
  }

  private Map<String, Object> requireAnnouncement(long announcementId) {
    List<Map<String, Object>> values = jdbcTemplate.query(
        announcementSelect() + " WHERE a.id = ?",
        this::mapAnnouncement,
        announcementId
    );
    if (values.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Announcement not found");
    return values.get(0);
  }

  private String announcementSelect() {
    return """
        SELECT a.id, a.title, a.content_markdown, a.image_url, a.illustration_ref,
               a.audience, a.display_date, a.status, a.created_by, a.published_at,
               a.created_at, a.updated_at, NULL AS read_at
        FROM cp_announcements a
        """;
  }

  private Map<String, Object> mapAnnouncement(ResultSet rs, int rowNumber) throws SQLException {
    Map<String, Object> value = new LinkedHashMap<>();
    Timestamp readAt = rs.getTimestamp("read_at");
    value.put("id", rs.getLong("id"));
    value.put("title", rs.getString("title"));
    value.put("contentMarkdown", rs.getString("content_markdown"));
    value.put("imageUrl", rs.getString("image_url"));
    value.put("illustrationRef", rs.getString("illustration_ref"));
    value.put("audience", rs.getString("audience"));
    value.put("displayDate", rs.getDate("display_date").toLocalDate().toString());
    value.put("status", rs.getString("status"));
    value.put("createdBy", rs.getLong("created_by"));
    value.put("publishedAt", instantString(rs, "published_at"));
    value.put("createdAt", instantString(rs, "created_at"));
    value.put("updatedAt", instantString(rs, "updated_at"));
    value.put("read", readAt != null);
    value.put("readAt", readAt == null ? null : readAt.toInstant().toString());
    return value;
  }

  private NormalizedAnnouncement normalize(
      AnnouncementRequest request,
      Map<String, Object> fallback
  ) {
    if (request == null && fallback == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Announcement body is required");
    }
    String title = text(
        request == null ? null : request.title(),
        fallback == null ? null : String.valueOf(fallback.get("title")),
        1,
        160,
        "Title"
    );
    String content = text(
        request == null ? null : request.contentMarkdown(),
        fallback == null ? null : String.valueOf(fallback.get("contentMarkdown")),
        1,
        65535,
        "Markdown content"
    );
    String imageUrl = optionalText(
        request == null ? null : request.imageUrl(),
        fallback == null ? null : (String) fallback.get("imageUrl"),
        1000,
        "Image URL"
    );
    String illustrationRef = optionalText(
        request == null ? null : request.illustrationRef(),
        fallback == null ? null : (String) fallback.get("illustrationRef"),
        255,
        "Illustration reference"
    );
    String audience = normalizeAudience(
        request == null ? null : request.audience(),
        fallback == null ? "ALL" : String.valueOf(fallback.get("audience"))
    );
    LocalDate displayDate = request != null && request.displayDate() != null
        ? request.displayDate()
        : fallback == null
            ? LocalDate.now(clock.withZone(BUSINESS_ZONE))
            : LocalDate.parse(String.valueOf(fallback.get("displayDate")));
    String status = normalizeStatus(
        request == null ? null : request.status(),
        fallback == null ? "DRAFT" : String.valueOf(fallback.get("status"))
    );
    return new NormalizedAnnouncement(
        title, content, imageUrl, illustrationRef, audience, displayDate, status
    );
  }

  private String normalizeAudience(String value, String fallback) {
    String normalized = code(value, fallback);
    if (!AUDIENCES.contains(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Audience must be CUSTOMER, EMPLOYEE, or ALL");
    }
    return normalized;
  }

  private String normalizeStatus(String value, String fallback) {
    String normalized = code(value, fallback);
    if (!STATUSES.contains(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Status must be DRAFT, PUBLISHED, or DISABLED");
    }
    return normalized;
  }

  private String code(String value, String fallback) {
    String source = value == null || value.isBlank() ? fallback : value;
    return source == null ? null : source.trim().toUpperCase(Locale.ROOT);
  }

  private String text(String value, String fallback, int min, int max, String label) {
    String source = value == null ? fallback : value;
    String normalized = source == null ? "" : source.trim();
    if (normalized.length() < min || normalized.length() > max) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          label + " must contain " + min + "-" + max + " characters"
      );
    }
    return normalized;
  }

  private String optionalText(String value, String fallback, int max, String label) {
    String source = value == null ? fallback : value;
    if (source == null || source.isBlank()) return null;
    String normalized = source.trim();
    if (normalized.length() > max) {
      throw new ApiException(HttpStatus.BAD_REQUEST, label + " must not exceed " + max + " characters");
    }
    return normalized;
  }

  private Timestamp timestamp(Object value) {
    if (value == null) return null;
    return Timestamp.from(Instant.parse(String.valueOf(value)));
  }

  private String instantString(ResultSet rs, String column) throws SQLException {
    Timestamp timestamp = rs.getTimestamp(column);
    return timestamp == null ? null : timestamp.toInstant().toString();
  }

  private Map<String, Object> pageResult(
      List<Map<String, Object>> items,
      int page,
      int pageSize,
      long total
  ) {
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", items);
    response.put("page", page);
    response.put("pageSize", pageSize);
    response.put("total", total);
    return response;
  }

  private void requireAdmin(AuthenticatedUser actor) {
    if (actor == null || !actor.isAdmin()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Administrator permission is required");
    }
  }

  private void audit(
      AuthenticatedUser actor,
      String action,
      long announcementId,
      String title,
      String ipAddress
  ) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (
          admin_user_id, action, target_type, target_id, detail, ip_address
        ) VALUES (?, ?, 'ANNOUNCEMENT', ?, ?, ?)
        """,
        actor.id(),
        action,
        announcementId,
        ClientInfo.trim(title, 512),
        ClientInfo.trim(ipAddress, 64)
    );
  }

  private record NormalizedAnnouncement(
      String title,
      String contentMarkdown,
      String imageUrl,
      String illustrationRef,
      String audience,
      LocalDate displayDate,
      String status
  ) {}
}
