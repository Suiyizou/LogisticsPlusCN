package com.cargoplanner.backend.customer.dto;

/** Public customer-directory fields, without credentials or internal customer ids. */
public record CustomerDirectoryItem(
    String id,
    String username,
    String displayName,
    String clientCode,
    String partyRole,
    String customerCodePrefix,
    String customerCodeMode,
    String provisioningSource,
    String status,
    String remark,
    String contactEmail,
    Long createdBy,
    String createdByDisplayName,
    long responsibleAgentId,
    String responsibleAgentDisplayName,
    String createdAt,
    String updatedAt,
    long shipmentCount,
    Long overseaAgentUserId,
    String overseaAgentUsername,
    String overseaAgentDisplayName
) {}
