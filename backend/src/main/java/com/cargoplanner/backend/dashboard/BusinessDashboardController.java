package com.cargoplanner.backend.dashboard;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/business/dashboard")
public class BusinessDashboardController {
  private final BusinessDashboardService service;

  public BusinessDashboardController(BusinessDashboardService service) {
    this.service = service;
  }

  @GetMapping("/today-stats")
  public Map<String, Object> todayStats(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.todayStats(actor);
  }
}
