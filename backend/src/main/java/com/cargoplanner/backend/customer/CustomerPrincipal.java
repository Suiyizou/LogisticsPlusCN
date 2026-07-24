package com.cargoplanner.backend.customer;

public record CustomerPrincipal(
    long id,
    String publicId,
    String username,
    String displayName,
    String partyRole,
    String status,
    Long scopeCustomerId,
    String scopeCustomerPublicId,
    String scopeCustomerDisplayName,
    String scopeCustomerPartyRole
) {
  public CustomerPrincipal(
      long id,
      String publicId,
      String username,
      String displayName,
      String partyRole,
      String status
  ) {
    this(
        id,
        publicId,
        username,
        displayName,
        partyRole,
        status,
        "OVERSEA_AGENT".equalsIgnoreCase(partyRole) ? null : id,
        "OVERSEA_AGENT".equalsIgnoreCase(partyRole) ? null : publicId,
        "OVERSEA_AGENT".equalsIgnoreCase(partyRole) ? null : displayName,
        "OVERSEA_AGENT".equalsIgnoreCase(partyRole) ? null : partyRole
    );
  }

  public boolean isOverseaAgent() {
    return "OVERSEA_AGENT".equalsIgnoreCase(partyRole);
  }

  public boolean hasCustomerScope() {
    return scopeCustomerId != null;
  }
}
