package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AdminAuthInterceptor;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ClientInfo;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/shipment-files")
public class AdminShipmentFileController {
  private final ShipmentFileService fileService;

  public AdminShipmentFileController(ShipmentFileService fileService) {
    this.fileService = fileService;
  }

  @GetMapping
  public Map<String, Object> list(
      @RequestParam(value = "shipmentId", required = false) String shipmentId,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "100") int size,
      @RequestParam(value = "includeDeleted", defaultValue = "false") boolean includeDeleted,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser admin
  ) {
    return fileService.listAll(shipmentId, page, size, includeDeleted, admin);
  }

  @GetMapping("/{fileId}/download")
  public ResponseEntity<Resource> download(
      @PathVariable String fileId,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser admin,
      HttpServletRequest request
  ) {
    return ShipmentFileController.fileResponse(
        fileService.content(fileId, admin, ClientInfo.ip(request))
    );
  }

  @DeleteMapping("/{fileId}")
  public Map<String, Object> delete(
      @PathVariable String fileId,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser admin,
      HttpServletRequest request
  ) {
    fileService.delete(fileId, admin, ClientInfo.ip(request));
    return Map.of("deleted", true, "id", fileId);
  }
}
