package com.cargoplanner.backend.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.persistence.CustomerProfileEntity;
import com.cargoplanner.backend.customer.persistence.CustomerProfileMapper;
import com.cargoplanner.backend.customer.persistence.CustomerProfileRepository;
import com.cargoplanner.backend.persistence.MyBatisTestSupport;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;

class CustomerProfileCrudIntegrationTest {
  private static final AuthenticatedUser OWNER =
      new AuthenticatedUser(1, "owner", "Owner", "BUSINESS", "ACTIVE");
  private static final AuthenticatedUser OTHER =
      new AuthenticatedUser(2, "other", "Other", "BUSINESS", "ACTIVE");
  private static final AuthenticatedUser ADMIN =
      new AuthenticatedUser(9, "admin", "Admin", "ADMIN", "ACTIVE");
  private JdbcTemplate jdbc;
  private CustomerProfileService service;
  private CustomerProfileRepository repository;
  private CustomerAuditService audit;

  @BeforeEach
  void setup() {
    var dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
    jdbc = new JdbcTemplate(dataSource);
    jdbc.execute("""
        CREATE TABLE cp_users (id BIGINT PRIMARY KEY, username VARCHAR(64),
          display_name VARCHAR(80), status VARCHAR(20))
        """);
    jdbc.update("INSERT INTO cp_users VALUES (1, 'owner', 'Owner', 'ACTIVE'), (2, 'other', 'Other', 'ACTIVE'), (9, 'admin', 'Admin', 'ACTIVE')");
    jdbc.execute("""
        CREATE TABLE cp_customers (id BIGINT AUTO_INCREMENT PRIMARY KEY,
          public_id VARCHAR(36) UNIQUE NOT NULL, username VARCHAR(64) UNIQUE NOT NULL,
          display_name VARCHAR(80), client_code VARCHAR(64) UNIQUE, party_role VARCHAR(20),
          password_salt VARCHAR(128), password_hash VARCHAR(256), password_iterations INT,
          customer_code_hash VARCHAR(128), customer_code_prefix VARCHAR(16),
          customer_code_mode VARCHAR(20), provisioning_source VARCHAR(20), status VARCHAR(20),
          contact_email VARCHAR(254), remark VARCHAR(500), created_by BIGINT, responsible_agent_id BIGINT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)
        """);
    jdbc.execute("CREATE TABLE cp_customer_employee_assignments (customer_id BIGINT, employee_user_id BIGINT)");
    jdbc.execute("CREATE TABLE cp_customer_shipment_access (customer_id BIGINT, shipment_id BIGINT)");
    jdbc.execute("""
        CREATE TABLE cp_customer_sessions (customer_id BIGINT, scope_customer_id BIGINT,
          revoked_at TIMESTAMP)
        """);
    var guard = new CustomerAccessGuard();
    repository = new CustomerProfileRepository(MyBatisTestSupport.session(dataSource,
        CustomerProfileMapper.class).getMapper(CustomerProfileMapper.class), guard);
    audit = mock(CustomerAuditService.class);
    var manager = new DataSourceTransactionManager(dataSource);
    var target = new CustomerProfileService(jdbc, new CustomerTokenCodec(), new PasswordHasher(),
        guard, new CustomerInputRules(), new CustomerLookupService(jdbc, guard),
        mock(CustomerShipmentAccessPolicy.class), audit, mock(OverseaAgentService.class),
        repository, manager);
    var proxy = new ProxyFactory(target);
    proxy.setProxyTargetClass(true);
    proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
    service = (CustomerProfileService) proxy.getProxy();
  }

  @Test
  void generatedInsertAssignsPrincipalAndDoesNotExposePasswordStorage() {
    var created = create("customer-one", "Keep remark");
    assertThat(created).containsEntry("responsibleAgentId", 1L).containsEntry("remark", "Keep remark");
    assertThat(created).doesNotContainKeys("passwordHash", "passwordSalt", "passwordIterations", "customerCodeHash");
    assertThat(jdbc.queryForObject("SELECT password_hash FROM cp_customers WHERE username = ?",
        String.class, "customer-one")).isNotBlank().isNotEqualTo("SecurePass!23");
  }

  @Test
  void updatePreservesOmittedFieldsAndBlankRemarkReallyClearsDatabaseColumn() {
    String id = (String) create("customer-two", "Keep remark").get("id");
    var retained = service.update(id, new UpdateCustomerRequest(null, "New name", null, null), OWNER, null);
    assertThat(retained).containsEntry("username", "customer-two").containsEntry("remark", "Keep remark");
    var cleared = service.update(id,
        new UpdateCustomerRequest(null, null, null, null, null, " "), OWNER, null);
    assertThat(cleared).containsEntry("remark", null).containsEntry("displayName", "New name");
    assertThat(jdbc.queryForObject("SELECT remark FROM cp_customers WHERE public_id = ?",
        String.class, id)).isNull();
  }

