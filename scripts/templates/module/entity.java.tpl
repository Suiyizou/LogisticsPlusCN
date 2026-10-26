package com.cargoplanner.backend.__PACKAGE__.infrastructure;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;

/** Generated persistence mapping. Public APIs use explicit response records. */
@TableName("__TABLE__")
public class __NAME__Entity {
  @TableId(type = IdType.AUTO)
  private Long id;
  private String publicId;
  private Long version;
  private Long createdBy;
  private Long updatedBy;
  private Instant createdAt;
  private Instant updatedAt;
__ENTITY_FIELDS__
__ACCESSORS__
}
