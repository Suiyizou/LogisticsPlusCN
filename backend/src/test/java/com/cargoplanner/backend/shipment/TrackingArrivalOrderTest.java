package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class TrackingArrivalOrderTest {
  private final ObjectMapper json = new ObjectMapper();
  @Test void carrierEnglishDatesSortWithIsoDatesAndRejectInvalidDates() {
    assertThat(TrackingArrivalOrder.parse("03 Aug 2026")).isEqualTo(TrackingArrivalOrder.parse("2026-08-03"));
    assertThat(TrackingArrivalOrder.parse("Monday, 03-AUG-2026 13:20" )).isEqualTo(TrackingArrivalOrder.parse("2026-08-03"));
    assertThat(TrackingArrivalOrder.parse("19 Aug 2026")).isGreaterThan(TrackingArrivalOrder.parse("03 Aug 2026"));
    assertThat(TrackingArrivalOrder.parse("31 Feb 2026")).isNull();
    assertThat(TrackingArrivalOrder.parse("05/06/2026")).isNull();
    assertThat(TrackingArrivalOrder.parse(null)).isNull();
  }
  @Test void blankLegCannotHideReportedEtaAndContainerEtaDoesNotBecomeShipmentEta() throws Exception {
    var snapshot = json.readTree("""
        {"routingLegs":[{"estimatedArrival":""}],"keyTimes":{},"sourceDetails":{"fields":[
        {"key":"eta","source":"shipment.containers.0","value":"2099-01-01"},
        {"key":"eta","source":"shipment.fields","value":"19 Aug 2026"}]}}
        """);
    assertThat(TrackingArrivalOrder.arrival(snapshot)).isEqualTo(TrackingArrivalOrder.parse("2026-08-19"));
  }
  @Test void actualArrivalWinsOverEstimatedAndNoDateStaysUnknown() throws Exception {
    assertThat(TrackingArrivalOrder.arrival(json.readTree("""
        {"keyTimes":{"actualArrival":{"time":"03 Aug 2026"},"estimatedArrival":{"time":"2099-01-01"}}}
        """))).isEqualTo(TrackingArrivalOrder.parse("2026-08-03"));
    assertThat(TrackingArrivalOrder.arrival(json.readTree("{}"))).isNull();
  }
}
