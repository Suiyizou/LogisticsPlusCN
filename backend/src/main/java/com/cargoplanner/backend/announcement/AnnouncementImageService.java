package com.cargoplanner.backend.announcement;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class AnnouncementImageService {
  private static final long MAX_PIXELS = 40_000_000L;
  private static final Set<String> MIME_TYPES = Set.of("image/jpeg", "image/png", "image/gif");

  private final JdbcTemplate jdbcTemplate;
  private final AnnouncementImageProperties properties;
  private final Path storageRoot;

  public AnnouncementImageService(
      JdbcTemplate jdbcTemplate,
      AnnouncementImageProperties properties
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.properties = properties;
    this.storageRoot = Path.of(properties.getRoot()).toAbsolutePath().normalize();
    try {
      Files.createDirectories(storageRoot);
    } catch (IOException error) {
      throw new IllegalStateException("Cannot initialize announcement image storage", error);
    }
  }

  public synchronized Map<String, Object> store(
      MultipartFile file,
      AuthenticatedUser administrator,
      String ipAddress
  ) {
    if (file == null || file.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Image file is required");
    }
    if (file.getSize() > properties.getMaxFileSizeBytes()) {
      throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Announcement image exceeds the 10 MB limit");
    }

    String originalName = safeOriginalName(file.getOriginalFilename());
    String extension = extensionOf(originalName);
    if (!properties.getAllowedExtensions().contains(extension)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only JPG, PNG, and GIF images are supported");
    }
    String declaredContentType = String.valueOf(file.getContentType()).toLowerCase(Locale.ROOT);
    if (!"null".equals(declaredContentType) && !MIME_TYPES.contains(declaredContentType)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Uploaded file is not a supported image");
    }

    String storedName = UUID.randomUUID().toString().replace("-", "") + "." + extension;
    Path target = secureResolve(storedName);
    Path temporary = null;
    try {
      temporary = Files.createTempFile(storageRoot, ".announcement-", ".part");
      file.transferTo(temporary);
      validateImageContent(temporary);
      moveAtomically(temporary, target);
      temporary = null;
    } catch (ApiException error) {
      deleteQuietly(temporary);
      throw error;
    } catch (IOException error) {
      deleteQuietly(temporary);
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to store announcement image");
    }

    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (
          admin_user_id, action, target_type, detail, ip_address
        )
        VALUES (?, 'UPLOAD_ANNOUNCEMENT_IMAGE', 'ANNOUNCEMENT_IMAGE', ?, ?)
        """,
        administrator.id(),
        ClientInfo.trim("Uploaded announcement image " + originalName + " as " + storedName, 512),
        ClientInfo.trim(ipAddress, 64)
    );

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("url", "/api/public/announcement-images/" + storedName);
    response.put("storagePath", "announcement-images/" + storedName);
    response.put("originalName", originalName);
    response.put("sizeBytes", file.getSize());
    response.put("contentType", contentType(extension));
    return response;
  }

  public StoredImage load(String fileName) {
    if (fileName == null || !fileName.matches("^[a-f0-9]{32}\\.(?:jpg|jpeg|png|gif)$")) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Announcement image not found");
    }
    Path path = secureResolve(fileName);
    if (!Files.isRegularFile(path)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Announcement image not found");
    }
    try {
      Resource resource = new UrlResource(path.toUri());
      return new StoredImage(resource, contentType(extensionOf(fileName)));
    } catch (IOException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to read announcement image");
    }
  }

  private void validateImageContent(Path path) throws IOException {
    BufferedImage image = ImageIO.read(path.toFile());
    if (image == null || image.getWidth() <= 0 || image.getHeight() <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Uploaded file does not contain a valid image");
    }
    long pixels = (long) image.getWidth() * image.getHeight();
    if (pixels > MAX_PIXELS) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Announcement image dimensions are too large");
    }
  }

  private Path secureResolve(String fileName) {
    Path resolved = storageRoot.resolve(fileName).normalize();
    if (!resolved.startsWith(storageRoot)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid announcement image path");
    }
    return resolved;
  }

  private String safeOriginalName(String originalName) {
    String value = originalName == null ? "announcement-image" : originalName.trim();
    try {
      Path fileName = Path.of(value).getFileName();
      value = fileName == null ? "announcement-image" : fileName.toString();
    } catch (RuntimeException ignored) {
      value = "announcement-image";
    }
    return ClientInfo.trim(value.replaceAll("[\\r\\n\\u0000]", "_"), 180);
  }

  private String extensionOf(String fileName) {
    int dot = fileName.lastIndexOf('.');
    return dot < 0 ? "" : fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
  }

  private String contentType(String extension) {
    return switch (extension) {
      case "jpg", "jpeg" -> "image/jpeg";
      case "png" -> "image/png";
      case "gif" -> "image/gif";
      default -> "application/octet-stream";
    };
  }

  private void moveAtomically(Path source, Path target) throws IOException {
    try {
      Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
    } catch (AtomicMoveNotSupportedException ignored) {
      Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
    }
  }

  private void deleteQuietly(Path path) {
    if (path == null) return;
    try {
      Files.deleteIfExists(path);
    } catch (IOException ignored) {
      // A later system cleanup can remove an abandoned temporary file.
    }
  }

  public record StoredImage(Resource resource, String contentType) {}
}
