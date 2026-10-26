package com.cargoplanner.backend.servicecatalog.api;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ClientInfo;
import com.cargoplanner.backend.servicecatalog.application.ServiceCatalogApplicationService;
import com.cargoplanner.backend.platform.PageRequest;
import com.cargoplanner.backend.platform.PageResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/business/service-catalog")
public class ServiceCatalogController {
  private final ServiceCatalogApplicationService service;

  public ServiceCatalogController(ServiceCatalogApplicationService service) {
    this.service = service;
  }

  @GetMapping
  public PageResult<ServiceCatalogResponse> list(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int pageSize,
      @RequestParam(defaultValue = "") String query) {
    return service.list(actor, new PageRequest(page, pageSize), query);
  }

  @GetMapping("/{id}")
  public ServiceCatalogResponse get(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      @PathVariable String id) {
    return service.get(actor, id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public ServiceCatalogResponse create(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      @Valid @RequestBody ServiceCatalogWrite values, HttpServletRequest request) {
    return service.create(actor, values, ClientInfo.ip(request));
  }

  @PatchMapping("/{id}")
  public ServiceCatalogResponse replace(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      @PathVariable String id, @Valid @RequestBody ServiceCatalogUpdate values, HttpServletRequest request) {
    return service.replace(actor, id, values, ClientInfo.ip(request));
  }
}
