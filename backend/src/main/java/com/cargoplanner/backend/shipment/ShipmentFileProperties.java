package com.cargoplanner.backend.shipment;

import java.util.LinkedHashSet;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.shipment-files")
public class ShipmentFileProperties {
  private String root = "./shipment-files";
  private long maxFileSizeBytes = 80L * 1024L * 1024L;
  private int maxFilesPerShipment = 200;
  private long maxBytesPerShipment = 2L * 1024L * 1024L * 1024L;
  private long maxBytesPerCustomer = 5L * 1024L * 1024L * 1024L;
  private long minFreeSpaceBytes = 1024L * 1024L * 1024L;
  private Set<String> allowedExtensions = new LinkedHashSet<>(
      Set.of("pdf", "xlsx", "xls", "csv", "doc", "docx", "jpg", "jpeg", "png", "txt")
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

  public int getMaxFilesPerShipment() {
    return maxFilesPerShipment;
  }

  public void setMaxFilesPerShipment(int maxFilesPerShipment) {
    this.maxFilesPerShipment = maxFilesPerShipment;
  }

  public long getMaxBytesPerShipment() {
    return maxBytesPerShipment;
  }

  public void setMaxBytesPerShipment(long maxBytesPerShipment) {
    this.maxBytesPerShipment = maxBytesPerShipment;
  }

  public long getMaxBytesPerCustomer() {
    return maxBytesPerCustomer;
  }

  public void setMaxBytesPerCustomer(long maxBytesPerCustomer) {
    this.maxBytesPerCustomer = maxBytesPerCustomer;
  }

  public long getMinFreeSpaceBytes() {
    return minFreeSpaceBytes;
  }

  public void setMinFreeSpaceBytes(long minFreeSpaceBytes) {
    this.minFreeSpaceBytes = minFreeSpaceBytes;
  }

  public Set<String> getAllowedExtensions() {
    return allowedExtensions;
  }

  public void setAllowedExtensions(Set<String> allowedExtensions) {
    this.allowedExtensions = allowedExtensions;
  }
}
