package com.cargoplanner.backend.customer;

public record CreateCustomerRequest(
    String username,
    String password,
    String displayName,
    String partyRole,
    String clientCode,
    String remark
) {
  public CreateCustomerRequest(
      String username,
      String password,
      String displayName,
      String partyRole
  ) {
    this(username, password, displayName, partyRole, null, null);
  }

  public CreateCustomerRequest(
      String username,
      String password,
      String displayName,
      String partyRole,
      String clientCode
  ) {
    this(username, password, displayName, partyRole, clientCode, null);
  }
}
