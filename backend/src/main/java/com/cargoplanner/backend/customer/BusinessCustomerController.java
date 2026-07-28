package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ClientInfo;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/business/customers")
public class BusinessCustomerController {
  private final BusinessCustomerService service;

  public BusinessCustomerController(BusinessCustomerService service) {
    this.service = service;
  }

  @GetMapping
  public Map<String, Object> list(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.list(actor);
  }

  @GetMapping("/available-shipments")
  public Map<String, Object> availableShipments(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.listAvailableShipments(actor);
  }

  @GetMapping("/transfer-agents")
  public Map<String, Object> transferAgents(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.listTransferAgents(actor);
  }

  @PostMapping("/oversea-agents")
  public Map<String, Object> createOverseaAgent(
      @Valid @RequestBody CreateOverseaAgentEmployeeRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.createOverseaAgentEmployee(request, actor, ClientInfo.ip(httpRequest));
  }

  @PostMapping("/oversea-agents/batch")
  public Map<String, Object> batchCreateOverseaAgents(
      @Valid @RequestBody OverseaAgentBatchCreateRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.batchCreateOverseaAgentEmployees(
        request, actor, ClientInfo.ip(httpRequest)
    );
  }

  @PatchMapping("/oversea-agents/{userId}")
  public Map<String, Object> updateOverseaAgent(
      @PathVariable long userId,
      @RequestBody UpdateOverseaAgentRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.updateOverseaAgent(userId, request, actor, ClientInfo.ip(httpRequest));
  }

  @DeleteMapping("/oversea-agents/{userId}")
  public Map<String, Object> deleteOverseaAgent(
      @PathVariable long userId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.disableOverseaAgent(userId, actor, ClientInfo.ip(httpRequest));
  }

  @PostMapping("/transfer")
  public Map<String, Object> transfer(
      @RequestBody CustomerTransferRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.transferCustomers(request, actor, ClientInfo.ip(httpRequest));
  }

  @GetMapping("/shipments/{shipmentId}/snapshot")
  public Map<String, Object> shipmentSnapshot(
      @PathVariable String shipmentId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.getShipmentSnapshot(actor, shipmentId);
  }

  @GetMapping("/pending-client-matches")
  public Map<String, Object> pendingClientMatches(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.listPendingClientMatches(actor);
  }

  @PostMapping("/pending-client-matches/{matchId}/resolve")
  public Map<String, Object> resolveClientMatch(
      @PathVariable long matchId,
      @RequestBody ResolveClientMatchRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.resolveClientMatch(matchId, request, actor, ClientInfo.ip(httpRequest));
  }

  @PatchMapping("/shipments/{shipmentId}/note")
  public Map<String, Object> updateShipmentNote(
      @PathVariable String shipmentId,
      @RequestBody UpdateShipmentNoteRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.updateShipmentNote(
        shipmentId,
        request == null ? null : request.note(),
        actor,
        ClientInfo.ip(httpRequest)
    );
  }

  @PostMapping("/shipments")
  public Map<String, Object> createShipment(
      @RequestBody AssignedBusinessShipmentRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.createAssignedShipment(request, actor, ClientInfo.ip(httpRequest));
  }

  @PatchMapping("/shipments/{shipmentId}")
  public Map<String, Object> updateShipment(
      @PathVariable String shipmentId,
      @RequestBody UpdateBusinessShipmentRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.updateShipment(shipmentId, request, actor, ClientInfo.ip(httpRequest));
  }

  @PostMapping("/shipments/{shipmentId}/manual-snapshot")
  public Map<String, Object> updateManualSnapshot(
      @PathVariable String shipmentId,
      @RequestBody CreateBusinessShipmentRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.updateManualSnapshot(shipmentId, request, actor, ClientInfo.ip(httpRequest));
  }

  @PatchMapping("/shipments/batch-business-fields")
  public Map<String, Object> updateShipmentBusinessFields(
      @RequestBody ShipmentBusinessFieldsBatchUpdateRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.updateShipmentBusinessFields(
        request, actor, ClientInfo.ip(httpRequest)
    );
  }

