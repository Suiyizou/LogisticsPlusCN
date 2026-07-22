package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import com.cargoplanner.backend.customer.CustomerAuthInterceptor;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/customer")
public class CustomerShipmentFileController {
  private final ShipmentFileService fileService;
  private final ShipmentFileCommentService commentService;
  private final ShipmentTrackingService trackingService;

  public CustomerShipmentFileController(
      ShipmentFileService fileService,
      ShipmentFileCommentService commentService,
      ShipmentTrackingService trackingService
  ) {
    this.fileService = fileService;
    this.commentService = commentService;
    this.trackingService = trackingService;
  }

  @GetMapping("/shipments")
  public ObjectNode shipments(
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer
  ) {
    return trackingService.listAssignedSnapshots(customer);
  }

  @GetMapping("/shipments/{shipmentId}")
  public ObjectNode shipment(
      @PathVariable String shipmentId,
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer
  ) {
    return trackingService.readAssignedSnapshotByShipmentId(shipmentId, customer);
  }

  @GetMapping("/shipments/{shipmentId}/files")
  public Map<String, Object> list(
      @PathVariable String shipmentId,
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer
  ) {
    return fileService.listCustomer(shipmentId, customer);
  }

  @GetMapping("/shipments/{shipmentId}/file-comments")
  public Map<String, Object> listComments(
      @PathVariable String shipmentId,
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer
  ) {
    return commentService.listCustomer(shipmentId, customer);
  }

  @PostMapping("/shipments/{shipmentId}/file-comments")
  public Map<String, Object> createComment(
      @PathVariable String shipmentId,
      @RequestBody ShipmentFileCommentRequest request,
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer
  ) {
    return commentService.createCustomer(shipmentId, customer, request);
  }

  @PostMapping(
      value = "/shipments/{shipmentId}/files",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE
  )
  public Map<String, Object> upload(
      @PathVariable String shipmentId,
      @RequestParam(value = "files", required = false) List<MultipartFile> files,
      @RequestParam(value = "file", required = false) MultipartFile singleFile,
      @RequestParam(value = "category", defaultValue = "RELATED") String category,
      @RequestParam(value = "visibilityRoles", required = false) List<String> ignoredVisibilityRoles,
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer,
      HttpServletRequest request
  ) {
    List<MultipartFile> uploads = new ArrayList<>();
    if (files != null) uploads.addAll(files);
    if (singleFile != null) uploads.add(singleFile);
    uploads.removeIf(file -> file == null || file.isEmpty());
    if (uploads.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one shipment file is required");
    }
    List<Map<String, Object>> items = new ArrayList<>();
    for (MultipartFile upload : uploads) {
      ShipmentFileService.SavedShipmentFile saved = fileService.storeCustomer(
          upload, shipmentId, customer, category, ClientInfo.ip(request)
      );
      items.add(fileService.metadataCustomer(saved, customer));
    }
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", items);
    response.put("total", items.size());
    return response;
  }

  @GetMapping("/shipment-files/{fileId}/download")
  public ResponseEntity<Resource> download(
      @PathVariable String fileId,
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer,
      HttpServletRequest request
  ) {
    return ShipmentFileController.fileResponse(
        fileService.contentCustomer(fileId, customer, ClientInfo.ip(request))
    );
  }

  @GetMapping("/shipment-files/{fileId}/preview")
  public ResponseEntity<Resource> preview(
      @PathVariable String fileId,
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer,
      HttpServletRequest request
  ) {
    return ShipmentFileController.previewResponse(
        fileService.previewCustomer(fileId, customer, ClientInfo.ip(request))
    );
  }

  @PatchMapping("/shipment-files/{fileId}/visibility")
  public Map<String, Object> updateVisibility(
      @PathVariable String fileId,
      @RequestBody ShipmentFileVisibilityRequest visibility,
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer,
      HttpServletRequest request
  ) {
    return fileService.updateVisibilityRolesCustomer(
        fileId,
        visibility == null ? null : visibility.visibilityRoles(),
        customer,
        ClientInfo.ip(request)
    );
  }

  @DeleteMapping("/shipment-files/{fileId}")
  public Map<String, Object> delete(
      @PathVariable String fileId,
      @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE) CustomerPrincipal customer,
      HttpServletRequest request
  ) {
    fileService.deleteCustomer(fileId, customer, ClientInfo.ip(request));
    return Map.of("deleted", true, "id", fileId);
  }
}
