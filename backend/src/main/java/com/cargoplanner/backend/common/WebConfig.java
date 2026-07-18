package com.cargoplanner.backend.common;

import com.cargoplanner.backend.auth.AdminAuthInterceptor;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.customer.CustomerAuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
  private final AdminAuthInterceptor adminAuthInterceptor;
  private final UserAuthInterceptor userAuthInterceptor;
  private final CustomerAuthInterceptor customerAuthInterceptor;

  public WebConfig(
      AdminAuthInterceptor adminAuthInterceptor,
      UserAuthInterceptor userAuthInterceptor,
      CustomerAuthInterceptor customerAuthInterceptor
  ) {
    this.adminAuthInterceptor = adminAuthInterceptor;
    this.userAuthInterceptor = userAuthInterceptor;
    this.customerAuthInterceptor = customerAuthInterceptor;
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/api/**")
        .allowedOriginPatterns("*")
        .allowedMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS")
        .allowedHeaders("*")
        .exposedHeaders("X-Auth-Token", "X-Customer-Token");
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(userAuthInterceptor)
        .addPathPatterns("/api/**")
        .excludePathPatterns("/api/auth/login", "/api/public/**", "/api/customer/**");
    registry.addInterceptor(customerAuthInterceptor).addPathPatterns("/api/customer/**");
    registry.addInterceptor(adminAuthInterceptor).addPathPatterns("/api/admin/**");
  }
}
