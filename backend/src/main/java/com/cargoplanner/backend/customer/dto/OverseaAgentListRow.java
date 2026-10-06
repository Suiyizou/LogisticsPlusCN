package com.cargoplanner.backend.customer.dto;

/** 代理列表行（可用代理/转移代理）。id 保持字符串输出以兼容既有接口。 */
public record OverseaAgentListRow(
    long numericId,
    String username,
    String displayName,
    String status,
    long linkedCustomerCount
) {}
