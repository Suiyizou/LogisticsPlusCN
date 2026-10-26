package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.auth.PasswordHasher.PasswordHash;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import com.cargoplanner.backend.customer.CustomerTokenCodec.GeneratedCustomerCode;
import com.cargoplanner.backend.customer.persistence.CustomerProfileEntity;
import com.cargoplanner.backend.customer.persistence.CustomerProfileRepository;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 客户建档与生命周期。
 *
 * <p>从 {@code BusinessCustomerService} 拆出：查询详情、单个/批量创建、编辑、启用/停用、
 * 删除/归档、重置客户码与密码，以及客户输入规则（状态/身份/客户码/密码）与口令生成。
 * 共享能力通过 {@link CustomerLookupService}、{@link CustomerInputRules}、
 * {@link CustomerShipmentAccessPolicy}、{@link CustomerAuditService}、
 * {@link OverseaAgentService} 组合注入。
 *
 * <p>事务边界与原实现一致：创建/批量/编辑/停用/删除/重置仍为 {@code @Transactional}。
 */
@Service
public class CustomerProfileService {
  private final JdbcTemplate jdbcTemplate;
  private final CustomerProfileRepository profileRepository;
  private final TransactionTemplate rowTransaction;
  private final CustomerTokenCodec tokenCodec;
  private final PasswordHasher passwordHasher;
  private final CustomerAccessGuard accessGuard;
  private final CustomerInputRules inputRules;
  private final CustomerLookupService lookupService;
  private final CustomerShipmentAccessPolicy accessPolicy;
  private final CustomerAuditService auditService;
  private final OverseaAgentService overseaAgentService;

