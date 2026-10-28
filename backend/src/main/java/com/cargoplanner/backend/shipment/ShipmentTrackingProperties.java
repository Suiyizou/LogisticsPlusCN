package com.cargoplanner.backend.shipment;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.shipment-tracking")
public class ShipmentTrackingProperties {
  private String adapterBaseUrl = "http://127.0.0.1:3000";
  private Duration cacheTtl = Duration.ofMinutes(15);
  private Duration connectTimeout = Duration.ofSeconds(5);
  private Duration readTimeout = Duration.ofSeconds(90);
  private Duration agentReadTimeout = Duration.ofSeconds(480);
  private String adapterKey = "";

  public String getAdapterBaseUrl() {
    return adapterBaseUrl;
  }

  public void setAdapterBaseUrl(String adapterBaseUrl) {
    this.adapterBaseUrl = adapterBaseUrl;
  }

  public Duration getCacheTtl() {
    return cacheTtl;
  }

  public void setCacheTtl(Duration cacheTtl) {
    this.cacheTtl = cacheTtl;
  }

  public Duration getConnectTimeout() {
    return connectTimeout;
  }

  public void setConnectTimeout(Duration connectTimeout) {
    this.connectTimeout = connectTimeout;
  }

  public Duration getReadTimeout() {
    return readTimeout;
  }

  public void setReadTimeout(Duration readTimeout) {
    this.readTimeout = readTimeout;
  }

  public String getAdapterKey() {
    return adapterKey;
  }

  public Duration getAgentReadTimeout() {
    return agentReadTimeout;
  }

  public void setAgentReadTimeout(Duration agentReadTimeout) {
    this.agentReadTimeout = agentReadTimeout;
  }

  public void setAdapterKey(String adapterKey) {
    this.adapterKey = adapterKey;
  }
}
