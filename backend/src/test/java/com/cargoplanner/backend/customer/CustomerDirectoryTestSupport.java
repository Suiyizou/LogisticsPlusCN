package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.customer.persistence.CustomerDirectoryMapper;
import javax.sql.DataSource;
import org.apache.ibatis.plugin.Interceptor;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.ClassPathResource;

final class CustomerDirectoryTestSupport {
  private CustomerDirectoryTestSupport() {}

  static CustomerDirectoryMapper mapper(DataSource dataSource, Interceptor... interceptors) {
    try {
      SqlSessionFactoryBean factory = new SqlSessionFactoryBean();
      factory.setDataSource(dataSource);
      factory.setMapperLocations(new ClassPathResource("mappers/customer/CustomerDirectoryMapper.xml"));
      factory.setPlugins(interceptors);
      return new SqlSessionTemplate(factory.getObject()).getMapper(CustomerDirectoryMapper.class);
    } catch (Exception error) {
      throw new IllegalStateException("Cannot initialize customer-directory test mapper", error);
    }
  }
}
