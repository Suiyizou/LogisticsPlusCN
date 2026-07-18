package com.cargoplanner.backend.workspacefile;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class WorkspaceFileService {
  private static final int MAX_PAGE_SIZE = 200;
  private static final int CLEANUP_BATCH_SIZE = 500;
  private static final Set<String> SAFE_SOURCES = Set.of(
      "USER_UPLOAD", "QUICK_IMPORT", "AGENT_IMPORT", "WORKSPACE_REUSE"
  );

  private final JdbcTemplate jdbcTemplate;
  private final WorkspaceFileProperties properties;
  private final Clock clock;
  private final Path storageRoot;

  @Autowired
  public WorkspaceFileService(JdbcTemplate jdbcTemplate, WorkspaceFileProperties properties) {
    this(jdbcTemplate, properties, Clock.systemUTC());
  }

  WorkspaceFileService(JdbcTemplate jdbcTemplate, WorkspaceFileProperties properties, Clock clock) {
    this.jdbcTemplate = jdbcTemplate;
    this.properties = properties;
    this.clock = clock;
    this.storageRoot = Path.of(properties.getRoot()).toAbsolutePath().normalize();
    try {
      Files.createDirectories(storageRoot);
    } catch (IOException error) {
      throw new IllegalStateException("Cannot initialize workspace file storage", error);
    }
  }

  public synchronized SavedWorkspaceFile store(MultipartFile file, AuthenticatedUser owner, String source) {
    if (file == null || file.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Upload file is required");
    }
    Objects.requireNonNull(owner, "owner");

    String originalName = safeOriginalFileName(file.getOriginalFilename());
    String normalizedName = normalizeFileName(originalName);
    String extension = extensionOf(originalName);
    validateExtension(extension);
    String safeSource = normalizeSource(source);
    String ownerFolder = ownerFolder(owner);
    Path ownerDirectory = secureResolve(ownerFolder);
    Path temporaryFile = null;

    try {
      Files.createDirectories(ownerDirectory);
      temporaryFile = Files.createTempFile(ownerDirectory, ".upload-", ".part");
      FileDigest digest = copyAndDigest(file, temporaryFile);
      Instant now = clock.instant();
      Instant expiresAt = now.plus(retention());

      WorkspaceFileRecord duplicate = findActiveDuplicate(owner.id(), normalizedName, digest.sha256(), now);
      if (duplicate != null) {
        Files.deleteIfExists(temporaryFile);
        jdbcTemplate.update(
            "UPDATE cp_workspace_files SET expires_at = ?, last_accessed_at = ?, updated_at = ? WHERE id = ?",
            timestamp(expiresAt), timestamp(now), timestamp(now), duplicate.id()
        );
        WorkspaceFileRecord refreshed = requireOwnedRecord(duplicate.id(), owner.id(), true);
        return new SavedWorkspaceFile(refreshed, secureResolve(refreshed.relativePath()), true);
      }

      int version = nextVersion(owner.id(), normalizedName);
      String storedFileName = UUID.randomUUID().toString().replace("-", "")
          + (extension.isBlank() ? "" : "." + extension);
      String relativePath = ownerFolder + "/" + storedFileName;
      Path finalPath = secureResolve(relativePath);
      moveAtomically(temporaryFile, finalPath);
      temporaryFile = null;

      long id;
      try {
        id = insertRecord(
            owner,
            ownerFolder,
            originalName,
            normalizedName,
            version,
            relativePath,
            contentType(extension, file.getContentType()),
            extension,
            digest.sizeBytes(),
            digest.sha256(),
            safeSource,
            expiresAt,
            now
        );
      } catch (RuntimeException error) {
        Files.deleteIfExists(finalPath);
        throw error;
      }
      return new SavedWorkspaceFile(requireOwnedRecord(id, owner.id(), true), finalPath, false);
    } catch (ApiException error) {
      deleteQuietly(temporaryFile);
      throw error;
    } catch (IOException error) {
      deleteQuietly(temporaryFile);
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to store upload file");
    }
  }

  public Map<String, Object> listOwned(
      AuthenticatedUser owner,
      LocalDate date,
      int page,
      int requestedSize,
      boolean includeExpired
  ) {
    return list(owner.id(), date, page, requestedSize, includeExpired, false);
  }

  public Map<String, Object> listAll(
      Long userId,
      LocalDate date,
      int page,
      int requestedSize,
      boolean includeExpired
  ) {
    return list(userId, date, page, requestedSize, includeExpired, true);
  }

  public Map<String, Object> ownedMetadata(long id, AuthenticatedUser owner) {
    WorkspaceFileRecord record = requireOwnedRecord(id, owner.id(), false);
    return metadata(record, false);
  }

  public Map<String, Object> reuse(long id, AuthenticatedUser owner) {
    WorkspaceFileRecord record = requireOwnedRecord(id, owner.id(), false);
    Instant now = clock.instant();
    Instant expiresAt = now.plus(retention());
    jdbcTemplate.update(
        """
        UPDATE cp_workspace_files
        SET expires_at = ?, last_accessed_at = ?, reuse_count = reuse_count + 1, updated_at = ?
        WHERE id = ? AND user_id = ?
        """,
        timestamp(expiresAt), timestamp(now), timestamp(now), record.id(), owner.id()
    );
    return metadata(requireOwnedRecord(id, owner.id(), true), false);
  }

  public WorkspaceFileContent ownedContent(long id, AuthenticatedUser owner) {
    return content(requireOwnedRecord(id, owner.id(), false));
  }

  public WorkspaceFileContent adminContent(long id) {
    return content(requireRecord(id, false));
  }

  public Map<String, Object> adminMetadata(long id) {
    return metadata(requireRecord(id, false), false, true);
  }

  public Path requireOwnedPath(long id, AuthenticatedUser owner) {
    return ownedContent(id, owner).path();
  }

  public void deleteOwned(long id, AuthenticatedUser owner) {
    deleteRecord(requireOwnedRecord(id, owner.id(), true));
  }

  public void deleteAsAdmin(long id) {
    deleteRecord(requireRecord(id, true));
  }

  @Scheduled(
      initialDelayString = "${app.workspace-files.cleanup-initial-delay-ms:60000}",
      fixedDelayString = "${app.workspace-files.cleanup-interval-ms:3600000}"
  )
  public void scheduledCleanup() {
    cleanupExpiredFiles();
  }

  public int cleanupExpiredFiles() {
    Instant now = clock.instant();
    int deleted = 0;
    while (true) {
      List<WorkspaceFileRecord> expired = findExpiredRecords(now);
      if (expired.isEmpty()) break;
      int deletedInBatch = 0;
      for (WorkspaceFileRecord record : expired) {
        try {
          deleteRecord(record);
          deleted++;
          deletedInBatch++;
        } catch (RuntimeException ignored) {
          // Retry the individual file during the next cleanup pass.
        }
      }
      if (expired.size() < CLEANUP_BATCH_SIZE || deletedInBatch == 0) break;
    }
    return deleted;
  }

  private List<WorkspaceFileRecord> findExpiredRecords(Instant now) {
    return jdbcTemplate.query(
        """
        SELECT f.*, u.display_name AS current_display_name
        FROM cp_workspace_files f
        JOIN cp_users u ON u.id = f.user_id
        WHERE f.expires_at <= ?
        ORDER BY f.expires_at ASC, f.id ASC
        LIMIT ?
        """,
        this::mapRecord,
        timestamp(now), CLEANUP_BATCH_SIZE
    );
  }

  public Map<String, Object> metadata(SavedWorkspaceFile saved) {
    return metadata(saved.record(), saved.deduplicated());
  }

  private synchronized int nextVersion(long userId, String normalizedName) {
    Integer current = jdbcTemplate.queryForObject(
        "SELECT COALESCE(MAX(version_no), 0) FROM cp_workspace_files WHERE user_id = ? AND normalized_file_name = ?",
        Integer.class,
        userId,
        normalizedName
    );
    return (current == null ? 0 : current) + 1;
  }

  private long insertRecord(
      AuthenticatedUser owner,
      String ownerFolder,
      String originalName,
      String normalizedName,
      int version,
      String relativePath,
      String contentType,
      String extension,
      long sizeBytes,
      String sha256,
      String source,
      Instant expiresAt,
      Instant now
  ) {
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbcTemplate.update((connection) -> {
      PreparedStatement statement = connection.prepareStatement(
          """
          INSERT INTO cp_workspace_files (
            user_id, owner_display_name, owner_folder, original_file_name, normalized_file_name,
            version_no, stored_relative_path, content_type, extension, size_bytes, sha256,
            source_channel, expires_at, last_accessed_at, reuse_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
          """,
          Statement.RETURN_GENERATED_KEYS
      );
      statement.setLong(1, owner.id());
      statement.setString(2, trim(owner.displayName(), 80));
      statement.setString(3, ownerFolder);
      statement.setString(4, originalName);
      statement.setString(5, normalizedName);
      statement.setInt(6, version);
      statement.setString(7, relativePath);
      statement.setString(8, contentType);
      statement.setString(9, extension);
      statement.setLong(10, sizeBytes);
      statement.setString(11, sha256);
      statement.setString(12, source);
      statement.setTimestamp(13, timestamp(expiresAt));
      statement.setTimestamp(14, timestamp(now));
      statement.setTimestamp(15, timestamp(now));
      statement.setTimestamp(16, timestamp(now));
      return statement;
    }, keyHolder);
    Number key = keyHolder.getKey();
    if (key == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create workspace file record");
    }
    return key.longValue();
  }

  private Map<String, Object> list(
      Long userId,
      LocalDate date,
      int requestedPage,
      int requestedSize,
      boolean includeExpired,
      boolean admin
  ) {
    int page = Math.max(0, requestedPage);
    int size = Math.max(1, Math.min(MAX_PAGE_SIZE, requestedSize <= 0 ? 100 : requestedSize));
    List<Object> params = new ArrayList<>();
    StringBuilder where = new StringBuilder(" WHERE 1 = 1");
    if (userId != null) {
      where.append(" AND f.user_id = ?");
      params.add(userId);
    }
    if (!includeExpired) {
      where.append(" AND f.expires_at > ?");
      params.add(timestamp(clock.instant()));
    }
    if (date != null) {
      ZoneId zone = ZoneId.systemDefault();
      where.append(" AND f.created_at >= ? AND f.created_at < ?");
      params.add(timestamp(date.atStartOfDay(zone).toInstant()));
      params.add(timestamp(date.plusDays(1).atStartOfDay(zone).toInstant()));
    }

    Long totalValue = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_workspace_files f" + where,
        Long.class,
        params.toArray()
    );
    long total = totalValue == null ? 0 : totalValue;
    List<Object> itemParams = new ArrayList<>(params);
    itemParams.add(size);
    itemParams.add(page * size);
    List<WorkspaceFileRecord> records = jdbcTemplate.query(
        """
        SELECT f.*, u.display_name AS current_display_name
        FROM cp_workspace_files f
        JOIN cp_users u ON u.id = f.user_id
        """ + where + " ORDER BY f.created_at DESC, f.id DESC LIMIT ? OFFSET ?",
        this::mapRecord,
        itemParams.toArray()
    );
    List<Map<String, Object>> items = records.stream()
        .map((record) -> metadata(record, false, admin))
        .toList();
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("items", items);
    result.put("total", total);
    result.put("page", page);
    result.put("size", size);
    if (admin) result.put("scope", "all");
    return result;
  }

  private WorkspaceFileContent content(WorkspaceFileRecord record) {
    Path path = secureResolve(record.relativePath());
    if (!Files.isRegularFile(path)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Workspace file content not found");
    }
    Instant now = clock.instant();
    jdbcTemplate.update(
        "UPDATE cp_workspace_files SET last_accessed_at = ?, updated_at = ? WHERE id = ?",
        timestamp(now), timestamp(now), record.id()
    );
    return new WorkspaceFileContent(path, record.originalFileName(), record.contentType(), record.sizeBytes());
  }

  private WorkspaceFileRecord findActiveDuplicate(long userId, String normalizedName, String sha256, Instant now) {
    List<WorkspaceFileRecord> records = jdbcTemplate.query(
        """
        SELECT f.*, u.display_name AS current_display_name
        FROM cp_workspace_files f
        JOIN cp_users u ON u.id = f.user_id
        WHERE f.user_id = ? AND f.normalized_file_name = ? AND f.sha256 = ? AND f.expires_at > ?
        ORDER BY f.version_no DESC, f.id DESC
        LIMIT 1
        """,
        this::mapRecord,
        userId, normalizedName, sha256, timestamp(now)
    );
    return records.isEmpty() ? null : records.get(0);
  }

  private WorkspaceFileRecord requireOwnedRecord(long id, long userId, boolean allowExpired) {
    List<WorkspaceFileRecord> records = jdbcTemplate.query(
        """
        SELECT f.*, u.display_name AS current_display_name
        FROM cp_workspace_files f
        JOIN cp_users u ON u.id = f.user_id
        WHERE f.id = ? AND f.user_id = ?
        """,
        this::mapRecord,
        id, userId
    );
    if (records.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Workspace file not found");
    }
    return validateExpiry(records.get(0), allowExpired);
  }

  private WorkspaceFileRecord requireRecord(long id, boolean allowExpired) {
    List<WorkspaceFileRecord> records = jdbcTemplate.query(
        """
        SELECT f.*, u.display_name AS current_display_name
        FROM cp_workspace_files f
        JOIN cp_users u ON u.id = f.user_id
        WHERE f.id = ?
        """,
        this::mapRecord,
        id
    );
    if (records.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Workspace file not found");
    }
    return validateExpiry(records.get(0), allowExpired);
  }

  private WorkspaceFileRecord validateExpiry(WorkspaceFileRecord record, boolean allowExpired) {
    if (!allowExpired && !record.expiresAt().isAfter(clock.instant())) {
      throw new ApiException(HttpStatus.GONE, "Workspace file has expired");
    }
    return record;
  }

  private void deleteRecord(WorkspaceFileRecord record) {
    Path path = secureResolve(record.relativePath());
    try {
      Files.deleteIfExists(path);
    } catch (IOException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to delete workspace file");
    }
    jdbcTemplate.update("DELETE FROM cp_workspace_files WHERE id = ?", record.id());
  }

  private FileDigest copyAndDigest(MultipartFile file, Path destination) throws IOException {
    MessageDigest digest;
    try {
      digest = MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException("SHA-256 is not available", impossible);
    }
    long size = 0;
    byte[] buffer = new byte[64 * 1024];
    try (InputStream input = new DigestInputStream(file.getInputStream(), digest);
         OutputStream output = Files.newOutputStream(destination)) {
      int read;
      while ((read = input.read(buffer)) >= 0) {
        if (read == 0) continue;
        size += read;
        if (size > properties.getMaxFileSizeBytes()) {
          throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Upload file exceeds workspace file size limit");
        }
        output.write(buffer, 0, read);
      }
    }
    return new FileDigest(size, HexFormat.of().formatHex(digest.digest()));
  }

  private void moveAtomically(Path source, Path destination) throws IOException {
    try {
      Files.move(source, destination, StandardCopyOption.ATOMIC_MOVE);
    } catch (AtomicMoveNotSupportedException ignored) {
      Files.move(source, destination);
    }
  }

  private WorkspaceFileRecord mapRecord(ResultSet rs, int rowNumber) throws SQLException {
    return new WorkspaceFileRecord(
        rs.getLong("id"),
        rs.getLong("user_id"),
        rs.getString("current_display_name"),
        rs.getString("owner_display_name"),
        rs.getString("owner_folder"),
        rs.getString("original_file_name"),
        rs.getString("normalized_file_name"),
        rs.getInt("version_no"),
        rs.getString("stored_relative_path"),
        rs.getString("content_type"),
        rs.getString("extension"),
        rs.getLong("size_bytes"),
        rs.getString("sha256"),
        rs.getString("source_channel"),
        instant(rs, "expires_at"),
        instant(rs, "last_accessed_at"),
        rs.getInt("reuse_count"),
        instant(rs, "created_at"),
        instant(rs, "updated_at")
    );
  }

  private Map<String, Object> metadata(WorkspaceFileRecord record, boolean deduplicated) {
    return metadata(record, deduplicated, false);
  }

  private Map<String, Object> metadata(
      WorkspaceFileRecord record,
      boolean deduplicated,
      boolean admin
  ) {
    Instant now = clock.instant();
    boolean expired = !record.expiresAt().isAfter(now);
    long secondsRemaining = Math.max(0, ChronoUnit.SECONDS.between(now, record.expiresAt()));
    long daysRemaining = expired ? 0 : Math.max(1, (secondsRemaining + 86_399) / 86_400);
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("id", record.id());
    value.put("userId", record.userId());
    value.put("ownerDisplayName", firstNonBlank(record.currentDisplayName(), record.ownerDisplayName()));
    value.put("ownerFolder", record.ownerFolder());
    value.put("originalFileName", record.originalFileName());
    value.put("version", record.version());
    value.put("contentType", record.contentType());
    value.put("extension", record.extension());
    value.put("sizeBytes", record.sizeBytes());
    value.put("sha256", record.sha256());
    value.put("source", record.source());
    value.put("uploadedAt", record.createdAt().toString());
    value.put("uploadedDate", record.createdAt().atZone(ZoneId.systemDefault()).toLocalDate().toString());
    value.put("expiresAt", record.expiresAt().toString());
    value.put("daysRemaining", daysRemaining);
    value.put("lastAccessedAt", record.lastAccessedAt() == null ? null : record.lastAccessedAt().toString());
    value.put("reuseCount", record.reuseCount());
    value.put("expired", expired);
    value.put("deduplicated", deduplicated);
    String baseUrl = admin ? "/api/admin/workspace-files/" : "/api/workspace-files/";
    value.put("downloadUrl", baseUrl + record.id() + "/download");
    value.put("previewUrl", baseUrl + record.id() + "/preview");
    return value;
  }

  private Path secureResolve(String relativePath) {
    if (relativePath == null || relativePath.isBlank()) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Stored file path is invalid");
    }
    Path resolved = storageRoot.resolve(relativePath.replace('/', java.io.File.separatorChar)).normalize();
    if (!resolved.startsWith(storageRoot)) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Stored file path is invalid");
    }
    return resolved;
  }

  private String ownerFolder(AuthenticatedUser owner) {
    String displayName = Normalizer.normalize(firstNonBlank(owner.displayName(), owner.username()), Normalizer.Form.NFKC);
    String slug = displayName.replaceAll("[^\\p{L}\\p{N}._-]+", "_")
        .replaceAll("^[._-]+|[._-]+$", "");
    if (slug.isBlank()) slug = "user";
    if (slug.length() > 48) slug = slug.substring(0, 48);
    return slug + "-u" + owner.id();
  }

  private String safeOriginalFileName(String value) {
    String name = firstNonBlank(value, "uploaded-file")
        .replace('\0', '_')
        .replace('\\', '/');
    int slash = name.lastIndexOf('/');
    if (slash >= 0) name = name.substring(slash + 1);
    name = name.replaceAll("[\\p{Cntrl}]", "_").trim();
    if (name.isBlank() || ".".equals(name) || "..".equals(name)) name = "uploaded-file";
    if (name.length() > 255) {
      String extension = extensionOf(name);
      String suffix = extension.isBlank() ? "" : "." + extension;
      name = name.substring(0, Math.max(1, 255 - suffix.length())) + suffix;
    }
    return name;
  }

  private String normalizeFileName(String value) {
    return Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
  }

  private String extensionOf(String fileName) {
    int dot = fileName.lastIndexOf('.');
    if (dot <= 0 || dot == fileName.length() - 1) return "";
    String extension = fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
    return extension.matches("[a-z0-9]{1,10}") ? extension : "";
  }

  private void validateExtension(String extension) {
    Set<String> allowed = properties.getAllowedExtensions();
    boolean supported = extension != null && allowed != null && allowed.stream()
        .map((item) -> item == null ? "" : item.toLowerCase(Locale.ROOT).replace(".", ""))
        .anyMatch(extension::equals);
    if (!supported) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only Excel, CSV, or TSV workspace files are supported");
    }
  }

  private String normalizeSource(String source) {
    String normalized = firstNonBlank(source, "USER_UPLOAD")
        .trim()
        .toUpperCase(Locale.ROOT)
        .replace('-', '_');
    return SAFE_SOURCES.contains(normalized) ? normalized : "USER_UPLOAD";
  }

  private String contentType(String extension, String supplied) {
    return switch (extension) {
      case "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      case "xls" -> "application/vnd.ms-excel";
      case "csv" -> "text/csv";
      case "tsv" -> "text/tab-separated-values";
      default -> firstNonBlank(supplied, "application/octet-stream");
    };
  }

  private Duration retention() {
    Duration configured = properties.getRetention();
    return configured == null || configured.isNegative() || configured.isZero()
        ? Duration.ofDays(14)
        : configured;
  }

  private Instant instant(ResultSet rs, String column) throws SQLException {
    Timestamp value = rs.getTimestamp(column);
    return value == null ? null : value.toInstant();
  }

  private Timestamp timestamp(Instant value) {
    return Timestamp.from(value);
  }

  private String firstNonBlank(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) return value;
    }
    return "";
  }

  private String trim(String value, int maxLength) {
    if (value == null) return "";
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }

  private void deleteQuietly(Path path) {
    if (path == null) return;
    try {
      Files.deleteIfExists(path);
    } catch (IOException ignored) {
      // Cleanup will retry stale temporary files when the storage is maintained.
    }
  }

  public record SavedWorkspaceFile(WorkspaceFileRecord record, Path path, boolean deduplicated) {}

  public record WorkspaceFileContent(Path path, String originalFileName, String contentType, long sizeBytes) {}

  public record WorkspaceFileRecord(
      long id,
      long userId,
      String currentDisplayName,
      String ownerDisplayName,
      String ownerFolder,
      String originalFileName,
      String normalizedFileName,
      int version,
      String relativePath,
      String contentType,
      String extension,
      long sizeBytes,
      String sha256,
      String source,
      Instant expiresAt,
      Instant lastAccessedAt,
      int reuseCount,
      Instant createdAt,
      Instant updatedAt
  ) {}

  private record FileDigest(long sizeBytes, String sha256) {}
}