  public CustomerProfileService(
      JdbcTemplate jdbcTemplate,
      CustomerTokenCodec tokenCodec,
      PasswordHasher passwordHasher,
      CustomerAccessGuard accessGuard,
      CustomerInputRules inputRules,
      CustomerLookupService lookupService,
      CustomerShipmentAccessPolicy accessPolicy,
      CustomerAuditService auditService,
      OverseaAgentService overseaAgentService,
      CustomerProfileRepository profileRepository,
      PlatformTransactionManager transactionManager
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.tokenCodec = tokenCodec;
    this.passwordHasher = passwordHasher;
    this.accessGuard = accessGuard;
    this.inputRules = inputRules;
    this.lookupService = lookupService;
    this.accessPolicy = accessPolicy;
    this.auditService = auditService;
    this.overseaAgentService = overseaAgentService;
    this.profileRepository = profileRepository;
    this.rowTransaction = new TransactionTemplate(transactionManager);
    this.rowTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  /** Contact only; never used as login identity or sent to upstream carriers. */
  private static String normalizeContactEmail(String input) {
    if (input == null || input.isBlank()) return null;
    String value = input.trim();
    if (value.length() > 254 || !value.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Contact email is invalid");
    }
    return value;
  }

  public Map<String, Object> get(String customerPublicId, AuthenticatedUser actor) {
    return lookupService.customerMetadataWithEmployee(lookupService.requireAccessibleCustomer(customerPublicId, actor));
  }

  @Transactional
  public Map<String, Object> create(
      CreateCustomerRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    String username = inputRules.normalizeUsername(request == null ? null : request.username());
    String password = normalizePassword(request == null ? null : request.password());
    String displayName = inputRules.normalizeDisplayName(
        request == null || request.displayName() == null || request.displayName().isBlank()
            ? username
            : request.displayName()
    );
    String clientCodeRaw = normalizeOptionalClientCode(request == null ? null : request.clientCode());
    final String clientCode;
    final String customerCodeHash;
    final String customerCodePrefix;
    final String customerCodeMode;
    if (clientCodeRaw != null && !clientCodeRaw.isBlank()) {
      clientCode = clientCodeRaw;
      customerCodeHash = tokenCodec.hash(clientCode);
      customerCodePrefix = clientCode.length() > 4 ? clientCode.substring(0, 4) : clientCode;
      customerCodeMode = "MANUAL";
    } else {
      GeneratedCustomerCode generated = tokenCodec.newCustomerCode();
      clientCode = generated.plainText();
      customerCodeHash = generated.hash();
      customerCodePrefix = generated.prefix();
      customerCodeMode = "RANDOM";
    }
    String partyRole = normalizePartyRole(
        request == null ? null : request.partyRole(), "CONSIGNEE"
    );
    String remarkRaw = request == null || request.remark() == null || request.remark().isBlank()
        ? null
        : request.remark().trim();
    final String remark = remarkRaw != null && remarkRaw.length() > 500
        ? remarkRaw.substring(0, 500)
        : remarkRaw;
    PasswordHash passwordHash = passwordHasher.hash(password);
    String publicId = UUID.randomUUID().toString();
    var row = new CustomerProfileEntity();
    row.publicId = publicId;
    row.username = username;
    row.displayName = displayName;
    row.clientCode = clientCode;
    row.partyRole = partyRole;
    row.passwordSalt = passwordHash.salt();
    row.passwordHash = passwordHash.hash();
    row.passwordIterations = passwordHash.iterations();
    row.customerCodeHash = customerCodeHash;
    row.customerCodePrefix = customerCodePrefix;
    row.customerCodeMode = customerCodeMode;
    row.provisioningSource = "MANUAL";
    row.status = "ACTIVE";
    row.remark = remark;
    row.contactEmail = normalizeContactEmail(request == null ? null : request.contactEmail());
    try {
      profileRepository.create(row, actor);
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Customer username or client code already exists");
    }
    CustomerRecord customer = lookupService.requireManaged(publicId, actor);
    auditService.customer(actor, "CREATE_CUSTOMER", customer.id(), "Created customer " + username, ipAddress);
    Map<String, Object> response = new LinkedHashMap<>(lookupService.customerMetadata(customer));
    response.put("customerCode", clientCode);
    return response;
  }

  public Map<String, Object> batchCreate(
      CustomerBatchImportRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    List<CustomerBatchImportItem> items = request == null || request.items() == null
        ? List.of()
        : request.items();
    if (items.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one customer row is required");
    }
    if (items.size() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A customer import cannot exceed 500 rows");
    }
    List<Map<String, Object>> results = new ArrayList<>();
    int createdCount = 0;
    for (int index = 0; index < items.size(); index++) {
      CustomerBatchImportItem item = items.get(index);
      int rowNumber = item != null && item.rowNumber() != null
          ? item.rowNumber()
          : index + 2;
      String suppliedPassword = item == null ? null : item.password();
      String password = suppliedPassword == null || suppliedPassword.isBlank()
          ? generatePassword()
          : suppliedPassword;
      String username = item == null ? null : item.username();
      String displayName = item == null || item.displayName() == null || item.displayName().isBlank()
          ? username
          : item.displayName();
      String clientCode = item == null ? null : item.clientCode();
      String partyRole = item == null || item.partyRole() == null || item.partyRole().isBlank()
          ? "CONSIGNEE"
          : item.partyRole();
      String remark = item == null ? null : item.remark();
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("rowNumber", rowNumber);
      row.put("username", username == null ? "" : username.trim());
      row.put("displayName", displayName == null ? "" : displayName.trim());
      row.put("clientCode", clientCode == null ? "" : clientCode.trim().toUpperCase(Locale.ROOT));
      row.put("partyRole", partyRole);
      try {
        // Each row is atomic even though this method calls create on the same instance.
        Map<String, Object> created = rowTransaction.execute(transaction -> create(
            new CreateCustomerRequest(
                username,
                password,
                displayName,
                partyRole,
                clientCode,
                remark
            ),
            actor,
            ipAddress
        ));
        row.put("status", "CREATED");
        row.put("customer", created);
        row.put("password", password);
        row.put("customerCode", created.get("customerCode"));
        createdCount++;
      } catch (ApiException error) {
        row.put("status", "FAILED");
        row.put("message", error.getMessage());
      }
      results.add(row);
    }
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", results);
    response.put("total", results.size());
    response.put("created", createdCount);
    response.put("failed", results.size() - createdCount);
    response.put("sourceFileName", ClientInfo.trim(
        request == null ? null : request.sourceFileName(), 255
    ));
    return response;
  }

  @Transactional
  public Map<String, Object> update(
      String customerPublicId,
      UpdateCustomerRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord existing = lookupService.requireManaged(customerPublicId, actor);
    String username = request == null || request.username() == null || request.username().isBlank()
        ? existing.username()
        : inputRules.normalizeUsername(request.username());
    String displayName = request == null || request.displayName() == null || request.displayName().isBlank()
        ? existing.displayName()
        : inputRules.normalizeDisplayName(request.displayName());
    String requestedClientCode = request == null ? null : request.clientCode();
    String clientCode = requestedClientCode == null
        ? existing.clientCode()
        : requestedClientCode.trim().equalsIgnoreCase(existing.clientCode())
            ? existing.clientCode()
            : normalizeOptionalClientCode(requestedClientCode);
    String partyRole = normalizePartyRole(
        request == null ? null : request.partyRole(), existing.partyRole()
    );
    String status = normalizeStatus(request == null ? null : request.status(), existing.status());
    String newRemark = request == null || request.remark() == null
        ? existing.remark()
        : (request.remark().isBlank() ? null : request.remark().trim());
    if (newRemark != null && newRemark.length() > 500) {
      newRemark = newRemark.substring(0, 500);
    }
    try {
      boolean codeChanged = clientCode != null && !clientCode.equals(existing.clientCode());
      var profile = new CustomerProfileEntity();
      profile.id = existing.id();
      profile.publicId = existing.publicId();
      profile.username = username;
      profile.displayName = displayName;
      profile.clientCode = clientCode;
      profile.partyRole = partyRole;
      profile.status = status;
      profile.remark = newRemark;
      profile.contactEmail = request == null || request.contactEmail() == null
          ? existing.contactEmail() : normalizeContactEmail(request.contactEmail());
      if (codeChanged) {
        profile.customerCodeHash = tokenCodec.hash(clientCode);
        profile.customerCodePrefix = clientCode.length() > 4 ? clientCode.substring(0, 4) : clientCode;
      }
      profileRepository.updateProfile(profile, codeChanged, actor);
      // The logistics role is a customer identity attribute in this model. Keep all existing
      // shipment relationships consistent when the business user changes that identity.
      if (!partyRole.equals(existing.partyRole())) {
        accessPolicy.ensureRoleAvailableForExistingBindings(existing.id(), partyRole);
        jdbcTemplate.update(
            "UPDATE cp_customer_shipment_access SET relationship_role = ? WHERE customer_id = ?",
            partyRole,
            existing.id()
        );
        jdbcTemplate.update(
            """
            DELETE FROM cp_oversea_agent_shipment_scopes
            WHERE oversea_agent_customer_id = ? OR represented_customer_id = ?
            """,
            existing.id(),
            existing.id()
        );
        if ("OVERSEA_AGENT".equals(partyRole)) {
          jdbcTemplate.update(
              "DELETE FROM cp_oversea_agent_customers WHERE customer_id = ?",
              existing.id()
          );
        } else {
          jdbcTemplate.update(
              "DELETE FROM cp_oversea_agent_customers WHERE oversea_agent_customer_id = ?",
              existing.id()
          );
        }
        overseaAgentService.syncScopesForCustomer(existing.id());
      }
      if (codeChanged) lookupService.revokeSessions(existing.id());
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Customer username or client code already exists");
    }
    if (!"ACTIVE".equals(status)) lookupService.revokeSessions(existing.id());
    auditService.customer(actor, "UPDATE_CUSTOMER", existing.id(), "Updated customer " + username, ipAddress);
    return lookupService.customerMetadataWithEmployee(lookupService.requireManaged(customerPublicId, actor));
  }

  @Transactional
  public Map<String, Object> disable(
      String customerPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = lookupService.requireManaged(customerPublicId, actor);
    jdbcTemplate.update(
        "UPDATE cp_customers SET status = 'DISABLED', updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
        customer.id()
    );
    lookupService.revokeSessions(customer.id());
    auditService.customer(actor, "DISABLE_CUSTOMER", customer.id(), "Disabled customer " + customer.username(), ipAddress);
    return Map.of("disabled", true, "id", customer.publicId(), "status", "DISABLED");
  }

  @Transactional
  public Map<String, Object> delete(
      String customerPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = lookupService.requireManaged(customerPublicId, actor);
    PasswordHash deletedPassword = passwordHasher.hash(UUID.randomUUID().toString());
    GeneratedCustomerCode deletedCode = tokenCodec.newCustomerCode();
    jdbcTemplate.update(
        """
        UPDATE cp_customers
        SET username = ?, client_code = NULL, status = 'DELETED',
            password_salt = ?, password_hash = ?, password_iterations = ?,
            customer_code_hash = ?, customer_code_prefix = ?,
            customer_code_mode = 'RANDOM', updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ? AND status <> 'DELETED'
        """,
        inputRules.deletedUsername("customer", customer.id()),
        deletedPassword.salt(),
        deletedPassword.hash(),
        deletedPassword.iterations(),
        deletedCode.hash(),
        deletedCode.prefix(),
        customer.id()
    );
    lookupService.revokeSessions(customer.id());
    if ("OVERSEA_AGENT".equals(customer.partyRole())) {
      jdbcTemplate.update(
          "DELETE FROM cp_oversea_agent_customers WHERE oversea_agent_customer_id = ?",
          customer.id()
      );
    }
    auditService.customer(actor, "DELETE_CUSTOMER", customer.id(), "Deleted customer " + customer.username(), ipAddress);
    return Map.of("deleted", true, "id", customer.publicId(), "username", customer.username());
  }

  @Transactional
  public Map<String, Object> resetCode(
      String customerPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = lookupService.requireManaged(customerPublicId, actor);
    GeneratedCustomerCode code = tokenCodec.newCustomerCode();
    jdbcTemplate.update(
        "UPDATE cp_customers SET customer_code_hash = ?, customer_code_prefix = ?, customer_code_mode = 'RANDOM' WHERE id = ?",
        code.hash(),
        code.prefix(),
        customer.id()
    );
    lookupService.revokeSessions(customer.id());
    auditService.customer(actor, "RESET_CUSTOMER_CODE", customer.id(), "Reset customer code", ipAddress);
    Map<String, Object> response = new LinkedHashMap<>(
        lookupService.customerMetadata(lookupService.requireManaged(customerPublicId, actor))
    );
    response.put("customerCode", code.plainText());
    return response;
  }

  @Transactional
  public Map<String, Object> resetPassword(
      String customerPublicId,
      UpdateCustomerPasswordRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    CustomerRecord customer = lookupService.requireManaged(customerPublicId, actor);
    String password = normalizePassword(request == null ? null : request.password());
    PasswordHash passwordHash = passwordHasher.hash(password);
    jdbcTemplate.update(
        """
        UPDATE cp_customers
        SET password_salt = ?, password_hash = ?, password_iterations = ?
        WHERE id = ?
        """,
        passwordHash.salt(),
        passwordHash.hash(),
        passwordHash.iterations(),
        customer.id()
    );
    lookupService.revokeSessions(customer.id());
    auditService.customer(actor, "RESET_CUSTOMER_PASSWORD", customer.id(), "Reset customer password", ipAddress);
    return Map.of("passwordReset", true, "id", customer.publicId());
  }


  private String normalizePassword(String value) {
    if (value == null || value.length() < 8 || value.length() > 128) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Customer password must contain 8-128 characters"
      );
    }
    if (!value.chars().anyMatch(Character::isLetter)
        || !value.chars().anyMatch(Character::isDigit)) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Customer password must contain at least one letter and one number"
      );
    }
    return value;
  }

  private String normalizeOptionalClientCode(String value) {
    if (value == null || value.isBlank()) return null;
    String normalized = value.trim().toUpperCase(Locale.ROOT);
    if (!normalized.matches("[A-Z0-9._-]{6,10}")) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Client Code must contain 6-10 letters, numbers, dots, underscores, or hyphens"
      );
    }
    return normalized;
  }

  private String generatePassword() {
    StringBuilder value = new StringBuilder("Aa1!");
    while (value.length() < 18) {
      value.append(PASSWORD_ALPHABET.charAt(CREDENTIAL_RANDOM.nextInt(PASSWORD_ALPHABET.length())));
    }
    for (int index = value.length() - 1; index > 0; index--) {
      int other = CREDENTIAL_RANDOM.nextInt(index + 1);
      char swap = value.charAt(index);
      value.setCharAt(index, value.charAt(other));
      value.setCharAt(other, swap);
    }
    return value.toString();
  }

  private String normalizeStatus(String value, String fallback) {
    String normalized = inputRules.normalizeCode(value, fallback);
    if (!"ACTIVE".equals(normalized) && !"DISABLED".equals(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Customer status must be ACTIVE or DISABLED");
    }
    return normalized;
  }

  private String normalizePartyRole(String value, String fallback) {
    String normalized = inputRules.normalizeCode(value, fallback);
    if ("AGENT".equals(normalized)) normalized = "OVERSEA_AGENT";
    if (normalized == null
        || (!"OVERSEA_AGENT".equals(normalized)
        && !"SHIPPER".equals(normalized)
        && !"CONSIGNEE".equals(normalized))) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Customer party role must be SHIPPER or CONSIGNEE; OVERSEA_AGENT is accepted only for legacy records"
      );
    }
    return normalized;
  }

  private static final SecureRandom CREDENTIAL_RANDOM = new SecureRandom();
  private static final String PASSWORD_ALPHABET =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
}
