package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ClientInfo;
import com.cargoplanner.backend.shipment.CmaTrackingSessionService.CmaSessionStatus;
import com.cargoplanner.backend.shipment.CmaTrackingSessionService.CmaSessionUpdateRequest;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tracking/cma-session")
public class CmaTrackingSessionController {
  private final CmaTrackingSessionService sessionService;

  public CmaTrackingSessionController(CmaTrackingSessionService sessionService) {
    this.sessionService = sessionService;
  }

  @GetMapping
  public CmaSessionStatus status(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return sessionService.status(actor);
  }

  @PatchMapping
  public CmaSessionStatus update(
      @RequestBody CmaSessionUpdateRequest request,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return sessionService.update(request, actor, ClientInfo.ip(httpRequest));
  }

  @DeleteMapping
  public CmaSessionStatus clear(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor,
      HttpServletRequest httpRequest
  ) {
    return sessionService.clear(actor, ClientInfo.ip(httpRequest));
  }
}
