package com.cargoplanner.backend.customer.dto;

/** 代理已关联客户行。assignedAt 使用 UTC ISO 字符串，保持原接口输出。 */
public record LinkedCustomerRow(
    String id,
    String username,
    String displayName,
    String clientCode,
    String partyRole,
    String status,
    String assignedAt
) {}
