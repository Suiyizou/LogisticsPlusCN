package com.cargoplanner.backend.auth;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.cargoplanner.backend.admin.ApiAuditInterceptor;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.RequestStats;
import com.cargoplanner.backend.common.WebConfig;
import com.cargoplanner.backend.customer.CustomerAuthInterceptor;
import com.cargoplanner.backend.customer.CustomerAuthService;
import com.cargoplanner.backend.customer.CustomerPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RestController;

/**
 * HTTP 层角色鉴权回归：使用真实 {@link WebConfig} 路径规则与真实拦截器，
 * 只把认证服务替换为桩，验证“成功 / 未登录 401 / 越权 403 / 预检放行 / 公开路径豁免”。
 */
@WebMvcTest(controllers = HttpAuthorizationRegressionTest.ProbeController.class)
@Import({
  WebConfig.class,
  UserAuthInterceptor.class,
  AdminAuthInterceptor.class,
  CustomerAuthInterceptor.class,
  ApiAuditInterceptor.class,
  RequestStats.class,
  HttpAuthorizationRegressionTest.ProbeController.class
})
class HttpAuthorizationRegressionTest {

  private static final AuthenticatedUser ADMIN =
      new AuthenticatedUser(1L, "admin", "Admin", "ADMIN", "ACTIVE");
  private static final AuthenticatedUser BUSINESS =
      new AuthenticatedUser(2L, "sales", "Sales", "BUSINESS", "ACTIVE");
  private static final AuthenticatedUser OVERSEA_AGENT =
      new AuthenticatedUser(3L, "agent", "Agent", "OVERSEA_AGENT", "ACTIVE");
  private static final CustomerPrincipal CUSTOMER =
      new CustomerPrincipal(9L, "cust-public", "cust", "Cust", "SHIPPER", "ACTIVE");

  @Autowired private MockMvc mockMvc;

  @MockitoBean private AuthService authService;
  @MockitoBean private CustomerAuthService customerAuthService;
  @MockitoBean private JdbcTemplate jdbcTemplate;

  @RestController
  static class ProbeController {
    @PostMapping("/api/auth/login")
    String login() {
      return "login";
    }

    @GetMapping("/api/public/ping")
    String ping() {
      return "public";
    }

    @GetMapping("/api/business/probe")
    String business(
        @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor) {
      return actor.role();
    }

    @GetMapping("/api/admin/probe")
    String admin(
        @RequestAttribute(AdminAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser actor) {
      return actor.role();
    }

    @GetMapping("/api/customer/probe")
    String customer(
        @RequestAttribute(CustomerAuthInterceptor.CURRENT_CUSTOMER_ATTRIBUTE)
            CustomerPrincipal principal) {
      return principal.username();
    }
  }

  @BeforeEach
  void stubAuthentication() {
    ApiException unauthorized = new ApiException(HttpStatus.UNAUTHORIZED, "Sign in required");
    // 用 doReturn/doThrow 而不是 when(...)，避免前面的 thenThrow 桩在后续桩调用时被触发。
    doThrow(unauthorized).when(authService).authenticate(isNull(), any());
    doReturn(ADMIN).when(authService).authenticate(eq("admin-token"), any());
    doReturn(BUSINESS).when(authService).authenticate(eq("business-token"), any());
    doReturn(OVERSEA_AGENT).when(authService).authenticate(eq("agent-token"), any());

    doThrow(unauthorized).when(customerAuthService).authenticate(isNull(), any());
    doReturn(CUSTOMER).when(customerAuthService).authenticate(eq("customer-token"), any());
  }

  @Test
  void loginAndPublicPathsAreNotBlockedByAuthentication() throws Exception {
    mockMvc.perform(post("/api/auth/login")).andExpect(status().isOk()).andExpect(content().string("login"));
    mockMvc.perform(get("/api/public/ping")).andExpect(status().isOk()).andExpect(content().string("public"));
  }

  @Test
  void internalEndpointsRequireAToken() throws Exception {
    mockMvc.perform(get("/api/business/probe")).andExpect(status().isUnauthorized());
    mockMvc.perform(get("/api/admin/probe")).andExpect(status().isUnauthorized());
  }

  @Test
  void businessTokenCanReachBusinessButNotAdmin() throws Exception {
    mockMvc.perform(get("/api/business/probe").header("X-Auth-Token", "business-token"))
        .andExpect(status().isOk())
        .andExpect(content().string("BUSINESS"));
    mockMvc.perform(get("/api/admin/probe").header("X-Auth-Token", "business-token"))
        .andExpect(status().isForbidden());
  }

  @Test
  void adminTokenCanReachAdmin() throws Exception {
    mockMvc.perform(get("/api/admin/probe").header("X-Auth-Token", "admin-token"))
        .andExpect(status().isOk())
        .andExpect(content().string("ADMIN"));
  }

  @Test
  void overseaAgentIsRejectedFromAdminAndAcceptedForInternalReads() throws Exception {
    mockMvc.perform(get("/api/admin/probe").header("X-Auth-Token", "agent-token"))
        .andExpect(status().isForbidden());
    mockMvc.perform(get("/api/business/probe").header("X-Auth-Token", "agent-token"))
        .andExpect(status().isOk())
        .andExpect(content().string("OVERSEA_AGENT"));
  }

  @Test
  void customerChannelUsesItsOwnToken() throws Exception {
    mockMvc.perform(get("/api/customer/probe")).andExpect(status().isUnauthorized());
    mockMvc.perform(get("/api/customer/probe").header("X-Customer-Token", "customer-token"))
        .andExpect(status().isOk())
        .andExpect(content().string("cust"));
    // 内部 token 不能访问客户通道，客户 token 也不能访问内部通道。
    mockMvc.perform(get("/api/customer/probe").header("X-Auth-Token", "admin-token"))
        .andExpect(status().isUnauthorized());
    mockMvc.perform(get("/api/business/probe").header("X-Customer-Token", "customer-token"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void corsPreflightBypassesAuthentication() throws Exception {
    mockMvc.perform(options("/api/business/probe")).andExpect(status().isOk());
    mockMvc.perform(options("/api/admin/probe")).andExpect(status().isOk());
  }
}