  @Test
  void scopeIsCheckedAgainInsideGeneratedUpdatePredicate() {
    String id = (String) create("scoped", "Original").get("id");
    var row = new CustomerProfileEntity();
    row.id = jdbc.queryForObject("SELECT id FROM cp_customers WHERE public_id = ?", Long.class, id);
    row.publicId = id;
    row.username = "hijacked";
    row.displayName = "Hijacked";
    row.partyRole = "SHIPPER";
    row.status = "ACTIVE";
    assertThatThrownBy(() -> repository.updateProfile(row, false, OTHER))
        .isInstanceOf(ApiException.class);
    assertThat(jdbc.queryForObject("SELECT username FROM cp_customers WHERE public_id = ?",
        String.class, id)).isEqualTo("scoped");
  }

  @Test
  void nonOwnerCannotEditButAdministratorCanWithoutTakingOwnership() {
    String id = (String) create("owned", "Original").get("id");
    var request = new UpdateCustomerRequest(null, "Admin updated", null, null);
    assertThatThrownBy(() -> service.update(id, request, OTHER, null)).isInstanceOf(ApiException.class);
    assertThat(service.update(id, request, ADMIN, null))
        .containsEntry("displayName", "Admin updated").containsEntry("responsibleAgentId", 1L);
  }

  @Test
  void profileInsertRollsBackWhenAuditRejectsCreate() {
    doThrow(new ApiException(HttpStatus.CONFLICT, "Audit rejected"))
        .when(audit).customer(any(), eq("CREATE_CUSTOMER"), anyLong(), anyString(), any());
    assertThatThrownBy(() -> create("rollback", "Never committed")).isInstanceOf(ApiException.class);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_customers", Integer.class)).isZero();
  }

  @Test
  void batchRowsHaveIndependentRealTransactionsIncludingDownstreamFailure() {
    doAnswer(invocation -> {
      if (invocation.getArgument(3, String.class).contains("row-reject")) {
        throw new ApiException(HttpStatus.CONFLICT, "Audit rejected this row");
      }
      return null;
    }).when(audit).customer(any(), eq("CREATE_CUSTOMER"), anyLong(), anyString(), any());
    var result = service.batchCreate(new CustomerBatchImportRequest("customers.xlsx", List.of(
        item("row-good"), item("row-reject"), item("row-after"))), OWNER, null);
    assertThat(result).containsEntry("created", 2).containsEntry("failed", 1);
    assertThat(jdbc.queryForList("SELECT username FROM cp_customers ORDER BY id", String.class))
        .containsExactly("row-good", "row-after");
  }

  @Test
  void duplicateCustomerIsConflictAndExistingCustomerIsUntouched() {
    create("duplicate", "Original");
    assertThatThrownBy(() -> create("duplicate", "Replacement"))
        .isInstanceOfSatisfying(ApiException.class,
            error -> assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT));
    assertThat(jdbc.queryForObject("SELECT remark FROM cp_customers WHERE username = 'duplicate'",
        String.class)).isEqualTo("Original");
  }

  @Test
  void optionalEmailPersistsPreservesAndClearsWithoutChangingLoginIdentity() {
    var created = service.create(new CreateCustomerRequest("email-client", "SecurePass!23",
        "Email client", "SHIPPER", null, "Original", "  Logistics@example.com  "), OWNER, null);
    String id = (String) created.get("id");
    assertThat(created).containsEntry("contactEmail", "Logistics@example.com");
    var retained = service.update(id, new UpdateCustomerRequest(null, "New name", null, null), OWNER, null);
    assertThat(retained).containsEntry("contactEmail", "Logistics@example.com");
    var cleared = service.update(id, new UpdateCustomerRequest(null, null, null, null, null, null, ""), OWNER, null);
    assertThat(cleared).containsEntry("contactEmail", null).containsEntry("username", "email-client");
    assertThat(jdbc.queryForObject("SELECT contact_email FROM cp_customers WHERE public_id = ?", String.class, id)).isNull();
  }

  @Test
  void ordinaryProfileUpdateKeepsAssignedEmployeeInTheResponse() {
    String id = (String) create("employee-linked", "Keep assignment").get("id");
    jdbc.update("INSERT INTO cp_customer_employee_assignments SELECT id, 2 FROM cp_customers WHERE public_id = ?", id);
    var updated = service.update(id, new UpdateCustomerRequest(null, "New display", null, null), OWNER, null);
    assertThat(updated).containsEntry("overseaAgentUserId", 2L).containsEntry("overseaAgentDisplayName", "Other");
  }

  @Test
  void invalidEmailRejectsTheEntireProfileUpdate() {
    String id = (String) create("email-invalid", "Original").get("id");
    assertThatThrownBy(() -> service.update(id, new UpdateCustomerRequest(null, "Must rollback",
        null, null, null, null, "bad-address"), OWNER, null)).isInstanceOf(ApiException.class);
    assertThat(jdbc.queryForObject("SELECT display_name FROM cp_customers WHERE public_id = ?", String.class, id)).isEqualTo("email-invalid");
  }

  private Map<String, Object> create(String name, String remark) {
    return service.create(new CreateCustomerRequest(name, "SecurePass!23", name,
        "SHIPPER", null, remark), OWNER, null);
  }

  private CustomerBatchImportItem item(String name) {
    return new CustomerBatchImportItem(null, name, "SecurePass!23", name, null, "SHIPPER", null);
  }
}
