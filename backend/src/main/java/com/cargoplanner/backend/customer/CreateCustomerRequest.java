package com.cargoplanner.backend.customer;

public record CreateCustomerRequest(
    String username,
    String password,
    String displayName,
    String partyRole,
    String clientCode
) {
  public CreateCustomerRequest(
      String username,
      String password,
      String displayName,
      String partyRole
  ) {
    this(username, password, displayName, partyRole, null);
  }
}
