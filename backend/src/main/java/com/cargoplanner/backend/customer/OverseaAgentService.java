package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.auth.PasswordHasher.PasswordHash;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.dto.OverseaAgentRow;
import com.cargoplanner.backend.customer.persistence.OverseaAgentMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 海外代理账号与代理范围同步。
 *
 * <p>从 {@code BusinessCustomerService} 拆出的代理领域服务：账号创建/编辑/重置/删除、
 * 可用代理列表，以及客户-代理-票单范围同步。SQL 统一由 {@link OverseaAgentMapper} 管理。
 *
 * <p>事务边界与原实现保持一致：
 *
 * <ul>
 *   <li>{@code batchCreateOverseaAgentEmployees} 与 {@code createOverseaAgentEmployee}
 *       同处一个 Bean，批量为整体事务（自调用不开新事务，语义不变）。
 *   <li>{@code sync*} 不单独开启事务，加入调用方（客户建档/绑定）的事务。
 * </ul>
 */
@Service
public class OverseaAgentService {
  private final OverseaAgentMapper mapper;
  private final PasswordHasher passwordHasher;
  private final CustomerAccessGuard accessGuard;
  private final CustomerInputRules inputRules;
  private final CustomerAuditService auditService;

  public OverseaAgentService(
      OverseaAgentMapper mapper,
      PasswordHasher passwordHasher,
      CustomerAccessGuard accessGuard,
      CustomerInputRules inputRules,
      CustomerAuditService auditService
  ) {
    this.mapper = mapper;
    this.passwordHasher = passwordHasher;
    this.accessGuard = accessGuard;
    this.inputRules = inputRules;
    this.auditService = auditService;
  }

  public Map<String, Object> listTransferAgents(AuthenticatedUser actor) {
    accessGuard.requireTransferManager(actor);
    List<Map<String, Object>> agents = new ArrayList<>();
    for (var row : mapper.findTransferAgents()) {
      Map<String, Object> value = new LinkedHashMap<>();
      value.put("id", String.valueOf(row.numericId()));
      value.put("username", row.username());
      value.put("displayName", row.displayName());
      value.put("status", row.status());
      value.put("linkedCustomerCount", row.linkedCustomerCount());
      agents.add(value);
    }
    return Map.of("items", agents, "total", agents.size());
  }

  public Map<String, Object> listBusinessHandoverAgents(AuthenticatedUser actor) {
    accessGuard.requireManager(actor);
    List<Map<String, Object>> agents = new ArrayList<>();
    for (var row : mapper.findBusinessHandoverAgents()) {
      Map<String, Object> value = new LinkedHashMap<>();
      value.put("id", row.id());
      value.put("username", row.username());
      value.put("displayName", row.displayName());
      value.put("status", row.status());
      value.put("customerCount", row.customerCount());
      value.put("current", row.id() == actor.id());
      agents.add(value);
    }
    return Map.of("items", agents, "total", agents.size(), "currentUserId", actor.id());
  }

  @Transactional
  public Map<String, Object> createOverseaAgentEmployee(
      CreateOverseaAgentEmployeeRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    String username = inputRules.normalizeUsername(request == null ? null : request.username());
    String displayName =
        inputRules.normalizeDisplayName(request == null ? null : request.displayName());
    String password = request == null ? null : request.password();
    inputRules.validateInternalPassword(password);
    PasswordHash passwordHash = passwordHasher.hash(password);
    try {
      mapper.insertAgent(
          username,
          displayName,
          passwordHash.salt(),
          passwordHash.hash(),
          passwordHash.iterations(),
          actor.id());
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Overseas agent username already exists");
    }
    Long userId = mapper.findIdByUsername(username);
    auditService.record(
        actor,
        "CREATE_OVERSEA_AGENT",
        "USER",
        userId,
        "Created internal overseas agent " + username,
        ipAddress);
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("id", userId);
    response.put("username", username);
    response.put("displayName", displayName);
    response.put("role", "OVERSEA_AGENT");
    response.put("partyRole", "AGENT");
    response.put("status", "ACTIVE");
    return response;
  }

