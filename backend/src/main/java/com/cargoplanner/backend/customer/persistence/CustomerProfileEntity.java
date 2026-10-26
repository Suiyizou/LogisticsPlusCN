package com.cargoplanner.backend.customer.persistence;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

/** Persistence row; never serialize directly as an API response. */
@TableName("cp_customers")
public class CustomerProfileEntity {
  @TableId(type = IdType.AUTO)
  public Long id;
  public String publicId;
  public String username;
  public String displayName;
  public String clientCode;
  public String partyRole;
  public String passwordSalt;
  public String passwordHash;
  public Integer passwordIterations;
  public String customerCodeHash;
  public String customerCodePrefix;
  public String customerCodeMode;
  public String provisioningSource;
  public String status;
  public String remark;
  public String contactEmail;
  public Long createdBy;
  public Long responsibleAgentId;
}
