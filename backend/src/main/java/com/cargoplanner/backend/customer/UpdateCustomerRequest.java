package com.cargoplanner.backend.customer;

public record UpdateCustomerRequest(
    String username,
    String displayName,
    String partyRole,
    String status,
    String clientCode,
    String remark,
    String contactEmail
) {
  public UpdateCustomerRequest(String username, String displayName, String partyRole,
      String status, String clientCode, String remark) {
    this(username, displayName, partyRole, status, clientCode, remark, null);
  }

  public UpdateCustomerRequest(
      String username,
      String displayName,
      String partyRole,
      String status
  ) {
    this(username, displayName, partyRole, status, null, null, null);
  }

  public UpdateCustomerRequest(
      String username,
      String displayName,
      String partyRole,
      String status,
      String clientCode
  ) {
    this(username, displayName, partyRole, status, clientCode, null, null);
  }
}
