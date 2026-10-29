package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ApiException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/business/shipment-batch-tasks")
public class ShipmentBatchTrackingController {
  private final ShipmentBatchTrackingService batchTrackingService;

  public ShipmentBatchTrackingController(ShipmentBatchTrackingService batchTrackingService) {
    this.batchTrackingService = batchTrackingService;
  }

  @PostMapping
  public ResponseEntity<Map<String, Object>> start(
      @RequestBody ShipmentBatchTaskRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    if (request == null || (!"QUERY_ONLY".equals(request.mode())
        && (request.customerId() == null || request.customerId().isBlank()))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Select a customer before batch tracking");
    }
    return ResponseEntity.accepted().body(batchTrackingService.start(request, user));
  }

  @GetMapping("/{taskId}")
  public Map<String, Object> status(
      @PathVariable String taskId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return batchTrackingService.status(taskId, user);
  }

  @PostMapping("/{taskId}/cancel")
  public ResponseEntity<Map<String, Object>> cancel(
      @PathVariable String taskId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return ResponseEntity.accepted().body(batchTrackingService.cancel(taskId, user));
  }
}
