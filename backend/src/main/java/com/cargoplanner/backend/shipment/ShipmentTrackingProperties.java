package com.cargoplanner.backend.shipment;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.shipment-tracking")
public class ShipmentTrackingProperties {
  public enum AdapterMode { LEGACY, LOCAL_QUEUE }

  private AdapterMode adapterMode = AdapterMode.LEGACY;
  private String localBaseUrl = "http://127.0.0.1:8791";
  private String localToken = "";
  private Duration localJobTimeout = Duration.ofMinutes(7);
  private Duration localPollInterval = Duration.ofSeconds(2);
  private Duration localRequestTimeout = Duration.ofSeconds(15);
  private String adapterBaseUrl = "http://127.0.0.1:3000";
  private Duration cacheTtl = Duration.ofMinutes(15);
  private Duration connectTimeout = Duration.ofSeconds(5);
  private Duration readTimeout = Duration.ofSeconds(90);
  private Duration agentReadTimeout = Duration.ofSeconds(480);
  private String adapterKey = "";

  public AdapterMode getAdapterMode() { return adapterMode; }
  public void setAdapterMode(AdapterMode value) { adapterMode = value; }
  public boolean usesLocalQueue() { return adapterMode == AdapterMode.LOCAL_QUEUE; }
  public String getLocalBaseUrl() { return localBaseUrl; }
  public void setLocalBaseUrl(String value) { localBaseUrl = value; }
  public String getLocalToken() { return localToken; }
  public void setLocalToken(String value) { localToken = value; }
  public Duration getLocalJobTimeout() { return localJobTimeout; }
  public void setLocalJobTimeout(Duration value) { localJobTimeout = value; }
  public Duration getLocalPollInterval() { return localPollInterval; }
  public void setLocalPollInterval(Duration value) { localPollInterval = value; }
  public Duration getLocalRequestTimeout() { return localRequestTimeout; }
  public void setLocalRequestTimeout(Duration value) { localRequestTimeout = value; }

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
