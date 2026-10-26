package com.cargoplanner.backend.customer.dto;

import java.util.Map;

/** Explicit public profile; credential hashes and numeric customer primary keys never escape. */
public record CustomerProfileResponse(
    String id,
    String username,
    String displayName,
    String clientCode,
    String partyRole,
    String customerCodePrefix,
    String customerCodeMode,
    String provisioningSource,
    String status,
    String remark,
    String contactEmail,
    Long createdBy,
    String createdByDisplayName,
    long responsibleAgentId,
    String responsibleAgentDisplayName,
    String createdAt,
    String updatedAt,
    long shipmentCount,
    Long overseaAgentUserId,
    String overseaAgentUsername,
    String overseaAgentDisplayName,
    String customerCode
) {
  public static CustomerProfileResponse from(Map<String, Object> value) {
    return new CustomerProfileResponse(
        text(value, "id"),
        text(value, "username"),
        text(value, "displayName"),
        text(value, "clientCode"),
        text(value, "partyRole"),
        text(value, "customerCodePrefix"),
        text(value, "customerCodeMode"),
        text(value, "provisioningSource"),
        text(value, "status"),
        text(value, "remark"),
        text(value, "contactEmail"),
        number(value, "createdBy"),
        text(value, "createdByDisplayName"),
        number(value, "responsibleAgentId") == null ? 0L : number(value, "responsibleAgentId"),
        text(value, "responsibleAgentDisplayName"),
        text(value, "createdAt"),
        text(value, "updatedAt"),
        number(value, "shipmentCount") == null ? 0L : number(value, "shipmentCount"),
        number(value, "overseaAgentUserId"),
        text(value, "overseaAgentUsername"),
        text(value, "overseaAgentDisplayName"),
        text(value, "customerCode"));
  }

  private static String text(Map<String, Object> value, String key) {
    Object item = value.get(key);
    return item == null ? null : item.toString();
  }

  private static Long number(Map<String, Object> value, String key) {
    Object item = value.get(key);
    return item instanceof Number number ? number.longValue() : null;
  }
}
