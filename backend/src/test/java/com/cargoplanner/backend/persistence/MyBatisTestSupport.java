package com.cargoplanner.backend.persistence;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import javax.sql.DataSource;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/** Real MyBatis-Plus SQL execution with the same pagination plugin and legacy XMLs. */
public final class MyBatisTestSupport {
  private MyBatisTestSupport() {}

  public static SqlSessionTemplate session(DataSource dataSource, Class<?>... mappers) {
    try {
      var configuration = new MybatisConfiguration();
      configuration.setMapUnderscoreToCamelCase(true);
      for (Class<?> mapper : mappers) configuration.addMapper(mapper);
      var factory = new MybatisSqlSessionFactoryBean();
      factory.setConfiguration(configuration);
      factory.setDataSource(dataSource);
      factory.setPlugins(new MyBatisPersistenceConfiguration().mybatisPlusInterceptor());
      factory.setMapperLocations(new PathMatchingResourcePatternResolver()
          .getResources("classpath*:mappers/**/*.xml"));
      return new SqlSessionTemplate(factory.getObject());
    } catch (Exception error) {
      throw new IllegalStateException("Cannot initialize MyBatis-Plus test mapper", error);
    }
  }
}
