package com.cargoplanner.backend.customer;

/** 票单归属与参考信息的只读投影，供绑定、创建、变更与客户端匹配共享。 */
public record ShipmentRecord(
    long id,
    String publicId,
    String carrier,
    Long responsibleAgentId
) {}
