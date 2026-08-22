package com.cargoplanner.backend.announcement;

import com.cargoplanner.backend.auth.AdminAuthInterceptor;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ClientInfo;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class AnnouncementImageController {
  private final AnnouncementImageService imageService;

  public AnnouncementImageController(AnnouncementImageService imageService) {
    this.imageService = imageService;
  }

  @PostMapping(
      value = "/api/admin/announcement-images",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE
  )
  public Map<String, Object> upload(
      @RequestParam("file") MultipartFile file,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser administrator,
      HttpServletRequest request
  ) {
    return imageService.store(file, administrator, ClientInfo.ip(request));
  }

  @GetMapping("/api/public/announcement-images/{fileName:.+}")
  public ResponseEntity<?> image(@PathVariable String fileName) {
    AnnouncementImageService.StoredImage image = imageService.load(fileName);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(image.contentType()))
        .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic().immutable())
        .body(image.resource());
  }
}
