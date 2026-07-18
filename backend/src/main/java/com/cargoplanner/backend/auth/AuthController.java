package com.cargoplanner.backend.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthService authService;

  public AuthController(AuthService authService) {
    this.authService = authService;
  }

  @PostMapping("/login")
  public LoginResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
    return authService.login(request, httpRequest);
  }

  @GetMapping("/me")
  public AuthenticatedUser me(
      @RequestHeader(value = "X-Auth-Token", required = false) String token,
      HttpServletRequest request
  ) {
    return authService.authenticate(token, request);
  }

  @PostMapping("/logout")
  public Map<String, Object> logout(
      @RequestHeader(value = "X-Auth-Token", required = false) String token,
      HttpServletRequest request
  ) {
    authService.logout(token, request);
    return Map.of("ok", true);
  }
}
