package com.cargoplanner.backend.announcement;

import com.cargoplanner.backend.announcement.persistence.AnnouncementEntity;
import com.cargoplanner.backend.announcement.persistence.AnnouncementRepository;
import com.cargoplanner.backend.announcement.persistence.AnnouncementRepository.View;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Application use cases. Requests use null/omission to retain, blank optional text to clear. */
@Service
public class AnnouncementService {
  static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");
  private static final List<String> AUDIENCES = List.of("CUSTOMER", "EMPLOYEE", "ALL");
  private static final List<String> STATUSES = List.of("DRAFT", "PUBLISHED", "DISABLED");
  private final AnnouncementRepository repository;
  private final Clock clock;

  @Autowired
  public AnnouncementService(AnnouncementRepository repository) {
    this(repository, Clock.system(BUSINESS_ZONE));
  }

  AnnouncementService(AnnouncementRepository repository, Clock clock) {
    this.repository = repository;
    this.clock = clock;
  }

  public Map<String, Object> listAdmin(
      AuthenticatedUser actor, int requestedPage, int requestedSize, String requestedStatus) {
    requireAdmin(actor);
    int page = Math.max(0, requestedPage);
    int size = Math.max(1, Math.min(100, requestedSize));
    String status = requestedStatus == null || requestedStatus.isBlank()
        ? null : normalizeStatus(requestedStatus, null);
    var result = repository.listAdmin(actor, page, size, status);
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", result.items().stream().map(this::response).toList());
    response.put("page", page);
    response.put("pageSize", size);
    response.put("total", result.total());
    return response;
  }

  public Map<String, Object> getAdmin(long id, AuthenticatedUser actor) {
    return response(new View(repository.requireAdminRecord(id, actor), null));
  }

  @Transactional
  public Map<String, Object> create(AnnouncementRequest request, AuthenticatedUser actor, String ip) {
    requireAdmin(actor);
    var value = normalize(request, null);
    Instant now = clock.instant();
    var row = row(value);
    row.createdAt = now;
    row.updatedAt = now;
    row.publishedAt = "PUBLISHED".equals(value.status()) ? now : null;
    long id = repository.create(row, actor);
    repository.audit(actor, "CREATE_ANNOUNCEMENT", id, value.title(), ip);
    return getAdmin(id, actor);
  }

  @Transactional
  public Map<String, Object> update(
      long id, AnnouncementRequest request, AuthenticatedUser actor, String ip) {
    var existing = repository.requireAdminRecord(id, actor);
    var value = normalize(request, response(new View(existing, null)));
    var row = row(value);
    row.id = id;
    row.updatedAt = clock.instant();
    row.publishedAt = "PUBLISHED".equals(value.status()) && existing.publishedAt == null
        ? row.updatedAt : existing.publishedAt;
    repository.update(row, actor);
    repository.audit(actor, "UPDATE_ANNOUNCEMENT", id, value.title(), ip);
    return getAdmin(id, actor);
  }

  @Transactional
  public Map<String, Object> publish(long id, AuthenticatedUser actor, String ip) {
    return changeStatus(id, actor, ip, "PUBLISHED", "PUBLISH_ANNOUNCEMENT");
  }

  @Transactional
  public Map<String, Object> disable(long id, AuthenticatedUser actor, String ip) {
    return changeStatus(id, actor, ip, "DISABLED", "DISABLE_ANNOUNCEMENT");
  }

  private Map<String, Object> changeStatus(
      long id, AuthenticatedUser actor, String ip, String status, String action) {
    var existing = repository.requireAdminRecord(id, actor);
    repository.setStatus(id, status, clock.instant(), actor);
    repository.audit(actor, action, id, existing.title, ip);
    return getAdmin(id, actor);
  }

  @Transactional
  public Map<String, Object> delete(long id, AuthenticatedUser actor, String ip) {
    var existing = repository.requireAdminRecord(id, actor);
    repository.delete(id, actor);
    repository.audit(actor, "DELETE_ANNOUNCEMENT", id, existing.title, ip);
    return Map.of("id", id, "deleted", true);
  }

  public Map<String, Object> todayForEmployee(AuthenticatedUser actor) {
    return today("EMPLOYEE", repository.visibleForEmployee(actor, null, today()));
  }

  public Map<String, Object> todayForCustomer(CustomerPrincipal actor) {
    return today("CUSTOMER", repository.visibleForCustomer(actor, null, today()));
  }

  @Transactional
  public Map<String, Object> markReadForEmployee(long id, AuthenticatedUser actor) {
    repository.markReadEmployee(id, actor, today(), clock.instant());
    var result = response(repository.visibleForEmployee(actor, id, today()).get(0));
    result.put("markedRead", true);
    return result;
  }

  @Transactional
  public Map<String, Object> markReadForCustomer(long id, CustomerPrincipal actor) {
    repository.markReadCustomer(id, actor, today(), clock.instant());
    var result = response(repository.visibleForCustomer(actor, id, today()).get(0));
    result.put("markedRead", true);
    return result;
  }

  private LocalDate today() {
    return LocalDate.now(clock.withZone(BUSINESS_ZONE));
  }

  private Map<String, Object> today(String audience, List<View> rows) {
    var items = rows.stream().map(this::response).toList();
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("date", today().toString());
    result.put("audience", audience);
    result.put("items", items);
    result.put("total", items.size());
    result.put("unreadCount", rows.stream().filter(item -> item.readAt() == null).count());
    return result;
  }

  private AnnouncementEntity row(NormalizedAnnouncement value) {
    var row = new AnnouncementEntity();
    row.title = value.title();
    row.contentMarkdown = value.contentMarkdown();
    row.imageUrl = value.imageUrl();
    row.illustrationRef = value.illustrationRef();
    row.audience = value.audience();
    row.displayDate = value.displayDate();
    row.status = value.status();
    return row;
  }

  private Map<String, Object> response(View view) {
    var row = view.value();
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("id", row.id);
    result.put("title", row.title);
    result.put("contentMarkdown", row.contentMarkdown);
    result.put("imageUrl", row.imageUrl);
    result.put("illustrationRef", row.illustrationRef);
    result.put("audience", row.audience);
    result.put("displayDate", row.displayDate.toString());
    result.put("status", row.status);
    result.put("createdBy", row.createdBy);
    result.put("publishedAt", instant(row.publishedAt));
    result.put("createdAt", instant(row.createdAt));
    result.put("updatedAt", instant(row.updatedAt));
    result.put("read", view.readAt() != null);
    result.put("readAt", instant(view.readAt()));
    return result;
  }

  private String instant(Instant value) {
    return value == null ? null : value.toString();
  }

  private void requireAdmin(AuthenticatedUser actor) {
    if (actor == null || !actor.isAdmin()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Administrator permission is required");
    }
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

  private record NormalizedAnnouncement(
      String title, String contentMarkdown, String imageUrl, String illustrationRef,
      String audience, LocalDate displayDate, String status) {}
}
