package com.cargoplanner.backend.shipment;

import java.util.List;

/** Supported carrier identities shared by ticket validation and refresh scheduling. */
public final class TrackingCarriers {
  public static final List<String> CODES = List.of(
      "COSCO", "CMA", "MAERSK", "HAPAG_LLOYD", "MSC", "OOCL"
  );

  private TrackingCarriers() {}

  public static boolean browserAgentCarrier(String carrier) {
    return CODES.contains(carrier) && !List.of("COSCO", "CMA").contains(carrier);
  }

  public static boolean supportsReference(String carrier, String type) {
    return CODES.contains(carrier) && ("BOOKING".equals(type)
        || (browserAgentCarrier(carrier) && "BILLOFLADING".equals(type)));
  }
}
