package com.cargoplanner.backend.announcement.persistence;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

/** Persistence row; never serialize directly as an API response. */
@TableName("cp_admin_audit_log")
public class AnnouncementAuditEntity {
  @TableId(type = IdType.AUTO)
  public Long id;
  public Long adminUserId;
  public String action;
  public String targetType;
  public Long targetId;
  public String detail;
  public String ipAddress;
}
