package com.cargoplanner.backend.workspacefile;

import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.workspace-files")
public class WorkspaceFileProperties {
  private String root = "./uploads";
  private Duration retention = Duration.ofDays(14);
  private long maxFileSizeBytes = 80L * 1024L * 1024L;
  private Set<String> allowedExtensions = new LinkedHashSet<>(Set.of("xlsx", "xls", "csv", "tsv"));

  public String getRoot() {
    return root;
  }

  public void setRoot(String root) {
    this.root = root;
  }

  public Duration getRetention() {
    return retention;
  }

  public void setRetention(Duration retention) {
    this.retention = retention;
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
