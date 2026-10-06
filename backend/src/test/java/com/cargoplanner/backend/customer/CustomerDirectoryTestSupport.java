package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.customer.persistence.CustomerDirectoryMapper;
import com.cargoplanner.backend.customer.persistence.OverseaAgentMapper;
import javax.sql.DataSource;
import org.apache.ibatis.plugin.Interceptor;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.ClassPathResource;

/**
 * 客户域 Mapper 的测试夹具：用 H2 数据源手工搭建 SqlSessionFactory，避免启动完整
 * Spring 上下文。新增 Mapper 时在这里补一个工厂方法。
 */
final class CustomerDirectoryTestSupport {
  private CustomerDirectoryTestSupport() {}

  static CustomerDirectoryMapper mapper(DataSource dataSource, Interceptor... interceptors) {
    return sessionTemplate(dataSource, "mappers/customer/CustomerDirectoryMapper.xml", interceptors)
        .getMapper(CustomerDirectoryMapper.class);
  }

  static OverseaAgentMapper overseaAgentMapper(DataSource dataSource) {
    return sessionTemplate(dataSource, "mappers/customer/OverseaAgentMapper.xml")
        .getMapper(OverseaAgentMapper.class);
  }

  private static SqlSessionTemplate sessionTemplate(
      DataSource dataSource, String mapperLocation, Interceptor... interceptors) {
    try {
      SqlSessionFactoryBean factory = new SqlSessionFactoryBean();
      factory.setDataSource(dataSource);
      factory.setMapperLocations(new ClassPathResource(mapperLocation));
      factory.setPlugins(interceptors);
      return new SqlSessionTemplate(factory.getObject());
    } catch (Exception error) {
      throw new IllegalStateException("Cannot initialize customer test mapper", error);
    }
  }
}
