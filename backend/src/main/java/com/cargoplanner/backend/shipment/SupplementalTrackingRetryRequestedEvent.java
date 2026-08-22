package com.cargoplanner.backend.shipment;

import java.time.Instant;
import java.util.List;

final class SupplementalTrackingRetryRequestedEvent {
  private final String shipmentPublicId;
  private final List<String> sources;
  private final String errorCode;
  private final String errorMessage;
  private final Instant requestedAt;
  private boolean scheduled;

  SupplementalTrackingRetryRequestedEvent(
      String shipmentPublicId,
      List<String> sources,
      String errorCode,
      String errorMessage,
      Instant requestedAt
  ) {
    this.shipmentPublicId = shipmentPublicId;
    this.sources = sources == null ? List.of() : List.copyOf(sources);
    this.errorCode = errorCode;
    this.errorMessage = errorMessage;
    this.requestedAt = requestedAt;
  }

  String shipmentPublicId() { return shipmentPublicId; }
  List<String> sources() { return sources; }
  String errorCode() { return errorCode; }
  String errorMessage() { return errorMessage; }
  Instant requestedAt() { return requestedAt; }
  boolean scheduled() { return scheduled; }
  void markScheduled() { scheduled = true; }
}
