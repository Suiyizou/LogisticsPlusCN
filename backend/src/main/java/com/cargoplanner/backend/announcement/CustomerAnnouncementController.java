package com.cargoplanner.backend.announcement;

import com.cargoplanner.backend.customer.CustomerAuthInterceptor;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/customer/announcements")
public class CustomerAnnouncementController {
  private final AnnouncementService service;

  public CustomerAnnouncementController(AnnouncementService service) {
    this.service = service;
  }

  @GetMapping("/today")
  public Map<String, Object> today(
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer
  ) {
    return service.todayForCustomer(customer);
  }

  @PostMapping("/{id}/read")
  public Map<String, Object> markRead(
      @PathVariable long id,
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer
  ) {
    return service.markReadForCustomer(id, customer);
  }
}
