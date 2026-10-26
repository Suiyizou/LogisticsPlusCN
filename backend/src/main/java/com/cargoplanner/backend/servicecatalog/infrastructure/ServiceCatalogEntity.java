package com.cargoplanner.backend.servicecatalog.infrastructure;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;

/** Generated persistence mapping. Public APIs use explicit response records. */
@TableName("cp_service_catalog")
public class ServiceCatalogEntity {
  @TableId(type = IdType.AUTO)
  private Long id;
  private String publicId;
  private Long version;
  private Long createdBy;
  private Long updatedBy;
  private Instant createdAt;
  private Instant updatedAt;
  private String code;
  private String name;
  private String description;
  private Boolean enabled;
  public Long getId() { return id; }
  public void setId(Long value) { id = value; }
  public String getPublicId() { return publicId; }
  public void setPublicId(String value) { publicId = value; }
  public Long getVersion() { return version; }
  public void setVersion(Long value) { version = value; }
  public Long getCreatedBy() { return createdBy; }
  public void setCreatedBy(Long value) { createdBy = value; }
  public Long getUpdatedBy() { return updatedBy; }
  public void setUpdatedBy(Long value) { updatedBy = value; }
  public Instant getCreatedAt() { return createdAt; }
  public void setCreatedAt(Instant value) { createdAt = value; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(Instant value) { updatedAt = value; }
  public String getCode() { return code; }
  public void setCode(String value) { code = value; }
  public String getName() { return name; }
  public void setName(String value) { name = value; }
  public String getDescription() { return description; }
  public void setDescription(String value) { description = value; }
  public Boolean getEnabled() { return enabled; }
  public void setEnabled(Boolean value) { enabled = value; }
}
