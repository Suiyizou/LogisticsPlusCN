package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.customer.BusinessCustomerService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/business/shipments")
public class BusinessShipmentController {
  private final BusinessCustomerService shipmentService;

  public BusinessShipmentController(BusinessCustomerService shipmentService) {
    this.shipmentService = shipmentService;
  }

  @GetMapping
  public Map<String, Object> list(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return shipmentService.listShipmentSnapshots(actor);
  }

  @GetMapping("/{shipmentId}")
  public Map<String, Object> detail(
      @PathVariable String shipmentId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return shipmentService.getShipmentSnapshot(actor, shipmentId);
  }
}
