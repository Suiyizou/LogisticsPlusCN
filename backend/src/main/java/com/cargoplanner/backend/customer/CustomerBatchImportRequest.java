package com.cargoplanner.backend.customer;

import java.util.List;

public record CustomerBatchImportRequest(
    String customerCodeMode,
    String sourceFileName,
    List<CustomerBatchImportItem> items
) {}
