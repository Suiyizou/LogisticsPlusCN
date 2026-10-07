package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;

/**
 * 运单参考号、批量 ID 与 JSON 文本的规范化工具。
 *
 * <p>这些规则同时被票单查询、票单绑定/创建与追踪批次使用。抽成无状态工具类，避免各领域
 * 服务复制；行为与原 {@code BusinessCustomerService} 的私有实现完全一致。
 */
public final class ShipmentReferences {
  private static final List<String> REFERENCE_TYPES = List.of("BOOKING", "BILLOFLADING");

  private ShipmentReferences() {}

  public static String normalizeReference(String value) {
    return value == null ? "" : value.trim().replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
  }

  public static String durableReferenceIdentity(String carrier, String type, String referenceNo) {
    String normalizedCarrier = normalizeCode(carrier, "");
    String normalizedType = normalizeCode(type, "");
    String normalizedNumber = normalizeReference(referenceNo);
    if (isSharedCoscoNumericIdentity(normalizedCarrier, normalizedType, normalizedNumber)) {
      String canonical =
          normalizedNumber.startsWith("COSU") ? normalizedNumber.substring(4) : normalizedNumber;
      return normalizedCarrier + "|COSCO_NUMERIC|" + canonical;
    }
    return normalizedCarrier + "|" + normalizedType + "|" + normalizedNumber;
  }

  public static boolean isSharedCoscoNumericIdentity(
      String carrier, String type, String normalizedNumber
  ) {
    return "COSCO".equals(carrier)
        && REFERENCE_TYPES.contains(type)
        && normalizeReference(normalizedNumber).matches("(?:COSU)?[0-9]{8,12}");
  }

  public static List<String> normalizeShipmentIds(List<String> rawShipmentIds) {
    if (rawShipmentIds == null || rawShipmentIds.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one shipment id is required");
    }
    if (rawShipmentIds.size() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A shipment batch cannot exceed 500 items");
    }
    List<String> shipmentIds =
        rawShipmentIds.stream()
            .map((value) -> value == null ? "" : value.trim())
            .filter((value) -> !value.isBlank())
            .distinct()
            .toList();
    if (shipmentIds.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one shipment id is required");
    }
    return shipmentIds;
  }

  public static String textOrNull(JsonNode node) {
    if (node == null || node.isNull() || !node.isTextual()) return null;
    String text = node.asText();
    return text.isBlank() ? null : text.trim();
  }

  public static String firstTextValue(JsonNode... candidates) {
    for (JsonNode candidate : candidates) {
      if (candidate == null || candidate.isNull() || candidate.isMissingNode()) continue;
      if (candidate.isArray()) {
        for (JsonNode value : candidate) {
          String text = textOrNull(value);
          if (text != null) return text;
        }
        continue;
      }
      String text = textOrNull(candidate);
      if (text != null) return text;
    }
    return null;
  }

  private static String normalizeCode(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim().toUpperCase(Locale.ROOT);
  }
}
