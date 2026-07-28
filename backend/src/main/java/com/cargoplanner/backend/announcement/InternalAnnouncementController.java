package com.cargoplanner.backend.announcement;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/announcements")
public class InternalAnnouncementController {
  private final AnnouncementService service;

  public InternalAnnouncementController(AnnouncementService service) {
    this.service = service;
  }

  @GetMapping("/today")
  public Map<String, Object> today(
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.todayForEmployee(actor);
  }

  @PostMapping("/{id}/read")
  public Map<String, Object> markRead(
      @PathVariable long id,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor
  ) {
    return service.markReadForEmployee(id, actor);
  }
}
