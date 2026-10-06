package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * 客户/内部运营模块的权限守卫。
 *
 * <p>从 {@code BusinessCustomerService} 抽出的横切关注点，供客户、代理、交接等领域服务
 * 复用。此前的实现分散在一个 5000 行的 Service 里，导致任何领域拆分都会形成循环依赖。
 */
@Component
public class CustomerAccessGuard {

  public void requireOperationsReader(AuthenticatedUser actor) {
    if (actor == null || (!actor.isBusiness() && !actor.isAdmin() && !actor.isOverseaAgent())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Internal operations permission is required");
    }
  }

  public void requireManager(AuthenticatedUser actor) {
    if (actor == null || (!actor.isBusiness() && !actor.isAdmin())) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Business or administrator permission is required"
      );
    }
  }

  public void requireTransferManager(AuthenticatedUser actor) {
    if (actor == null || (!actor.isBusiness() && !actor.isAdmin() && !actor.isOverseaAgent())) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Business, administrator, or overseas agent permission is required"
      );
    }
  }

  public void requireAdministrator(AuthenticatedUser actor) {
    if (actor == null || !actor.isAdmin()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Administrator permission is required");
    }
  }
}
