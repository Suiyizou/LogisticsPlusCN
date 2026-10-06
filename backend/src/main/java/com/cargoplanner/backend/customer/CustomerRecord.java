package com.cargoplanner.backend.customer;

/**
 * 客户档案的只读投影，供客户、交接、绑定、票单查询等领域服务共享。
 *
 * <p>从 {@code BusinessCustomerService} 的内部 record 提升为包级类型，避免每个领域服务
 * 重复定义，也便于 Mapper 直接映射。
 */
public record CustomerRecord(
    long id,
    String publicId,
    String username,
    String displayName,
    String clientCode,
    String partyRole,
    String codePrefix,
    String customerCodeMode,
    String provisioningSource,
    String status,
    String remark,
    Long createdBy,
    String createdByDisplayName,
    long responsibleAgentId,
    String responsibleAgentDisplayName,
    String createdAt,
    String updatedAt,
    long shipmentCount
) {}
