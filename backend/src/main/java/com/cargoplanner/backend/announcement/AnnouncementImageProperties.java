package com.cargoplanner.backend.announcement;

import java.util.LinkedHashSet;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.announcement-images")
public class AnnouncementImageProperties {
  private String root = "./uploads/announcement-images";
  private long maxFileSizeBytes = 10L * 1024L * 1024L;
  private Set<String> allowedExtensions = new LinkedHashSet<>(
      Set.of("jpg", "jpeg", "png", "gif")
  );

  public String getRoot() {
    return root;
  }

  public void setRoot(String root) {
    this.root = root;
  }

  public long getMaxFileSizeBytes() {
    return maxFileSizeBytes;
  }

  public void setMaxFileSizeBytes(long maxFileSizeBytes) {
    this.maxFileSizeBytes = maxFileSizeBytes;
  }

  public Set<String> getAllowedExtensions() {
    return allowedExtensions;
  }

  public void setAllowedExtensions(Set<String> allowedExtensions) {
    this.allowedExtensions = allowedExtensions;
  }
}
