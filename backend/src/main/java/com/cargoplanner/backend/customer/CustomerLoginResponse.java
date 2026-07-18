package com.cargoplanner.backend.customer;

public record CustomerLoginResponse(
    String token,
    String expiresAt,
    CustomerView customer
) {
  public record CustomerView(
      String id,
      String username,
      String displayName,
      String partyRole,
      String status
  ) {}
}
