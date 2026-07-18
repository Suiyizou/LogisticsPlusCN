package com.cargoplanner.backend.workspacefile;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ApiException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/workspace-files")
public class WorkspaceFileController {
  private final WorkspaceFileService workspaceFileService;

  public WorkspaceFileController(WorkspaceFileService workspaceFileService) {
    this.workspaceFileService = workspaceFileService;
  }

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> upload(
      @RequestParam(value = "files", required = false) List<MultipartFile> files,
      @RequestParam(value = "file", required = false) MultipartFile singleFile,
      @RequestParam(value = "source", defaultValue = "USER_UPLOAD") String source,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    List<MultipartFile> uploads = new ArrayList<>();
    if (files != null) uploads.addAll(files);
    if (singleFile != null) uploads.add(singleFile);
    uploads.removeIf((file) -> file == null || file.isEmpty());
    if (uploads.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one upload file is required");
    }

    List<Map<String, Object>> items = new ArrayList<>();
    int deduplicatedCount = 0;
    for (MultipartFile upload : uploads) {
      WorkspaceFileService.SavedWorkspaceFile saved = workspaceFileService.store(upload, user, source);
      if (saved.deduplicated()) deduplicatedCount++;
      items.add(workspaceFileService.metadata(saved));
    }
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", items);
    response.put("total", items.size());
    response.put("deduplicatedCount", deduplicatedCount);
    return response;
  }

  @GetMapping
  public Map<String, Object> list(
      @RequestParam(value = "date", required = false) String date,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "100") int size,
      @RequestParam(value = "includeExpired", defaultValue = "false") boolean includeExpired,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return workspaceFileService.listOwned(user, parseDate(date), page, size, includeExpired);
  }

  @GetMapping("/{id}")
  public Map<String, Object> metadata(
      @PathVariable long id,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return workspaceFileService.ownedMetadata(id, user);
  }

  @GetMapping("/{id}/preview")
  public ResponseEntity<Resource> preview(
      @PathVariable long id,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return fileResponse(workspaceFileService.ownedContent(id, user), false);
  }

  @GetMapping("/{id}/download")
  public ResponseEntity<Resource> download(
      @PathVariable long id,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return fileResponse(workspaceFileService.ownedContent(id, user), true);
  }

  @PostMapping("/{id}/reuse")
  public Map<String, Object> reuse(
      @PathVariable long id,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return workspaceFileService.reuse(id, user);
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(
      @PathVariable long id,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    workspaceFileService.deleteOwned(id, user);
    return Map.of("deleted", true, "id", id);
  }

  static ResponseEntity<Resource> fileResponse(
      WorkspaceFileService.WorkspaceFileContent content,
      boolean attachment
  ) {
    ContentDisposition disposition = (attachment ? ContentDisposition.attachment() : ContentDisposition.inline())
        .filename(content.originalFileName(), StandardCharsets.UTF_8)
        .build();
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
        .header("X-Content-Type-Options", "nosniff")
        .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
        .contentLength(content.sizeBytes())
        .contentType(MediaType.parseMediaType(content.contentType()))
        .body(new FileSystemResource(content.path()));
  }

  static LocalDate parseDate(String value) {
    if (value == null || value.isBlank()) return null;
    try {
      return LocalDate.parse(value);
    } catch (DateTimeParseException error) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "date must use YYYY-MM-DD format");
    }
  }
}
