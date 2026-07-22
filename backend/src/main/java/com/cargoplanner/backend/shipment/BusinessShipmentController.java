package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.customer.BusinessCustomerService;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/business/shipments")
public class BusinessShipmentController {
  private final BusinessCustomerService shipmentService;
  private final ShipmentBatchTrackingService batchTrackingService;

  public BusinessShipmentController(
      BusinessCustomerService shipmentService,
      ShipmentBatchTrackingService batchTrackingService
  ) {
    this.shipmentService = shipmentService;
    this.batchTrackingService = batchTrackingService;
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

  @PostMapping("/refresh-all")
  public ResponseEntity<Map<String, Object>> refreshAll(
      @RequestBody(required = false) ShipmentRefreshAllRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    List<ShipmentBatchItemRequest> items = shipmentService.listUnfinishedTrackingItems(actor);
    if (items.isEmpty()) {
      return ResponseEntity.ok(Map.of(
          "mode", "REFRESH_ALL",
          "status", "COMPLETED",
          "total", 0,
          "processed", 0,
          "succeeded", 0,
          "failed", 0,
          "manual", 0,
          "pending", 0,
          "items", List.of()
      ));
    }
    return ResponseEntity.accepted().body(batchTrackingService.startRefreshAll(
        items,
        actor,
        request == null ? null : request.channel()
    ));
  }

  @PostMapping("/batch-delete")
  public Map<String, Object> batchDelete(
      @RequestBody ShipmentBatchDeleteRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return shipmentService.deleteShipments(request, actor);
  }
}
