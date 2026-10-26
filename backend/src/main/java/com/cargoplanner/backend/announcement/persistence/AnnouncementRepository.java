package com.cargoplanner.backend.announcement.persistence;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;

/** Closed operations, explicit audience boundaries; no caller-supplied Wrapper or column names. */
@Repository
public class AnnouncementRepository {
  private final AnnouncementMapper announcements;
  private final AnnouncementReadMapper reads;
  private final AnnouncementAuditMapper audits;

  public AnnouncementRepository(
      AnnouncementMapper announcements, AnnouncementReadMapper reads, AnnouncementAuditMapper audits) {
    this.announcements = announcements;
    this.reads = reads;
    this.audits = audits;
  }

  public record View(AnnouncementEntity value, Instant readAt) {}
  public record AdminPage(List<View> items, long total) {}

  public AdminPage listAdmin(AuthenticatedUser actor, int page, int size, String status) {
    requireAdmin(actor);
    var query = new QueryWrapper<AnnouncementEntity>();
    query.eq(status != null, "status", status)
        .orderByDesc("display_date", "updated_at", "id");
    var result = announcements.selectPage(new Page<>((long) page + 1, size), query);
    return new AdminPage(result.getRecords().stream().map(row -> new View(row, null)).toList(),
        result.getTotal());
  }

  public AnnouncementEntity requireAdminRecord(long id, AuthenticatedUser actor) {
    requireAdmin(actor);
    var row = announcements.selectById(id);
    if (row == null) throw new ApiException(HttpStatus.NOT_FOUND, "Announcement not found");
    return row;
  }

  public long create(AnnouncementEntity row, AuthenticatedUser actor) {
    requireAdmin(actor);
    row.id = null;
    row.createdBy = actor.id();
    announcements.insert(row);
    if (row.id == null) throw new IllegalStateException("Announcement id was not generated");
    return row.id;
  }

  /** All mutable fields are intentional values, including nulls that clear optional fields. */
  public void update(AnnouncementEntity row, AuthenticatedUser actor) {
    requireAdmin(actor);
    var update = new UpdateWrapper<AnnouncementEntity>().eq("id", row.id)
        .set("title", row.title).set("content_markdown", row.contentMarkdown)
        .set("image_url", row.imageUrl).set("illustration_ref", row.illustrationRef)
        .set("audience", row.audience).set("display_date", row.displayDate)
        .set("status", row.status).set("published_at", row.publishedAt)
        .set("updated_at", row.updatedAt);
    announcements.update(null, update);
  }

  public void setStatus(long id, String status, Instant now, AuthenticatedUser actor) {
    requireAdmin(actor);
    var update = new UpdateWrapper<AnnouncementEntity>().eq("id", id)
        .set("status", status).set("updated_at", now);
    if ("PUBLISHED".equals(status)) update.set("published_at", now);
    announcements.update(null, update);
  }

  public void delete(long id, AuthenticatedUser actor) {
    requireAdmin(actor);
    announcements.deleteById(id);
  }

  public List<View> visibleForEmployee(AuthenticatedUser actor, Long id, LocalDate date) {
    if (actor == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Login is required");
    return visible("EMPLOYEE", actor.id(), id, date);
  }

  public List<View> visibleForCustomer(CustomerPrincipal actor, Long id, LocalDate date) {
    if (actor == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Customer login is required");
    return visible("CUSTOMER", actor.id(), id, date);
  }

  private List<View> visible(String readerType, long readerId, Long id, LocalDate date) {
    var query = new QueryWrapper<AnnouncementEntity>().eq("status", "PUBLISHED")
        .eq("display_date", date).in("audience", readerType, "ALL")
        .eq(id != null, "id", id).orderByDesc("published_at", "id");
    var rows = announcements.selectList(query);
    if (rows.isEmpty()) return List.of();
    var readRows = reads.findForReader(readerType, readerId,
        rows.stream().map(row -> row.id).toList());
    Map<Long, AnnouncementReadEntity> byId = readRows.stream()
        .collect(Collectors.toMap(row -> row.announcementId, Function.identity()));
    return rows.stream().map(row -> new View(row,
        byId.containsKey(row.id) ? byId.get(row.id).readAt : null)).toList();
  }

  public void markReadEmployee(long id, AuthenticatedUser actor, LocalDate date, Instant at) {
    if (visibleForEmployee(actor, id, date).isEmpty()) throw invisible();
    markRead(id, "EMPLOYEE", actor.id(), at);
  }

  public void markReadCustomer(long id, CustomerPrincipal actor, LocalDate date, Instant at) {
    if (visibleForCustomer(actor, id, date).isEmpty()) throw invisible();
    markRead(id, "CUSTOMER", actor.id(), at);
  }

  private ApiException invisible() {
    return new ApiException(HttpStatus.NOT_FOUND, "Today's visible announcement was not found");
  }

  private void markRead(long id, String type, long readerId, Instant at) {
    if (reads.updateReceipt(id, type, readerId, at) != 0) return;
    try {
      reads.insertReceipt(id, type, readerId, at);
    } catch (DuplicateKeyException race) {
      // Compound key is authoritative; concurrent requests still produce one receipt.
      reads.updateReceipt(id, type, readerId, at);
    }
  }

  public void audit(AuthenticatedUser actor, String action, long id, String title, String ip) {
    requireAdmin(actor);
    var row = new AnnouncementAuditEntity();
    row.adminUserId = actor.id();
    row.action = action;
    row.targetType = "ANNOUNCEMENT";
    row.targetId = id;
    row.detail = ClientInfo.trim(title, 512);
    row.ipAddress = ClientInfo.trim(ip, 64);
    audits.insert(row);
  }

  private void requireAdmin(AuthenticatedUser actor) {
    if (actor == null || !actor.isAdmin()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Administrator permission is required");
    }
  }
}
