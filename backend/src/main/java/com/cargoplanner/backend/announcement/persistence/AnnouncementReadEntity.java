package com.cargoplanner.backend.announcement.persistence;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;

/** Persistence row; never serialize directly as an API response. */
@TableName("cp_announcement_reads")
public class AnnouncementReadEntity {
  public Long announcementId;
  public String readerType;
  public Long readerId;
  public Instant readAt;
}
