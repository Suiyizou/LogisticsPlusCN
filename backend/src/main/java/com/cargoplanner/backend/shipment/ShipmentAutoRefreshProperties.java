package com.cargoplanner.backend.shipment;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.shipment-tracking.auto-refresh")
public class ShipmentAutoRefreshProperties {
  private boolean enabled = true;
  private Duration refreshInterval = Duration.ofDays(1);
  private Duration leaseDuration = Duration.ofMinutes(5);
  private Duration retryBaseDelay = Duration.ofMinutes(15);
  private Duration retryMaxDelay = Duration.ofHours(6);
  private int discoveryBatchSize = 500;
  private int claimBatchSize = 1;

  public boolean isEnabled() { return enabled; }
  public void setEnabled(boolean enabled) { this.enabled = enabled; }
  public Duration getRefreshInterval() { return refreshInterval; }
  public void setRefreshInterval(Duration value) { this.refreshInterval = value; }
  public Duration getLeaseDuration() { return leaseDuration; }
  public void setLeaseDuration(Duration value) { this.leaseDuration = value; }
  public Duration getRetryBaseDelay() { return retryBaseDelay; }
  public void setRetryBaseDelay(Duration value) { this.retryBaseDelay = value; }
  public Duration getRetryMaxDelay() { return retryMaxDelay; }
  public void setRetryMaxDelay(Duration value) { this.retryMaxDelay = value; }
  public int getDiscoveryBatchSize() { return discoveryBatchSize; }
  public void setDiscoveryBatchSize(int value) { this.discoveryBatchSize = value; }
  public int getClaimBatchSize() { return claimBatchSize; }
  public void setClaimBatchSize(int value) { this.claimBatchSize = value; }
}