  @PostMapping("/shipments/{shipmentId}/invalidate-snapshot")
  public Map<String, Object> invalidateSnapshot(
      @PathVariable String shipmentId,
      @RequestBody SnapshotInvalidationRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.invalidateCurrentSnapshot(shipmentId, request, actor, ClientInfo.ip(httpRequest));
  }

  @DeleteMapping("/shipments/{shipmentId}")
  public Map<String, Object> deleteShipment(
      @PathVariable String shipmentId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.deleteShipment(shipmentId, actor, ClientInfo.ip(httpRequest));
  }

  @PostMapping
  public Map<String, Object> create(
      @RequestBody CreateCustomerRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.create(request, actor, ClientInfo.ip(httpRequest));
  }

  @PostMapping("/batch")
  public Map<String, Object> batchCreate(
      @RequestBody CustomerBatchImportRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.batchCreate(request, actor, ClientInfo.ip(httpRequest));
  }

  @GetMapping("/{customerId}")
  public Map<String, Object> get(
      @PathVariable String customerId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.get(customerId, actor);
  }

  @PatchMapping("/{customerId}")
  public Map<String, Object> update(
      @PathVariable String customerId,
      @RequestBody UpdateCustomerRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.update(customerId, request, actor, ClientInfo.ip(httpRequest));
  }

  @DeleteMapping("/{customerId}")
  public Map<String, Object> disable(
      @PathVariable String customerId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.disable(customerId, actor, ClientInfo.ip(httpRequest));
  }

  @PostMapping("/{customerId}/reset-code")
  public Map<String, Object> resetCode(
      @PathVariable String customerId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.resetCode(customerId, actor, ClientInfo.ip(httpRequest));
  }

  @PostMapping("/{customerId}/reset-password")
  public Map<String, Object> resetPassword(
      @PathVariable String customerId,
      @RequestBody UpdateCustomerPasswordRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.resetPassword(customerId, request, actor, ClientInfo.ip(httpRequest));
  }

  @GetMapping("/{customerId}/linked-customers")
  public Map<String, Object> linkedCustomers(
      @PathVariable String customerId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.listOverseaAgentCustomers(customerId, actor);
  }

  @PutMapping("/{customerId}/linked-customers")
  public Map<String, Object> updateLinkedCustomers(
      @PathVariable String customerId,
      @RequestBody OverseaAgentCustomerLinksRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.updateOverseaAgentCustomers(
        customerId, request, actor, ClientInfo.ip(httpRequest)
    );
  }

  @GetMapping("/{customerId}/shipments")
  public Map<String, Object> shipments(
      @PathVariable String customerId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.listShipments(customerId, actor);
  }

  @PostMapping("/{customerId}/shipments")
  public Map<String, Object> bindShipment(
      @PathVariable String customerId,
      @RequestBody CustomerShipmentBindingRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.bindShipment(customerId, request, actor, ClientInfo.ip(httpRequest));
  }

  @PostMapping("/{customerId}/shipments/batch")
  public Map<String, Object> bindShipments(
      @PathVariable String customerId,
      @RequestBody CustomerShipmentBatchBindingRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.bindShipments(customerId, request, actor, ClientInfo.ip(httpRequest));
  }

  @DeleteMapping("/{customerId}/shipments/{shipmentId}")
  public Map<String, Object> unbindShipment(
      @PathVariable String customerId,
      @PathVariable String shipmentId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.unbindShipment(customerId, shipmentId, actor, ClientInfo.ip(httpRequest));
  }

  @PatchMapping("/{customerId}/shipments/{shipmentId}/publication")
  public Map<String, Object> setShipmentPublication(
      @PathVariable String customerId,
      @PathVariable String shipmentId,
      @RequestBody ShipmentPublicationRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.setShipmentPublication(
        customerId, shipmentId, request, actor, ClientInfo.ip(httpRequest)
    );
  }
}
