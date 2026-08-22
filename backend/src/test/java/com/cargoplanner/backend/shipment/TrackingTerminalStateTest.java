package com.cargoplanner.backend.shipment;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class TrackingTerminalStateTest {
  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void recognizesNormalizedEmptyReturnEquivalents() {
    assertThat(TrackingTerminalState.isEquivalentStatus("Empty Returned")).isTrue();
    assertThat(TrackingTerminalState.isEquivalentStatus("Empty return")).isTrue();
    assertThat(TrackingTerminalState.isEquivalentStatus("Empty container received at depot")).isTrue();
    assertThat(TrackingTerminalState.isEquivalentStatus("MTY in depot")).isTrue();
    assertThat(TrackingTerminalState.isEquivalentStatus("已还空箱")).isTrue();
    assertThat(TrackingTerminalState.isEquivalentStatus("Empty pickup")).isFalse();
    assertThat(TrackingTerminalState.isEquivalentStatus("Vessel arrived")).isFalse();
  }

  @Test
  void acceptsSummaryTerminalStateWhenContainersDoNotReportCurrentStates() throws Exception {
    JsonNode snapshot = objectMapper.readTree("""
        {"summary":{"latestEvent":{"name":"Empty Returned"}},"containers":[]}
        """);
    assertThat(TrackingTerminalState.isEmptyReturned(snapshot)).isTrue();
  }

  @Test
  void requiresEveryContainerToReachTheTerminalState() throws Exception {
    JsonNode partial = objectMapper.readTree("""
        {"summary":{"latestEvent":{"name":"Empty Returned"}},"containers":[
          {"number":"A","latestEvent":"Empty Returned"},
          {"number":"B","latestEvent":"Gate out for delivery"}
        ]}
        """);
    JsonNode complete = objectMapper.readTree("""
        {"containers":[
          {"number":"A","latestEvent":"Empty Returned"},
          {"number":"B","latestEvent":{"name":"Empty in depot"}}
        ]}
        """);

    assertThat(TrackingTerminalState.isEmptyReturned(partial)).isFalse();
    assertThat(TrackingTerminalState.isEmptyReturned(complete)).isTrue();
  }
}
