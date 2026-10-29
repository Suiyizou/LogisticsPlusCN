package com.cargoplanner.backend.shipment;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Supported carrier identities shared by ticket validation and refresh scheduling. */
public final class TrackingCarriers {
  public static final List<String> CODES = List.of(
      "COSCO", "CMA", "MAERSK", "HAPAG_LLOYD", "MSC", "OOCL",
      "ONE", "HMM", "EVERGREEN", "MATSON", "YML", "WAN_HAI", "SML", "KMTC", "ZIM", "HEDE"
  );
  private static final Map<String, String> ALIASES = Map.ofEntries(
      Map.entry("CMA_CGM", "CMA"),
      Map.entry("CMA CGM", "CMA"),
      Map.entry("HPL", "HAPAG_LLOYD"),
      Map.entry("YANGMING", "YML"),
      Map.entry("YANG MING", "YML"),
      Map.entry("WHL", "WAN_HAI"),
      Map.entry("WHZ", "WAN_HAI"),
      Map.entry("WAN HAI", "WAN_HAI"),
      Map.entry("MSK", "MAERSK"),
      Map.entry("EMC", "EVERGREEN"),
      Map.entry("MATSN", "MATSON")
  );

  private TrackingCarriers() {}

  /** Unknown or omitted codes remain unknown; callers must validate before querying. */
  public static String canonicalCode(String value) {
    String code = value == null ? "" : value.trim().toUpperCase(Locale.ROOT).replaceAll("\\s+", " ");
    return ALIASES.getOrDefault(code, code);
  }

  public static boolean browserAgentCarrier(String carrier) {
    String code = canonicalCode(carrier);
    return CODES.contains(code) && !List.of("COSCO", "CMA").contains(code);
  }

  public static boolean supportsReference(String carrier, String type) {
    return supportsReference(carrier, type, false);
  }

  public static boolean supportsReference(String carrier, String type, boolean localQueue) {
    String code = canonicalCode(carrier);
    return CODES.contains(code) && ("BOOKING".equals(type)
        || (!"CMA".equals(code) && (localQueue || browserAgentCarrier(code))
            && "BILLOFLADING".equals(type)));
  }
}
