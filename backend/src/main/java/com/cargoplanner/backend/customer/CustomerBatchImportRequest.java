package com.cargoplanner.backend.customer;

import java.util.List;

public record CustomerBatchImportRequest(
    String sourceFileName,
    List<CustomerBatchImportItem> items
) {}
