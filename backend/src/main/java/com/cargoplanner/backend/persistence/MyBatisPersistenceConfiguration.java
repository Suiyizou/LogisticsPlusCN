package com.cargoplanner.backend.persistence;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Shared SQL generation only: authorization and business transactions remain explicit. */
@Configuration
public class MyBatisPersistenceConfiguration {
  @Bean
  public MybatisPlusInterceptor mybatisPlusInterceptor() {
    var interceptor = new MybatisPlusInterceptor();
    var pagination = new PaginationInnerInterceptor(DbType.MYSQL);
    pagination.setOverflow(false);
    pagination.setMaxLimit(100L);
    interceptor.addInnerInterceptor(pagination);
    return interceptor;
  }
}
