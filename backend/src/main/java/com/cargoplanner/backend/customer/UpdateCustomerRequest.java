package com.cargoplanner.backend.customer;

public record UpdateCustomerRequest(
    String username,
    String displayName,
    String partyRole,
    String status,
    String clientCode
) {
  public UpdateCustomerRequest(
      String username,
      String displayName,
      String partyRole,
      String status
  ) {
    this(username, displayName, partyRole, status, null);
  }
}
