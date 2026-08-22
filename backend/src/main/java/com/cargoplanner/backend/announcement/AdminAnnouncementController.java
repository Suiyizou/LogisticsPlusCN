package com.cargoplanner.backend.announcement;

import com.cargoplanner.backend.auth.AdminAuthInterceptor;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ClientInfo;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
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
@RequestMapping("/api/admin/announcements")
public class AdminAnnouncementController {
  private final AnnouncementService service;

  public AdminAnnouncementController(AnnouncementService service) {
    this.service = service;
  }

  @GetMapping
  public Map<String, Object> list(
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      @RequestParam(required = false) String status,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.listAdmin(actor, page, size, status);
  }

  @GetMapping("/{id}")
  public Map<String, Object> get(
      @PathVariable long id,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.getAdmin(id, actor);
  }

  @PostMapping
  public Map<String, Object> create(
      @RequestBody AnnouncementRequest request,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.create(request, actor, ClientInfo.ip(httpRequest));
  }

  @PatchMapping("/{id}")
  public Map<String, Object> update(
      @PathVariable long id,
      @RequestBody AnnouncementRequest request,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.update(id, request, actor, ClientInfo.ip(httpRequest));
  }

  @PostMapping("/{id}/publish")
  public Map<String, Object> publish(
      @PathVariable long id,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.publish(id, actor, ClientInfo.ip(httpRequest));
  }

  @PostMapping("/{id}/disable")
  public Map<String, Object> disable(
      @PathVariable long id,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.disable(id, actor, ClientInfo.ip(httpRequest));
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(
      @PathVariable long id,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return service.delete(id, actor, ClientInfo.ip(httpRequest));
  }
}
