package com.cargoplanner.backend.shipment;

import java.util.List;

/** Supported carrier identities shared by ticket validation and refresh scheduling. */
public final class TrackingCarriers {
  public static final List<String> CODES = List.of(
      "COSCO", "CMA", "MAERSK", "HAPAG_LLOYD", "MSC", "OOCL",
      "ONE", "HMM", "EVERGREEN", "MATSON", "YML", "WAN_HAI", "SML", "KMTC", "ZIM", "HEDE"
  );

  private TrackingCarriers() {}

  public static boolean browserAgentCarrier(String carrier) {
    return CODES.contains(carrier) && !List.of("COSCO", "CMA").contains(carrier);
  }

  public static boolean supportsReference(String carrier, String type) {
    return supportsReference(carrier, type, false);
  }

  public static boolean supportsReference(String carrier, String type, boolean localQueue) {
    return CODES.contains(carrier) && ("BOOKING".equals(type)
        || (!"CMA".equals(carrier) && (localQueue || browserAgentCarrier(carrier))
            && "BILLOFLADING".equals(type)));
  }
}
