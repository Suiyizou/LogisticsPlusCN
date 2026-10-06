package com.cargoplanner.backend.customer.dto;

/** 单个代理详情（id 以字符串返回，兼容既有接口）。 */
public record OverseaAgentRow(
    String id,
    String username,
    String displayName,
    String status
) {}
