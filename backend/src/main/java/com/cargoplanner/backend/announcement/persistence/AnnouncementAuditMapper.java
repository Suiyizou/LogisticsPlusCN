package com.cargoplanner.backend.announcement.persistence;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

/** Internal to the announcement repository; controllers must not inject this mapper. */
@Mapper
public interface AnnouncementAuditMapper extends BaseMapper<AnnouncementAuditEntity> {}
