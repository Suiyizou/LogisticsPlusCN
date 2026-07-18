package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
public class ShipmentFileController {
  private final ShipmentFileService fileService;

  public ShipmentFileController(ShipmentFileService fileService) {
    this.fileService = fileService;
  }

  @GetMapping("/shipments/{shipmentId}/files")
  public Map<String, Object> list(
      @PathVariable String shipmentId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return fileService.list(shipmentId, user);
  }

  @PostMapping(
      value = "/shipments/{shipmentId}/files",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE
  )
  public Map<String, Object> upload(
      @PathVariable String shipmentId,
      @RequestParam(value = "files", required = false) List<MultipartFile> files,
      @RequestParam(value = "file", required = false) MultipartFile singleFile,
      @RequestParam(value = "category", defaultValue = "RELATED") String category,
      @RequestParam(value = "visibility", defaultValue = "INTERNAL") String visibility,
      @RequestParam(value = "targetCustomerId", required = false) String targetCustomerId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user,
      HttpServletRequest request
  ) {
    List<MultipartFile> uploads = new ArrayList<>();
    if (files != null) uploads.addAll(files);
    if (singleFile != null) uploads.add(singleFile);
    uploads.removeIf(file -> file == null || file.isEmpty());
    if (uploads.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one shipment file is required");
    }
    List<Map<String, Object>> items = new ArrayList<>();
    for (MultipartFile upload : uploads) {
      ShipmentFileService.SavedShipmentFile saved = fileService.store(
          upload,
          shipmentId,
          user,
          category,
          visibility,
          targetCustomerId,
          ClientInfo.ip(request)
      );
      items.add(fileService.metadata(saved, user));
    }
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", items);
    response.put("total", items.size());
    return response;
  }

  @GetMapping("/shipment-files/{fileId}/download")
  public ResponseEntity<Resource> download(
      @PathVariable String fileId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user,
      HttpServletRequest request
  ) {
    return fileResponse(fileService.content(fileId, user, ClientInfo.ip(request)));
  }

  @PatchMapping("/shipment-files/{fileId}/visibility")
  public Map<String, Object> updateVisibility(
      @PathVariable String fileId,
      @RequestBody ShipmentFileVisibilityRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user,
      HttpServletRequest httpRequest
  ) {
    return fileService.updateVisibility(
        fileId,
        request == null ? null : request.visibility(),
        request == null ? null : request.targetCustomerId(),
        user,
        ClientInfo.ip(httpRequest)
    );
  }

  @DeleteMapping("/shipment-files/{fileId}")
  public Map<String, Object> delete(
      @PathVariable String fileId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user,
      HttpServletRequest request
  ) {
    fileService.delete(fileId, user, ClientInfo.ip(request));
    return Map.of("deleted", true, "id", fileId);
  }

  static ResponseEntity<Resource> fileResponse(ShipmentFileService.ShipmentFileContent content) {
    ContentDisposition disposition = ContentDisposition.attachment()
        .filename(content.originalFileName(), StandardCharsets.UTF_8)
        .build();
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
        .header("X-Content-Type-Options", "nosniff")
        .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
        .contentLength(content.sizeBytes())
        .contentType(MediaType.parseMediaType(content.contentType()))
        .body(new FileSystemResource(content.path()));
  }

}
