package com.cargoplanner.backend.auth;

public record AuthenticatedUser(
    long id,
    String username,
    String displayName,
    String role,
    String status,
    String partyRole
) {
  public AuthenticatedUser(
      long id,
      String username,
      String displayName,
      String role,
      String status
  ) {
    this(id, username, displayName, role, status, "AGENT");
  }

  public boolean isAdmin() {
    return "ADMIN".equals(role);
  }

  public boolean isBusiness() {
    return "BUSINESS".equals(role);
  }

  public boolean isOverseaAgent() {
    return "OVERSEA_AGENT".equals(role);
  }

  public boolean canManageShipmentFiles() {
    return isAdmin() || isBusiness();
  }
}
