package com.cargoplanner.backend.admin;

import com.cargoplanner.backend.auth.AdminAuthInterceptor;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ClientInfo;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
  private final AdminService adminService;
  private final LlmSettingsService llmSettingsService;

  public AdminController(AdminService adminService, LlmSettingsService llmSettingsService) {
    this.adminService = adminService;
    this.llmSettingsService = llmSettingsService;
  }

  @GetMapping("/employees")
  public List<Map<String, Object>> employees() {
    return adminService.listEmployees();
  }

  @PostMapping("/employees")
  public Map<String, Object> createEmployee(
      @Valid @RequestBody CreateEmployeeRequest request,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser admin,
      HttpServletRequest httpRequest
  ) {
    return adminService.createEmployee(request, admin, ClientInfo.ip(httpRequest));
  }

  @PatchMapping("/employees/{id}")
  public Map<String, Object> updateEmployee(
      @PathVariable long id,
      @RequestBody UpdateEmployeeRequest request,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser admin,
      HttpServletRequest httpRequest
  ) {
    return adminService.updateEmployee(id, request, admin, ClientInfo.ip(httpRequest));
  }

  @PostMapping("/employees/{id}/reset-password")
  public Map<String, Object> resetEmployeePassword(
      @PathVariable long id,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser admin,
      HttpServletRequest httpRequest
  ) {
    return adminService.resetEmployeePassword(id, admin, ClientInfo.ip(httpRequest));
  }

  @DeleteMapping("/employees/{id}")
  public Map<String, Object> deleteEmployee(
      @PathVariable long id,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser admin,
      HttpServletRequest httpRequest
  ) {
    return adminService.deleteEmployee(id, admin, ClientInfo.ip(httpRequest));
  }

  @GetMapping("/devices")
  public List<Map<String, Object>> devices() {
    return adminService.listDevices();
  }

  @PostMapping("/devices/{id}/kick")
  public Map<String, Object> kickDevice(
      @PathVariable long id,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser admin,
      HttpServletRequest httpRequest
  ) {
    return adminService.kickDevice(id, admin, ClientInfo.ip(httpRequest));
  }

  @DeleteMapping("/devices/{id}")
  public Map<String, Object> deleteDevice(
      @PathVariable long id,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser admin,
      HttpServletRequest httpRequest
  ) {
    return adminService.deleteDevice(id, admin, ClientInfo.ip(httpRequest));
  }

  @GetMapping("/monitoring")
  public Map<String, Object> monitoring() {
    return adminService.monitoring();
  }

  @GetMapping("/settings/llm")
  public Map<String, Object> llmSettings() {
    return llmSettingsService.publicSettings();
  }

  @PatchMapping("/settings/llm")
  public Map<String, Object> updateLlmSettings(
      @RequestBody LlmSettingsRequest request,
      @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser admin,
      HttpServletRequest httpRequest
  ) {
    return llmSettingsService.updateSettings(request, admin, ClientInfo.ip(httpRequest));
  }
}