  @Transactional
  public Map<String, Object> batchCreateOverseaAgentEmployees(
      OverseaAgentBatchCreateRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    List<CreateOverseaAgentEmployeeRequest> requests =
        request == null || request.items() == null ? List.of() : request.items();
    if (requests.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one overseas agent is required");
    }
    if (requests.size() > 200) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "At most 200 overseas agents can be created at once");
    }
    List<Map<String, Object>> items = new ArrayList<>(requests.size());
    for (CreateOverseaAgentEmployeeRequest item : requests) {
      items.add(createOverseaAgentEmployee(item, actor, ipAddress));
    }
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", items);
    response.put("total", items.size());
    response.put("atomic", true);
    return response;
  }

  @Transactional
  public Map<String, Object> updateOverseaAgent(
      long userId,
      UpdateOverseaAgentRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    Map<String, Object> existing = requireOverseaAgent(userId);
    String displayName =
        request == null || request.displayName() == null
            ? String.valueOf(existing.get("displayName"))
            : inputRules.normalizeDisplayName(request.displayName());
    String status =
        request == null || request.status() == null || request.status().isBlank()
            ? String.valueOf(existing.get("status"))
            : request.status().trim().toUpperCase(Locale.ROOT);
    if (!List.of("ACTIVE", "DISABLED").contains(status)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Status must be ACTIVE or DISABLED");
    }
    String password = request == null ? null : request.password();
    if (password != null && !password.isBlank()) {
      inputRules.validateInternalPassword(password);
      PasswordHash hash = passwordHasher.hash(password);
      mapper.updateAgentWithPassword(
          userId, displayName, status, hash.salt(), hash.hash(), hash.iterations());
      mapper.deleteLoginDevices(userId);
    } else {
      mapper.updateAgentProfile(userId, displayName, status);
      if ("DISABLED".equals(status)) {
        mapper.deleteLoginDevices(userId);
      }
    }
    auditService.customer(
        actor,
        "UPDATE_OVERSEA_AGENT",
        userId,
        "Updated overseas agent " + existing.get("username") + " (" + status + ")",
        ipAddress);
    return requireOverseaAgent(userId);
  }

  @Transactional
  public Map<String, Object> resetOverseaAgentPassword(
      long userId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    Map<String, Object> existing = requireOverseaAgent(userId);
    String username = String.valueOf(existing.get("username"));
    // 一次性随机口令，不再使用可预测的 username + 固定后缀；旧设备会话已在下文清空。
    String temporaryPassword = inputRules.generateTemporaryPassword();
    PasswordHash hash = passwordHasher.hash(temporaryPassword);
    mapper.updateAgentPassword(userId, hash.salt(), hash.hash(), hash.iterations());
    mapper.deleteLoginDevices(userId);
    auditService.customer(
        actor,
        "RESET_OVERSEA_AGENT_PASSWORD",
        userId,
        "Reset password for overseas agent " + username,
        ipAddress);
    Map<String, Object> response = new LinkedHashMap<>(requireOverseaAgent(userId));
    response.put("temporaryPassword", temporaryPassword);
    return response;
  }

  @Transactional
  public Map<String, Object> deleteOverseaAgent(
      long userId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    Map<String, Object> existing = requireOverseaAgent(userId);
    PasswordHash deletedPassword = passwordHasher.hash(UUID.randomUUID().toString());
    mapper.softDeleteAgent(
        userId,
        inputRules.deletedUsername("agent", userId),
        deletedPassword.salt(),
        deletedPassword.hash(),
        deletedPassword.iterations());
    mapper.deleteLoginDevices(userId);
    mapper.deleteEmployeeAssignments(userId);
    mapper.deleteShipmentParticipants(userId);
    auditService.customer(
        actor,
        "DELETE_OVERSEA_AGENT",
        userId,
        "Deleted overseas agent " + existing.get("username"),
        ipAddress);
    return Map.of(
        "id", String.valueOf(userId),
        "username", existing.get("username"),
        "status", "DELETED",
        "deleted", true);
  }

  /** 供客户/交接模块校验代理合法性使用。 */
  public Map<String, Object> requireOverseaAgent(long userId) {
    OverseaAgentRow row = mapper.findAgentById(userId);
    if (row == null) throw new ApiException(HttpStatus.NOT_FOUND, "Overseas agent not found");
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("id", row.id());
    value.put("username", row.username());
    value.put("displayName", row.displayName());
    value.put("status", row.status());
    return value;
  }

  public void syncScopesForCustomer(long customerId) {
    mapper.deleteScopesForCustomer(customerId);
    mapper.insertScopesForCustomer(customerId);
  }

  public void syncScopeForShipment(long customerId, long shipmentId) {
    mapper.deleteScopeForShipment(customerId, shipmentId);
    mapper.insertScopeForShipment(customerId, shipmentId);
  }

  public void syncEmployeeAgentParticipant(long customerId, long shipmentId, long actorId) {
    List<Long> employeeIds = mapper.findEmployeeIds(customerId);
    if (employeeIds.isEmpty()) return;
    long employeeId = employeeIds.get(0);
    if (mapper.countCustomerShipmentBinding(customerId, shipmentId) > 0) {
      mapper.upsertParticipant(shipmentId, employeeId, actorId);
    } else {
      removeUnusedEmployeeAgentParticipant(shipmentId, employeeId);
    }
  }

  public void removeUnusedEmployeeAgentParticipant(long shipmentId, long employeeId) {
    if (mapper.countAssignmentsForShipmentEmployee(shipmentId, employeeId) == 0) {
      mapper.deleteParticipant(shipmentId, employeeId);
    }
  }
}
