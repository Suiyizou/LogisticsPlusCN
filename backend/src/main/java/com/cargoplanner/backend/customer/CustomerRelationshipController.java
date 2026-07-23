package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ClientInfo;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/business/customer-relationships")
public class CustomerRelationshipController {
  private final CustomerRelationshipService service;

  public CustomerRelationshipController(CustomerRelationshipService service) {
    this.service = service;
  }

  @GetMapping
  public Map<String, Object> list(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.listRelationships(actor);
  }

  @GetMapping("/handover-requests")
  public Map<String, Object> handoverRequests(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.listHandoverRequests(actor);
  }

  @PostMapping("/handover-requests")
  public Map<String, Object> createHandoverRequest(
      @RequestBody CustomerHandoverCreateRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.createHandoverRequest(request, actor, ClientInfo.ip(httpRequest));
  }

  @PostMapping("/handover-requests/{requestId}/decision")
  public Map<String, Object> decideHandoverRequest(
      @PathVariable String requestId,
      @RequestBody CustomerHandoverDecisionRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.decideHandoverRequest(
        requestId, request, actor, ClientInfo.ip(httpRequest)
    );
  }
}
