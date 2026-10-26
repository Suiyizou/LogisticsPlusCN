package com.cargoplanner.backend.announcement.persistence;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.time.LocalDate;

/** Persistence row; never serialize directly as an API response. */
@TableName("cp_announcements")
public class AnnouncementEntity {
  @TableId(type = IdType.AUTO)
  public Long id;
  public String title;
  public String contentMarkdown;
  public String imageUrl;
  public String illustrationRef;
  public String audience;
  public LocalDate displayDate;
  public String status;
  public Long createdBy;
  public Instant publishedAt;
  public Instant createdAt;
  public Instant updatedAt;
}
