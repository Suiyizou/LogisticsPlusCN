package com.cargoplanner.backend.customer;

public record CustomerBatchImportItem(
    Integer rowNumber,
    String username,
    String password,
    String displayName,
    String clientCode,
    String partyRole,
    String remark
) {}
