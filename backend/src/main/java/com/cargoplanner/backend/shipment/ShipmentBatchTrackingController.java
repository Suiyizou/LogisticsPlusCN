package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ApiException;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/business/shipment-batch-tasks")
public class ShipmentBatchTrackingController {
  private final ShipmentBatchTrackingService batchTrackingService;
  private final PublishedShipmentTaskService publishedTasks;

  @Autowired
  public ShipmentBatchTrackingController(ShipmentBatchTrackingService batchTrackingService,
      PublishedShipmentTaskService publishedTasks) {
    this.batchTrackingService = batchTrackingService;
    this.publishedTasks = publishedTasks;
  }

  @PostMapping("/drafts")
  public ResponseEntity<Map<String, Object>> createDraft(
      @RequestBody ShipmentBatchDraftRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return ResponseEntity.status(HttpStatus.CREATED).body(publishedTasks.create(request, user));
  }

  @PatchMapping("/{taskId}/draft")
  public Map<String, Object> updateDraft(
      @PathVariable String taskId,
      @RequestBody ShipmentBatchDraftRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return publishedTasks.update(taskId, request, user);
  }

  @PostMapping("/{taskId}/publish")
  public ResponseEntity<Map<String, Object>> publish(
      @PathVariable String taskId,
      @RequestBody PublishRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return ResponseEntity.accepted().body(publishedTasks.publish(taskId, request.expectedRevision(), user));
  }

  @GetMapping
  public List<Map<String, Object>> list(
      @RequestParam(defaultValue = "20") int limit,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return publishedTasks.list(user, limit);
  }

  @GetMapping("/management")
  public List<Map<String, Object>> management(
      @RequestParam(defaultValue = "20") int limit,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return publishedTasks.management(user, limit);
  }

  @PostMapping("/{taskId}/retry")
  public ResponseEntity<Map<String, Object>> retry(
      @PathVariable String taskId,
      @RequestBody(required = false) RetryRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return ResponseEntity.accepted().body(publishedTasks.retry(taskId, request == null ? null : request.rowNumbers(), user));
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
    return PublishedShipmentTaskService.isPublishedTaskId(taskId)
        ? publishedTasks.status(taskId, user) : batchTrackingService.status(taskId, user);
  }

  @DeleteMapping("/{taskId}")
  public ResponseEntity<Void> delete(
      @PathVariable String taskId,
      @RequestParam(required = false) Integer expectedRevision,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    publishedTasks.delete(taskId, expectedRevision, user);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{taskId}/cancel")
  public ResponseEntity<Map<String, Object>> cancel(
      @PathVariable String taskId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    return ResponseEntity.accepted().body(PublishedShipmentTaskService.isPublishedTaskId(taskId)
        ? publishedTasks.cancel(taskId, user) : batchTrackingService.cancel(taskId, user));
  }

  public record PublishRequest(Integer expectedRevision) {}

  public record RetryRequest(List<Integer> rowNumbers) {}
}
