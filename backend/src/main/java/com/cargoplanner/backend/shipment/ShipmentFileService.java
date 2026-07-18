package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import com.cargoplanner.backend.shipment.ShipmentAccessService.ShipmentAccess;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ShipmentFileService {
  private static final int MAX_PAGE_SIZE = 200;
  private static final Set<String> VISIBILITIES = Set.of("PARTIES", "INTERNAL");
  private static final DateTimeFormatter MONTH_PATH = DateTimeFormatter
      .ofPattern("yyyy/MM")
      .withZone(ZoneOffset.UTC);

  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;
  private final ShipmentAccessService accessService;
  private final ShipmentFileProperties properties;
  private final Clock clock;
  private final Path storageRoot;

  @Autowired
  public ShipmentFileService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      ShipmentAccessService accessService,
      ShipmentFileProperties properties
  ) {
    this(jdbcTemplate, objectMapper, accessService, properties, Clock.systemUTC());
  }

  ShipmentFileService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      ShipmentAccessService accessService,
      ShipmentFileProperties properties,
      Clock clock
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.accessService = accessService;
    this.properties = properties;
    this.clock = clock;
    this.storageRoot = Path.of(properties.getRoot()).toAbsolutePath().normalize();
    try {
      Files.createDirectories(storageRoot);
      Files.createDirectories(storageRoot.resolve(".multipart"));
    } catch (IOException error) {
      throw new IllegalStateException("Cannot initialize shipment file storage", error);
    }
  }

  @Transactional
  public SavedShipmentFile store(
      MultipartFile file,
      String shipmentPublicId,
      AuthenticatedUser user,
      String category,
      String requestedVisibility,
      String ipAddress
  ) {
    return store(
        file,
        shipmentPublicId,
        user,
        category,
        requestedVisibility,
        null,
        ipAddress
    );
  }

  @Transactional
  public SavedShipmentFile store(
      MultipartFile file,
      String shipmentPublicId,
      AuthenticatedUser user,
      String category,
      String requestedVisibility,
      String targetCustomerPublicId,
      String ipAddress
  ) {
    if (user == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Sign in is required");
    ShipmentAccess access = accessService.requireAccess(shipmentPublicId, user);
    Long targetCustomerId = resolveInternalTargetCustomer(
        access.shipmentId(),
        user,
        targetCustomerPublicId
    );
    return storeForActor(
        file,
        access,
        FileActor.internal(user),
        category,
        requestedVisibility,
        targetCustomerId,
        ipAddress
    );
  }

  @Transactional
  public SavedShipmentFile storeCustomer(
      MultipartFile file,
      String shipmentPublicId,
      CustomerPrincipal customer,
      String category,
      String ipAddress
  ) {
    ShipmentAccess access = accessService.requireCustomerAccess(shipmentPublicId, customer);
    return storeForActor(
        file,
        access,
        FileActor.customer(customer),
        category,
        "PARTIES",
        customer.id(),
        ipAddress
    );
  }

  private SavedShipmentFile storeForActor(
      MultipartFile file,
      ShipmentAccess access,
      FileActor actor,
      String category,
      String requestedVisibility,
      Long targetCustomerId,
      String ipAddress
  ) {
    if (file == null || file.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Upload file is required");
    }
    String originalName = safeOriginalFileName(file.getOriginalFilename());
    String extension = extensionOf(originalName);
    validateExtension(extension);
    String requested = normalizeVisibility(requestedVisibility, "PARTIES");
    String visibility;
    if (actor.customerId() != null) {
      visibility = "PARTIES";
      targetCustomerId = actor.customerId();
    } else {
      if ("PARTIES".equals(requested)) {
        if (targetCustomerId == null) {
          throw new ApiException(
              HttpStatus.BAD_REQUEST,
              "Target customer is required when visibility is PARTIES"
          );
        }
        visibility = "PARTIES";
      } else {
        visibility = "INTERNAL";
        targetCustomerId = null;
      }
    }
    String safeCategory = normalizeCategory(category);
    Instant now = clock.instant();
    String relativeDirectory = MONTH_PATH.format(now) + "/" + access.shipmentPublicId();
    Path directory = secureResolve(relativeDirectory);
    Path temporaryFile = null;
    Path storedFile = null;

    try {
      lockGlobalStorageQuota();
      lockQuotaSubjects(access.shipmentId(), actor.customerId());
      validateStorageQuotas(access.shipmentId(), actor.customerId(), file.getSize());
      requireDiskCapacity(file.getSize());
      Files.createDirectories(directory);
      temporaryFile = Files.createTempFile(directory, ".upload-", ".part");
      FileDigest digest = copyAndDigest(file, temporaryFile);
      validateStorageQuotas(access.shipmentId(), actor.customerId(), digest.sizeBytes());
      requireDiskCapacity(0);
      String storedName = UUID.randomUUID().toString().replace("-", "")
          + (extension.isBlank() ? "" : "." + extension);
      String relativePath = relativeDirectory + "/" + storedName;
      Path finalPath = secureResolve(relativePath);
      moveAtomically(temporaryFile, finalPath);
      temporaryFile = null;
      storedFile = finalPath;
      registerRollbackCleanup(finalPath);

      String publicId = UUID.randomUUID().toString();
      insertRecord(
          publicId,
            access.shipmentId(),
            actor,
            targetCustomerId,
            safeCategory,
          originalName,
          relativePath,
          contentType(extension),
          extension,
          digest,
          visibility,
          now
      );
      ShipmentFileRecord record = requireRecord(publicId, false);
      String scope = actor.customerId() == null ? "internal" : "customer";
      audit(record, actor, "UPLOAD", null, metadata(record, actor, scope), ipAddress);
      return new SavedShipmentFile(record, finalPath);
    } catch (ApiException error) {
      deleteQuietly(temporaryFile);
      deleteQuietly(storedFile);
      throw error;
    } catch (IOException error) {
      deleteQuietly(temporaryFile);
      deleteQuietly(storedFile);
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to store shipment file");
    } catch (RuntimeException error) {
      deleteQuietly(temporaryFile);
      deleteQuietly(storedFile);
      throw error;
    }
  }

  public Map<String, Object> list(String shipmentPublicId, AuthenticatedUser user) {
    ShipmentAccess access = accessService.requireAccess(shipmentPublicId, user);
    String visibilityFilter = access.canManageFiles() ? "" : " AND f.visibility = 'PARTIES'";
    List<ShipmentFileRecord> records = jdbcTemplate.query(
        """
        SELECT f.*, s.public_id AS shipment_public_id,
               COALESCE(u.display_name, c.display_name) AS uploader_display_name,
               tc.public_id AS target_customer_public_id,
               tc.display_name AS target_customer_display_name,
               r.reference_type AS shipment_reference_type,
               r.reference_no_raw AS shipment_reference_no
        FROM cp_shipment_files f
        JOIN cp_shipments s ON s.id = f.shipment_id
        LEFT JOIN cp_users u ON u.id = f.uploader_user_id
        LEFT JOIN cp_customers c ON c.id = f.uploader_customer_id
        LEFT JOIN cp_customers tc ON tc.id = f.target_customer_id
        LEFT JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id
          FROM cp_shipment_references r2
          WHERE r2.shipment_id = f.shipment_id
          ORDER BY r2.primary_reference DESC, r2.id ASC
          LIMIT 1
        )
        WHERE f.shipment_id = ? AND f.status = 'READY'
        """ + visibilityFilter + " ORDER BY f.created_at DESC, f.id DESC",
        this::mapRecord,
        access.shipmentId()
    );
    List<Map<String, Object>> items = records.stream()
        .map(record -> metadata(record, FileActor.internal(user), "internal"))
        .toList();
    Map<String, Object> permissions = new LinkedHashMap<>();
    permissions.put("canUpload", true);
    permissions.put("canChangeVisibility", access.canManageFiles());
    permissions.put("canAssignCustomer", access.canManageFiles());
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("items", items);
    result.put("total", items.size());
    result.put("permissions", permissions);
    result.put(
        "assignableCustomers",
        access.canManageFiles()
            ? assignableCustomers(access.shipmentId(), user)
            : List.of()
    );
    return result;
  }

  public Map<String, Object> listCustomer(
      String shipmentPublicId,
      CustomerPrincipal customer
  ) {
    ShipmentAccess access = accessService.requireCustomerAccess(shipmentPublicId, customer);
    List<ShipmentFileRecord> records = jdbcTemplate.query(
        """
        SELECT f.*, s.public_id AS shipment_public_id,
               COALESCE(u.display_name, c.display_name) AS uploader_display_name,
               tc.public_id AS target_customer_public_id,
               tc.display_name AS target_customer_display_name,
               r.reference_type AS shipment_reference_type,
               r.reference_no_raw AS shipment_reference_no
        FROM cp_shipment_files f
        JOIN cp_shipments s ON s.id = f.shipment_id
        LEFT JOIN cp_users u ON u.id = f.uploader_user_id
        LEFT JOIN cp_customers c ON c.id = f.uploader_customer_id
        LEFT JOIN cp_customers tc ON tc.id = f.target_customer_id
        LEFT JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id
          FROM cp_shipment_references r2
          WHERE r2.shipment_id = f.shipment_id
          ORDER BY r2.primary_reference DESC, r2.id ASC
          LIMIT 1
        )
        WHERE f.shipment_id = ? AND f.status = 'READY' AND f.visibility = 'PARTIES'
          AND f.target_customer_id = ?
        ORDER BY f.created_at DESC, f.id DESC
        """,
        this::mapRecord,
        access.shipmentId(),
        customer.id()
    );
    FileActor actor = FileActor.customer(customer);
    List<Map<String, Object>> items = records.stream()
        .map(record -> metadata(record, actor, "customer"))
        .toList();
    return Map.of(
        "items", items,
        "total", items.size(),
        "permissions", Map.of("canUpload", true, "canChangeVisibility", false)
    );
  }

  public Map<String, Object> metadata(SavedShipmentFile saved, AuthenticatedUser user) {
    return metadata(saved.record(), FileActor.internal(user), "internal");
  }

  public Map<String, Object> metadataCustomer(
      SavedShipmentFile saved,
      CustomerPrincipal customer
  ) {
    return metadata(saved.record(), FileActor.customer(customer), "customer");
  }

  public ShipmentFileContent content(
      String filePublicId,
      AuthenticatedUser user,
      String ipAddress
  ) {
    ShipmentFileRecord record = requireRecord(filePublicId, false);
    ShipmentAccess access = accessService.requireAccess(record.shipmentPublicId(), user);
    if ("INTERNAL".equals(record.visibility()) && !access.canManageFiles()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Shipment file not found");
    }
    Path path = secureResolve(record.relativePath());
    if (!Files.isRegularFile(path)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Shipment file content not found");
    }
    FileActor actor = FileActor.internal(user);
    audit(record, actor, "DOWNLOAD", metadata(record, actor, "internal"), null, ipAddress);
    return new ShipmentFileContent(path, record.originalFileName(), record.contentType(), record.sizeBytes());
  }

  public ShipmentFileContent contentCustomer(
      String filePublicId,
      CustomerPrincipal customer,
      String ipAddress
  ) {
    ShipmentFileRecord record = requireRecord(filePublicId, false);
    accessService.requireCustomerAccess(record.shipmentPublicId(), customer);
    if (!"PARTIES".equals(record.visibility())) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Shipment file not found");
    }
    if (!Long.valueOf(customer.id()).equals(record.targetCustomerId())) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Shipment file not found");
    }
    Path path = secureResolve(record.relativePath());
    if (!Files.isRegularFile(path)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Shipment file content not found");
    }
    FileActor actor = FileActor.customer(customer);
    audit(record, actor, "DOWNLOAD", metadata(record, actor, "customer"), null, ipAddress);
    return new ShipmentFileContent(path, record.originalFileName(), record.contentType(), record.sizeBytes());
  }

  public Map<String, Object> updateVisibility(
      String filePublicId,
      String requestedVisibility,
      AuthenticatedUser user,
      String ipAddress
  ) {
    return updateVisibility(filePublicId, requestedVisibility, null, user, ipAddress);
  }

  public Map<String, Object> updateVisibility(
      String filePublicId,
      String requestedVisibility,
      String targetCustomerPublicId,
      AuthenticatedUser user,
      String ipAddress
  ) {
    ShipmentFileRecord record = requireRecord(filePublicId, false);
    ShipmentAccess access = accessService.requireAccess(record.shipmentPublicId(), user);
    if (!access.canManageFiles()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Business permission is required");
    }
    String visibility = normalizeVisibility(requestedVisibility, null);
    Long targetCustomerId = null;
    if ("PARTIES".equals(visibility)) {
      if (targetCustomerPublicId == null || targetCustomerPublicId.isBlank()) {
        throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "Target customer is required when visibility is PARTIES"
        );
      }
      targetCustomerId = resolveInternalTargetCustomer(
          record.shipmentId(),
          user,
          targetCustomerPublicId
      );
    }
    FileActor actor = FileActor.internal(user);
    Map<String, Object> before = metadata(record, actor, "internal");
    jdbcTemplate.update(
        "UPDATE cp_shipment_files SET visibility = ?, target_customer_id = ?, updated_at = ? "
            + "WHERE id = ? AND status = 'READY'",
        visibility,
        targetCustomerId,
        timestamp(clock.instant()),
        record.id()
    );
    ShipmentFileRecord updated = requireRecord(filePublicId, false);
    Map<String, Object> after = metadata(updated, actor, "internal");
    audit(updated, actor, "VISIBILITY_CHANGE", before, after, ipAddress);
    return after;
  }

  public void delete(
      String filePublicId,
      AuthenticatedUser user,
      String ipAddress
  ) {
    ShipmentFileRecord record = requireDeletableRecord(filePublicId);
    ShipmentAccess access = accessService.requireAccess(record.shipmentPublicId(), user);
    if (!access.canManageFiles() && !Long.valueOf(user.id()).equals(record.uploaderUserId())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Only the uploader may delete this file");
    }
    FileActor actor = FileActor.internal(user);
    Map<String, Object> before = metadata(record, actor, "internal");
    if ("READY".equals(record.status())) {
      Instant now = clock.instant();
      markDeleting(record.id(), now, user.id(), null);
    }
    finishPhysicalDeletion(filePublicId, actor, before, "internal", ipAddress);
  }

  public void deleteCustomer(
      String filePublicId,
      CustomerPrincipal customer,
      String ipAddress
  ) {
    ShipmentFileRecord record = requireDeletableRecord(filePublicId);
    accessService.requireCustomerAccess(record.shipmentPublicId(), customer);
    if (!"PARTIES".equals(record.visibility())) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Shipment file not found");
    }
    if (!Long.valueOf(customer.id()).equals(record.uploaderCustomerId())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Customers may only delete their own uploads");
    }
    FileActor actor = FileActor.customer(customer);
    Map<String, Object> before = metadata(record, actor, "customer");
    if ("READY".equals(record.status())) {
      Instant now = clock.instant();
      markDeleting(record.id(), now, null, customer.id());
    }
    finishPhysicalDeletion(filePublicId, actor, before, "customer", ipAddress);
  }

  public Map<String, Object> listAll(
      String shipmentPublicId,
      int requestedPage,
      int requestedSize,
      boolean includeDeleted,
      AuthenticatedUser admin
  ) {
    int page = Math.max(0, requestedPage);
    int size = Math.max(1, Math.min(MAX_PAGE_SIZE, requestedSize <= 0 ? 100 : requestedSize));
    List<Object> params = new ArrayList<>();
    StringBuilder where = new StringBuilder(" WHERE 1 = 1");
    if (shipmentPublicId != null && !shipmentPublicId.isBlank()) {
      where.append(" AND s.public_id = ?");
      params.add(shipmentPublicId.trim());
    }
    if (!includeDeleted) where.append(" AND f.status = 'READY'");
    Long totalValue = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*)
        FROM cp_shipment_files f
        JOIN cp_shipments s ON s.id = f.shipment_id
        """ + where,
        Long.class,
        params.toArray()
    );
    List<Object> itemParams = new ArrayList<>(params);
    itemParams.add(size);
    itemParams.add(page * size);
    List<ShipmentFileRecord> records = jdbcTemplate.query(
        """
        SELECT f.*, s.public_id AS shipment_public_id,
               COALESCE(u.display_name, c.display_name) AS uploader_display_name,
               tc.public_id AS target_customer_public_id,
               tc.display_name AS target_customer_display_name,
               r.reference_type AS shipment_reference_type,
               r.reference_no_raw AS shipment_reference_no
        FROM cp_shipment_files f
        JOIN cp_shipments s ON s.id = f.shipment_id
        LEFT JOIN cp_users u ON u.id = f.uploader_user_id
        LEFT JOIN cp_customers c ON c.id = f.uploader_customer_id
        LEFT JOIN cp_customers tc ON tc.id = f.target_customer_id
        LEFT JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id
          FROM cp_shipment_references r2
          WHERE r2.shipment_id = f.shipment_id
          ORDER BY r2.primary_reference DESC, r2.id ASC
          LIMIT 1
        )
        """ + where + " ORDER BY f.created_at DESC, f.id DESC LIMIT ? OFFSET ?",
        this::mapRecord,
        itemParams.toArray()
    );
    Map<String, Object> result = new LinkedHashMap<>();
    FileActor actor = FileActor.internal(admin);
    result.put("items", records.stream().map(record -> metadata(record, actor, "admin")).toList());
    result.put("total", totalValue == null ? 0 : totalValue);
    result.put("page", page);
    result.put("size", size);
    return result;
  }

  private long insertRecord(
      String publicId,
      long shipmentId,
      FileActor actor,
      Long targetCustomerId,
      String category,
      String originalName,
      String relativePath,
      String contentType,
      String extension,
      FileDigest digest,
      String visibility,
      Instant now
  ) {
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbcTemplate.update(connection -> {
      PreparedStatement statement = connection.prepareStatement(
          """
          INSERT INTO cp_shipment_files (
            public_id, shipment_id, uploader_user_id, uploader_customer_id,
            target_customer_id, uploader_role_snapshot,
            document_category, original_file_name, stored_relative_path, content_type,
            extension, size_bytes, sha256, visibility, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?)
          """,
          Statement.RETURN_GENERATED_KEYS
      );
      statement.setString(1, publicId);
      statement.setLong(2, shipmentId);
      if (actor.userId() == null) statement.setNull(3, java.sql.Types.BIGINT);
      else statement.setLong(3, actor.userId());
      if (actor.customerId() == null) statement.setNull(4, java.sql.Types.BIGINT);
      else statement.setLong(4, actor.customerId());
      if (targetCustomerId == null) statement.setNull(5, java.sql.Types.BIGINT);
      else statement.setLong(5, targetCustomerId);
      statement.setString(6, trim(actor.roleSnapshot(), 24));
      statement.setString(7, category);
      statement.setString(8, originalName);
      statement.setString(9, relativePath);
      statement.setString(10, contentType);
      statement.setString(11, extension);
      statement.setLong(12, digest.sizeBytes());
      statement.setString(13, digest.sha256());
      statement.setString(14, visibility);
      statement.setTimestamp(15, timestamp(now));
      statement.setTimestamp(16, timestamp(now));
      return statement;
    }, keyHolder);
    Number key = keyHolder.getKey();
    if (key == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create shipment file record");
    }
    return key.longValue();
  }

  private Long resolveInternalTargetCustomer(
      long shipmentId,
      AuthenticatedUser user,
      String customerPublicId
  ) {
    if (customerPublicId == null || customerPublicId.isBlank()) return null;
    if (!user.isAdmin() && !user.isBusiness()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Business permission is required to share files");
    }
    List<Long> customerIds = user.isAdmin()
        ? jdbcTemplate.query(
            """
            SELECT c.id
            FROM cp_customers c
            JOIN cp_customer_shipment_access a ON a.customer_id = c.id
            WHERE c.public_id = ? AND c.status = 'ACTIVE' AND a.shipment_id = ?
            """,
            (rs, rowNumber) -> rs.getLong(1),
            customerPublicId.trim(),
            shipmentId
        )
        : jdbcTemplate.query(
            """
            SELECT c.id
            FROM cp_customers c
            JOIN cp_customer_shipment_access a ON a.customer_id = c.id
            WHERE c.public_id = ? AND c.status = 'ACTIVE' AND a.shipment_id = ?
              AND c.created_by = ?
            """,
            (rs, rowNumber) -> rs.getLong(1),
            customerPublicId.trim(),
            shipmentId,
            user.id()
        );
    if (customerIds.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Assigned target customer not found");
    }
    return customerIds.get(0);
  }

  private List<Map<String, Object>> assignableCustomers(
      long shipmentId,
      AuthenticatedUser user
  ) {
    String ownershipFilter = user.isAdmin() ? "" : " AND c.created_by = ?";
    List<Object> parameters = new ArrayList<>();
    parameters.add(shipmentId);
    if (!user.isAdmin()) parameters.add(user.id());
    return jdbcTemplate.query(
        """
        SELECT c.public_id, c.username, c.display_name, c.party_role,
               a.relationship_role
        FROM cp_customer_shipment_access a
        JOIN cp_customers c ON c.id = a.customer_id
        WHERE a.shipment_id = ? AND c.status = 'ACTIVE'
        """ + ownershipFilter + " ORDER BY c.display_name ASC, c.id ASC",
        (rs, rowNumber) -> {
          Map<String, Object> value = new LinkedHashMap<>();
          value.put("id", rs.getString("public_id"));
          value.put("username", rs.getString("username"));
          value.put("displayName", rs.getString("display_name"));
          value.put("partyRole", rs.getString("party_role"));
          value.put("relationshipRole", rs.getString("relationship_role"));
          return value;
        },
        parameters.toArray()
    );
  }

  private void lockQuotaSubjects(long shipmentId, Long customerId) {
    jdbcTemplate.queryForObject(
        "SELECT id FROM cp_shipments WHERE id = ? FOR UPDATE",
        Long.class,
        shipmentId
    );
    if (customerId != null) {
      jdbcTemplate.queryForObject(
          "SELECT id FROM cp_customers WHERE id = ? FOR UPDATE",
          Long.class,
          customerId
      );
    }
  }

  private void lockGlobalStorageQuota() {
    jdbcTemplate.update(
        "INSERT INTO cp_shipment_file_storage_lock (id, lock_name) "
            + "VALUES (1, 'shipment-file-capacity') "
            + "ON DUPLICATE KEY UPDATE lock_name = VALUES(lock_name)"
    );
    jdbcTemplate.queryForObject(
        "SELECT id FROM cp_shipment_file_storage_lock WHERE id = 1 FOR UPDATE",
        Integer.class
    );
  }

  private void validateStorageQuotas(long shipmentId, Long customerId, long incomingBytes) {
    long safeIncomingBytes = Math.max(0, incomingBytes);
    Integer shipmentFileCount = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_files "
            + "WHERE shipment_id = ? AND status IN ('READY', 'DELETING', 'DELETE_FAILED')",
        Integer.class,
        shipmentId
    );
    if (properties.getMaxFilesPerShipment() > 0
        && shipmentFileCount != null
        && shipmentFileCount >= properties.getMaxFilesPerShipment()) {
      throw new ApiException(
          HttpStatus.INSUFFICIENT_STORAGE,
          "Shipment file count quota has been reached"
      );
    }

    Long shipmentBytes = jdbcTemplate.queryForObject(
        "SELECT COALESCE(SUM(size_bytes), 0) FROM cp_shipment_files "
            + "WHERE shipment_id = ? AND status IN ('READY', 'DELETING', 'DELETE_FAILED')",
        Long.class,
        shipmentId
    );
    if (wouldExceed(
        shipmentBytes == null ? 0 : shipmentBytes,
        safeIncomingBytes,
        properties.getMaxBytesPerShipment()
    )) {
      throw new ApiException(
          HttpStatus.INSUFFICIENT_STORAGE,
          "Shipment file storage quota would be exceeded"
      );
    }

    if (customerId != null) {
      Long customerBytes = jdbcTemplate.queryForObject(
          "SELECT COALESCE(SUM(size_bytes), 0) FROM cp_shipment_files "
              + "WHERE uploader_customer_id = ? "
              + "AND status IN ('READY', 'DELETING', 'DELETE_FAILED')",
          Long.class,
          customerId
      );
      if (wouldExceed(
          customerBytes == null ? 0 : customerBytes,
          safeIncomingBytes,
          properties.getMaxBytesPerCustomer()
      )) {
        throw new ApiException(
            HttpStatus.INSUFFICIENT_STORAGE,
            "Customer file storage quota would be exceeded"
        );
      }
    }
  }

  private boolean wouldExceed(long currentBytes, long incomingBytes, long configuredLimit) {
    if (configuredLimit <= 0) return false;
    if (currentBytes >= configuredLimit) return incomingBytes > 0 || currentBytes > configuredLimit;
    return incomingBytes > configuredLimit - currentBytes;
  }

  private void requireDiskCapacity(long additionalBytes) {
    try {
      long usableBytes = Files.getFileStore(storageRoot).getUsableSpace();
      long minimumFreeBytes = Math.max(0, properties.getMinFreeSpaceBytes());
      long requiredBytes = Math.max(0, additionalBytes);
      if (usableBytes < minimumFreeBytes
          || requiredBytes > usableBytes - minimumFreeBytes) {
        throw new ApiException(
            HttpStatus.INSUFFICIENT_STORAGE,
            "Shipment file storage does not have enough free space"
        );
      }
    } catch (IOException error) {
      throw new ApiException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Failed to inspect shipment file storage capacity"
      );
    }
  }

  private void deleteStoredContent(ShipmentFileRecord record) {
    Path path = secureResolve(record.relativePath());
    try {
      Files.deleteIfExists(path);
    } catch (IOException error) {
      throw new ApiException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Shipment file metadata was deleted, but its stored content could not be removed"
      );
    }
  }

  private ShipmentFileRecord requireDeletableRecord(String publicId) {
    ShipmentFileRecord record = requireRecord(publicId, true);
    if (!Set.of("READY", "DELETING", "DELETE_FAILED").contains(record.status())) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Shipment file not found");
    }
    return record;
  }

  private void markDeleting(
      long recordId,
      Instant now,
      Long deletedBy,
      Long deletedByCustomerId
  ) {
    int affected = jdbcTemplate.update(
        """
        UPDATE cp_shipment_files
        SET status = 'DELETING', deleted_at = ?, deleted_by = ?,
            deleted_by_customer_id = ?, updated_at = ?
        WHERE id = ? AND status = 'READY'
        """,
        timestamp(now),
        deletedBy,
        deletedByCustomerId,
        timestamp(now),
        recordId
    );
    if (affected == 0) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment file deletion is already in progress");
    }
  }

  private void finishPhysicalDeletion(
      String filePublicId,
      FileActor actor,
      Map<String, Object> before,
      String scope,
      String ipAddress
  ) {
    ShipmentFileRecord deleting = requireDeletableRecord(filePublicId);
    try {
      deleteStoredContent(deleting);
    } catch (ApiException error) {
      jdbcTemplate.update(
          "UPDATE cp_shipment_files SET status = 'DELETE_FAILED', updated_at = ? WHERE id = ?",
          timestamp(clock.instant()),
          deleting.id()
      );
      ShipmentFileRecord failed = requireRecord(filePublicId, true);
      audit(failed, actor, "DELETE_FAILED", before, metadata(failed, actor, scope), ipAddress);
      throw error;
    }
    jdbcTemplate.update(
        "UPDATE cp_shipment_files SET status = 'DELETED', updated_at = ? WHERE id = ?",
        timestamp(clock.instant()),
        deleting.id()
    );
    ShipmentFileRecord deleted = requireRecord(filePublicId, true);
    audit(deleted, actor, "DELETE", before, metadata(deleted, actor, scope), ipAddress);
  }

  private ShipmentFileRecord requireRecord(String publicId, boolean includeDeleted) {
    List<ShipmentFileRecord> records = jdbcTemplate.query(
        """
        SELECT f.*, s.public_id AS shipment_public_id,
               COALESCE(u.display_name, c.display_name) AS uploader_display_name,
               tc.public_id AS target_customer_public_id,
               tc.display_name AS target_customer_display_name,
               r.reference_type AS shipment_reference_type,
               r.reference_no_raw AS shipment_reference_no
        FROM cp_shipment_files f
        JOIN cp_shipments s ON s.id = f.shipment_id
        LEFT JOIN cp_users u ON u.id = f.uploader_user_id
        LEFT JOIN cp_customers c ON c.id = f.uploader_customer_id
        LEFT JOIN cp_customers tc ON tc.id = f.target_customer_id
        LEFT JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id
          FROM cp_shipment_references r2
          WHERE r2.shipment_id = f.shipment_id
          ORDER BY r2.primary_reference DESC, r2.id ASC
          LIMIT 1
        )
        WHERE f.public_id = ?
        """,
        this::mapRecord,
        publicId
    );
    if (records.isEmpty() || (!includeDeleted && !"READY".equals(records.get(0).status()))) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Shipment file not found");
    }
    return records.get(0);
  }

  private ShipmentFileRecord mapRecord(ResultSet rs, int rowNumber) throws SQLException {
    return new ShipmentFileRecord(
        rs.getLong("id"),
        rs.getString("public_id"),
        rs.getLong("shipment_id"),
        rs.getString("shipment_public_id"),
        rs.getString("shipment_reference_type"),
        rs.getString("shipment_reference_no"),
        nullableLong(rs, "uploader_user_id"),
        nullableLong(rs, "uploader_customer_id"),
        nullableLong(rs, "target_customer_id"),
        rs.getString("target_customer_public_id"),
        rs.getString("target_customer_display_name"),
        rs.getString("uploader_display_name"),
        rs.getString("uploader_role_snapshot"),
        rs.getString("document_category"),
        rs.getString("original_file_name"),
        rs.getString("stored_relative_path"),
        rs.getString("content_type"),
        rs.getString("extension"),
        rs.getLong("size_bytes"),
        rs.getString("sha256"),
        rs.getString("visibility"),
        rs.getString("status"),
        instant(rs, "created_at"),
        instant(rs, "updated_at"),
        instant(rs, "deleted_at"),
        nullableLong(rs, "deleted_by"),
        nullableLong(rs, "deleted_by_customer_id")
    );
  }

  private Map<String, Object> metadata(
      ShipmentFileRecord record,
      FileActor actor,
      String scope
  ) {
    boolean canManage = actor != null && actor.canManageFiles();
    boolean canDelete = canManage
        || (actor != null && actor.userId() != null && actor.userId().equals(record.uploaderUserId()))
        || (actor != null && actor.customerId() != null
        && actor.customerId().equals(record.uploaderCustomerId()));
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("id", record.publicId());
    value.put("shipmentId", record.shipmentPublicId());
    value.put("referenceType", record.shipmentReferenceType());
    value.put("referenceNo", record.shipmentReferenceNo());
    value.put(
        "shipmentReference",
        record.shipmentReferenceNo() == null
            ? record.shipmentPublicId()
            : record.shipmentReferenceType() + " · " + record.shipmentReferenceNo()
    );
    value.put("originalFileName", record.originalFileName());
    value.put("contentType", record.contentType());
    value.put("extension", record.extension());
    value.put("sizeBytes", record.sizeBytes());
    value.put("sha256", record.sha256());
    value.put("category", record.category());
    value.put("visibility", record.visibility());
    value.put("status", record.status());
    value.put("uploaderUserId", record.uploaderUserId());
    value.put("uploaderCustomerId", record.uploaderCustomerId());
    value.put("targetCustomerId", record.targetCustomerPublicId());
    value.put("targetCustomerDisplayName", record.targetCustomerDisplayName());
    value.put("uploaderType", record.uploaderCustomerId() == null ? "INTERNAL" : "CUSTOMER");
    value.put("uploaderDisplayName", record.uploaderDisplayName());
    value.put("uploaderRole", record.uploaderRole());
    value.put("uploadedAt", record.createdAt().toString());
    value.put("updatedAt", record.updatedAt().toString());
    value.put("deletedAt", record.deletedAt() == null ? null : record.deletedAt().toString());
    String downloadPrefix = switch (scope) {
      case "admin" -> "/api/admin/shipment-files/";
      case "customer" -> "/api/customer/shipment-files/";
      default -> "/api/shipment-files/";
    };
    value.put("downloadUrl", downloadPrefix + record.publicId() + "/download");
    value.put("canDelete", canDelete);
    value.put("canChangeVisibility", canManage);
    return value;
  }

  private void audit(
      ShipmentFileRecord record,
      FileActor actor,
      String action,
      Object before,
      Object after,
      String ipAddress
  ) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_shipment_file_audit (
          shipment_file_id, shipment_id, actor_user_id, actor_customer_id, action,
          before_json, after_json, ip_address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        record.id(),
        record.shipmentId(),
        actor == null ? null : actor.userId(),
        actor == null ? null : actor.customerId(),
        action,
        json(before),
        json(after),
        trim(ipAddress, 64)
    );
  }

  private String json(Object value) {
    if (value == null) return null;
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to record shipment file audit");
    }
  }

  private FileDigest copyAndDigest(MultipartFile file, Path destination) throws IOException {
    MessageDigest digest;
    try {
      digest = MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException("SHA-256 is unavailable", impossible);
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
          throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Shipment file exceeds the size limit");
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

  private void registerRollbackCleanup(Path storedFile) {
    if (!TransactionSynchronizationManager.isSynchronizationActive()) return;
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
      @Override
      public void afterCompletion(int status) {
        if (status != TransactionSynchronization.STATUS_COMMITTED) {
          deleteQuietly(storedFile);
        }
      }
    });
  }

  private Path secureResolve(String relativePath) {
    if (relativePath == null || relativePath.isBlank()) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Stored shipment file path is invalid");
    }
    Path resolved = storageRoot.resolve(relativePath.replace('/', java.io.File.separatorChar)).normalize();
    if (!resolved.startsWith(storageRoot)) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Stored shipment file path is invalid");
    }
    return resolved;
  }

  private String safeOriginalFileName(String value) {
    String name = value == null || value.isBlank() ? "shipment-file" : value;
    name = Normalizer.normalize(name, Normalizer.Form.NFKC)
        .replace('\0', '_')
        .replace('\\', '/');
    int slash = name.lastIndexOf('/');
    if (slash >= 0) name = name.substring(slash + 1);
    name = name.replaceAll("[\\p{Cntrl}]", "_").trim();
    if (name.isBlank() || ".".equals(name) || "..".equals(name)) name = "shipment-file";
    if (name.length() > 255) {
      String extension = extensionOf(name);
      String suffix = extension.isBlank() ? "" : "." + extension;
      name = name.substring(0, Math.max(1, 255 - suffix.length())) + suffix;
    }
    return name;
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
        .map(value -> value == null ? "" : value.toLowerCase(Locale.ROOT).replace(".", ""))
        .anyMatch(extension::equals);
    if (!supported) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported shipment file type");
    }
  }

  private String normalizeVisibility(String value, String fallback) {
    String normalized = value == null || value.isBlank()
        ? fallback
        : value.trim().toUpperCase(Locale.ROOT);
    if ("INTERNAL_ONLY".equals(normalized)) normalized = "INTERNAL";
    if (normalized == null || !VISIBILITIES.contains(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Visibility must be PARTIES or INTERNAL");
    }
    return normalized;
  }

  private String normalizeCategory(String value) {
    String normalized = value == null || value.isBlank()
        ? "RELATED"
        : value.trim().toUpperCase(Locale.ROOT).replace('-', '_');
    return normalized.matches("[A-Z0-9_]{1,32}") ? normalized : "RELATED";
  }

  private String contentType(String extension) {
    return switch (extension) {
      case "pdf" -> "application/pdf";
      case "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      case "xls" -> "application/vnd.ms-excel";
      case "csv" -> "text/csv";
      case "doc" -> "application/msword";
      case "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      case "jpg", "jpeg" -> "image/jpeg";
      case "png" -> "image/png";
      case "txt" -> "text/plain";
      default -> "application/octet-stream";
    };
  }

  private Long nullableLong(ResultSet rs, String column) throws SQLException {
    long value = rs.getLong(column);
    return rs.wasNull() ? null : value;
  }

  private Instant instant(ResultSet rs, String column) throws SQLException {
    Timestamp value = rs.getTimestamp(column);
    return value == null ? null : value.toInstant();
  }

  private Timestamp timestamp(Instant value) {
    return Timestamp.from(value);
  }

  private String trim(String value, int maxLength) {
    if (value == null) return null;
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }

  private void deleteQuietly(Path path) {
    if (path == null) return;
    try {
      Files.deleteIfExists(path);
    } catch (IOException ignored) {
      // A stale temporary file can be removed by an operations cleanup task.
    }
  }

  public record SavedShipmentFile(ShipmentFileRecord record, Path path) {}

  public record ShipmentFileContent(
      Path path,
      String originalFileName,
      String contentType,
      long sizeBytes
  ) {}

  public record ShipmentFileRecord(
      long id,
      String publicId,
      long shipmentId,
      String shipmentPublicId,
      String shipmentReferenceType,
      String shipmentReferenceNo,
      Long uploaderUserId,
      Long uploaderCustomerId,
      Long targetCustomerId,
      String targetCustomerPublicId,
      String targetCustomerDisplayName,
      String uploaderDisplayName,
      String uploaderRole,
      String category,
      String originalFileName,
      String relativePath,
      String contentType,
      String extension,
      long sizeBytes,
      String sha256,
      String visibility,
      String status,
      Instant createdAt,
      Instant updatedAt,
      Instant deletedAt,
      Long deletedBy,
      Long deletedByCustomerId
  ) {}

  private record FileDigest(long sizeBytes, String sha256) {}

  private record FileActor(
      Long userId,
      Long customerId,
      String roleSnapshot,
      boolean canManageFiles
  ) {
    static FileActor internal(AuthenticatedUser user) {
      return new FileActor(user.id(), null, user.role(), user.canManageShipmentFiles());
    }

    static FileActor customer(CustomerPrincipal customer) {
      return new FileActor(null, customer.id(), "CUSTOMER_" + customer.partyRole(), false);
    }
  }
}
