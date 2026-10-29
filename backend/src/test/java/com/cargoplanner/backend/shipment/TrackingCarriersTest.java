package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;

class TrackingCarriersTest {
  @Test
  void resolvesEstablishedAliasesToOnePlatformIdentity() {
    Map<String, String> aliases = Map.ofEntries(
        Map.entry("CMA", "CMA"), Map.entry("cma_cgm", "CMA"),
        Map.entry("HPL", "HAPAG_LLOYD"), Map.entry("hapag_lloyd", "HAPAG_LLOYD"),
        Map.entry("YML", "YML"), Map.entry(" YANGMING ", "YML"),
        Map.entry("Yang  Ming", "YML"), Map.entry("WHL", "WAN_HAI"),
        Map.entry("WHZ", "WAN_HAI"), Map.entry("MSK", "MAERSK"),
        Map.entry("EMC", "EVERGREEN"), Map.entry("MATSN", "MATSON")
    );
    aliases.forEach((alias, expected) -> {
      assertThat(TrackingCarriers.canonicalCode(alias)).isEqualTo(expected);
      assertThat(TrackingCarriers.supportsReference(alias, "BOOKING", true)).isTrue();
    });
    assertThat(TrackingCarriers.supportsReference("HPL", "BILLOFLADING", true)).isTrue();
    assertThat(TrackingCarriers.supportsReference("CMA_CGM", "BILLOFLADING", true)).isFalse();
    assertThat(TrackingCarriers.browserAgentCarrier("HPL")).isTrue();
    assertThat(TrackingCarriers.browserAgentCarrier("CMA_CGM")).isFalse();
  }

  @Test
  void unknownAndMissingCodesNeverBecomeCoscoOrGainCapabilities() {
    assertThat(TrackingCarriers.canonicalCode("unknown-carrier")).isEqualTo("UNKNOWN-CARRIER");
    assertThat(TrackingCarriers.canonicalCode(null)).isEmpty();
    assertThat(TrackingCarriers.canonicalCode(" ")).isEmpty();
    assertThat(TrackingCarriers.supportsReference("unknown-carrier", "BOOKING", true)).isFalse();
    assertThat(TrackingCarriers.supportsReference(null, "BOOKING", true)).isFalse();
    assertThat(TrackingCarriers.browserAgentCarrier("unknown-carrier")).isFalse();
    assertThat(TrackingCarriers.supportsReference("COSCO", "BILLOFLADING", false)).isFalse();
    assertThat(TrackingCarriers.supportsReference("COSCO", "BILLOFLADING", true)).isTrue();
  }
}
