package com.cargoplanner.backend.customer.dto;

/** 交接目标业务员行。 */
public record BusinessAgentListRow(
    long id,
    String username,
    String displayName,
    String status,
    long customerCount
) {}
