package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AdminAuthInterceptor;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/customer-handovers")
public class CustomerHandoverAdminController {
  private final BusinessCustomerService service;

  public CustomerHandoverAdminController(BusinessCustomerService service) {
    this.service = service;
  }

  @GetMapping
  public Map<String, Object> list(
      @RequestParam(required = false) String status,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser admin
  ) {
    return service.listCustomerHandoverRequests(status, page, size, admin);
  }

  @GetMapping("/{requestId}")
  public Map<String, Object> detail(
      @PathVariable String requestId,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser admin
  ) {
    return service.getCustomerHandoverRequest(requestId, admin);
  }
}
