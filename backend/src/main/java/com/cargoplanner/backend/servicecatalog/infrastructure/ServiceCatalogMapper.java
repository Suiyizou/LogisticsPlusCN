package com.cargoplanner.backend.servicecatalog.infrastructure;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

/** Persistence-private mapper. Controllers and other modules cannot inject it. */
@Mapper
public interface ServiceCatalogMapper extends BaseMapper<ServiceCatalogEntity> {}
