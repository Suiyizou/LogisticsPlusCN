package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import com.cargoplanner.backend.customer.dto.CustomerDirectoryResponse;
import com.cargoplanner.backend.shipment.ShipmentBatchItemRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.HexFormat;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BusinessCustomerService {
  // Customer access and related documents must be bound to a shipment-level reference.
  // Container numbers are reusable across voyages and therefore cannot be an authority key.

  private final JdbcTemplate jdbcTemplate;
  private final CustomerTokenCodec tokenCodec;
  private final PasswordHasher passwordHasher;
  private final ObjectMapper objectMapper;
  private final CustomerDirectoryService directoryService;
  private final CustomerAccessGuard accessGuard;
  private final CustomerInputRules inputRules;
  private final CustomerAuditService auditService;
  private final OverseaAgentService overseaAgentService;
  private final CustomerLookupService lookupService;
  private final CustomerHandoverService handoverService;
  private final CustomerShipmentAccessPolicy accessPolicy;
  private final CustomerProfileService profileService;
  private final CustomerShipmentQueryService shipmentQueryService;
  private final CustomerTransferService transferService;
  private final ShipmentLookupService shipmentLookupService;
  private final CustomerShipmentBindingService bindingService;
  private final CustomerShipmentMutationService mutationService;
  private final CustomerClientMatchService clientMatchService;

  public BusinessCustomerService(
      JdbcTemplate jdbcTemplate,
      CustomerTokenCodec tokenCodec,
      PasswordHasher passwordHasher,
      ObjectMapper objectMapper,
      CustomerDirectoryService directoryService,
      CustomerAccessGuard accessGuard,
      CustomerInputRules inputRules,
      CustomerAuditService auditService,
      OverseaAgentService overseaAgentService,
      CustomerLookupService lookupService,
      CustomerHandoverService handoverService,
      CustomerShipmentAccessPolicy accessPolicy,
      CustomerProfileService profileService,
      CustomerShipmentQueryService shipmentQueryService,
      CustomerTransferService transferService,
      ShipmentLookupService shipmentLookupService,
      CustomerShipmentBindingService bindingService,
      CustomerShipmentMutationService mutationService,
      CustomerClientMatchService clientMatchService
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.tokenCodec = tokenCodec;
    this.passwordHasher = passwordHasher;
    this.objectMapper = objectMapper;
    this.directoryService = directoryService;
    this.accessGuard = accessGuard;
    this.inputRules = inputRules;
    this.auditService = auditService;
    this.overseaAgentService = overseaAgentService;
    this.lookupService = lookupService;
    this.handoverService = handoverService;
    this.accessPolicy = accessPolicy;
    this.profileService = profileService;
    this.shipmentQueryService = shipmentQueryService;
    this.transferService = transferService;
    this.shipmentLookupService = shipmentLookupService;
    this.bindingService = bindingService;
    this.mutationService = mutationService;
    this.clientMatchService = clientMatchService;
  }

  public CustomerDirectoryResponse list(AuthenticatedUser actor) {
    return directoryService.list(actor);
  }

  public Map<String, Object> listTransferAgents(AuthenticatedUser actor) {
    return overseaAgentService.listTransferAgents(actor);
  }

  public Map<String, Object> listBusinessHandoverAgents(AuthenticatedUser actor) {
    return overseaAgentService.listBusinessHandoverAgents(actor);
  }

  public Map<String, Object> createOverseaAgentEmployee(
      CreateOverseaAgentEmployeeRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return overseaAgentService.createOverseaAgentEmployee(request, actor, ipAddress);
  }

  public Map<String, Object> batchCreateOverseaAgentEmployees(
      OverseaAgentBatchCreateRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return overseaAgentService.batchCreateOverseaAgentEmployees(request, actor, ipAddress);
  }

  public Map<String, Object> updateOverseaAgent(
      long userId,
      UpdateOverseaAgentRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return overseaAgentService.updateOverseaAgent(userId, request, actor, ipAddress);
  }

  public Map<String, Object> resetOverseaAgentPassword(
      long userId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return overseaAgentService.resetOverseaAgentPassword(userId, actor, ipAddress);
  }

  public Map<String, Object> deleteOverseaAgent(
      long userId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return overseaAgentService.deleteOverseaAgent(userId, actor, ipAddress);
  }

  public Map<String, Object> get(String customerPublicId, AuthenticatedUser actor) {
    return profileService.get(customerPublicId, actor);
  }

  public Map<String, Object> create(
      CreateCustomerRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return profileService.create(request, actor, ipAddress);
  }

  public Map<String, Object> batchCreate(
      CustomerBatchImportRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return profileService.batchCreate(request, actor, ipAddress);
  }

  public Map<String, Object> update(
      String customerPublicId,
      UpdateCustomerRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return profileService.update(customerPublicId, request, actor, ipAddress);
  }


  public Map<String, Object> transferCustomers(
      CustomerTransferRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return transferService.transferCustomers(request, actor, ipAddress);
  }

  public Map<String, Object> handoverCustomers(
      BusinessCustomerHandoverRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return handoverService.handoverCustomers(request, actor, ipAddress);
  }

  public Map<String, Object> listCustomerHandoverRequests(
      String requestedStatus,
      int requestedPage,
      int requestedSize,
      AuthenticatedUser actor
  ) {
    return handoverService.listCustomerHandoverRequests(
        requestedStatus, requestedPage, requestedSize, actor);
  }

  public Map<String, Object> getCustomerHandoverRequest(
      String requestPublicId,
      AuthenticatedUser actor
  ) {
    return handoverService.getCustomerHandoverRequest(requestPublicId, actor);
  }

  public Map<String, Object> approveCustomerHandover(
      String requestPublicId,
      CustomerHandoverDecisionRequest decision,
      AuthenticatedUser admin,
      String ipAddress
  ) {
    return handoverService.approveCustomerHandover(requestPublicId, decision, admin, ipAddress);
  }

  public Map<String, Object> rejectCustomerHandover(
      String requestPublicId,
      CustomerHandoverDecisionRequest decision,
      AuthenticatedUser admin,
      String ipAddress
  ) {
    return handoverService.rejectCustomerHandover(requestPublicId, decision, admin, ipAddress);
  }

  public Map<String, Object> disable(
      String customerPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return profileService.disable(customerPublicId, actor, ipAddress);
  }

  public Map<String, Object> delete(
      String customerPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return profileService.delete(customerPublicId, actor, ipAddress);
  }

  public Map<String, Object> resetCode(
      String customerPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return profileService.resetCode(customerPublicId, actor, ipAddress);
  }

  public Map<String, Object> resetPassword(
      String customerPublicId,
      UpdateCustomerPasswordRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return profileService.resetPassword(customerPublicId, request, actor, ipAddress);
  }
  public Map<String, Object> listOverseaAgentCustomers(
      String overseaAgentPublicId,
      AuthenticatedUser actor
  ) {
    return overseaAgentService.listOverseaAgentCustomers(overseaAgentPublicId, actor);
  }

  public Map<String, Object> updateOverseaAgentCustomers(
      String overseaAgentPublicId,
      OverseaAgentCustomerLinksRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    return overseaAgentService.updateOverseaAgentCustomers(
        overseaAgentPublicId, request, actor, ipAddress);
  }

  public Map<String, Object> listShipments(String customerPublicId, AuthenticatedUser actor) {
    return bindingService.listShipments(customerPublicId, actor);
  }
  public Map<String, Object> bindShipment(String customerPublicId, CustomerShipmentBindingRequest request, AuthenticatedUser actor, String ipAddress) {
    return bindingService.bindShipment(customerPublicId, request, actor, ipAddress);
  }
  public Map<String, Object> bindShipments(String customerPublicId, CustomerShipmentBatchBindingRequest request, AuthenticatedUser actor, String ipAddress) {
    return bindingService.bindShipments(customerPublicId, request, actor, ipAddress);
  }
  public Map<String, Object> deleteShipments(com.cargoplanner.backend.shipment.ShipmentBatchDeleteRequest request, AuthenticatedUser actor) {
    return bindingService.deleteShipments(request, actor);
  }
  public Map<String, Object> setShipmentPublication(String customerPublicId, String shipmentPublicId, ShipmentPublicationRequest request, AuthenticatedUser actor, String ipAddress) {
    return bindingService.setShipmentPublication(customerPublicId, shipmentPublicId, request, actor, ipAddress);
  }
  public Map<String, Object> unbindShipment(String customerPublicId, String shipmentPublicId, AuthenticatedUser actor, String ipAddress) {
    return bindingService.unbindShipment(customerPublicId, shipmentPublicId, actor, ipAddress);
  }

  public Map<String, Object> listAvailableShipments(AuthenticatedUser actor) {
    return shipmentQueryService.listAvailableShipments(actor);
  }

  public Map<String, Object> listShipmentSnapshots(AuthenticatedUser actor) {
    return shipmentQueryService.listShipmentSnapshots(actor);
  }

  public Map<String, Object> listShipmentSnapshots(
      AuthenticatedUser actor,
      int requestedPage,
      int requestedPageSize,
      String customerPublicId,
      boolean refreshIssuesOnly
  ) {
    return shipmentQueryService.listShipmentSnapshots(
        actor, requestedPage, requestedPageSize, customerPublicId, refreshIssuesOnly);
  }

  public Map<String, Object> listShipmentSnapshots(
      AuthenticatedUser actor,
      int requestedPage,
      int requestedPageSize,
      String customerPublicId,
      boolean refreshIssuesOnly,
      String businessFilter
  ) {
    return shipmentQueryService.listShipmentSnapshots(
        actor,
        requestedPage,
        requestedPageSize,
        customerPublicId,
        refreshIssuesOnly,
        businessFilter);
  }

  public Map<String, Object> listShipmentSnapshots(
      AuthenticatedUser actor,
      int requestedPage,
      int requestedPageSize,
      String customerPublicId,
      boolean refreshIssuesOnly,
      String businessFilter,
      String requestedEtaSort,
      boolean requestedUnfinishedOnly
  ) {
    return shipmentQueryService.listShipmentSnapshots(
        actor,
        requestedPage,
        requestedPageSize,
        customerPublicId,
        refreshIssuesOnly,
        businessFilter,
        requestedEtaSort,
        requestedUnfinishedOnly);
  }

  public List<ShipmentBatchItemRequest> listUnfinishedTrackingItems(AuthenticatedUser actor) {
    return shipmentQueryService.listUnfinishedTrackingItems(actor);
  }

  public List<ShipmentBatchItemRequest> listSelectedTrackingItems(
      AuthenticatedUser actor,
      List<String> rawShipmentIds
  ) {
    return shipmentQueryService.listSelectedTrackingItems(actor, rawShipmentIds);
  }

  public Map<String, Object> getShipmentSnapshot(AuthenticatedUser actor, String shipmentPublicId) {
    return shipmentQueryService.getShipmentSnapshot(actor, shipmentPublicId);
  }


  private static String textOrNull(JsonNode node) {
    return ShipmentReferences.textOrNull(node);
  }

  private static String firstTextValue(JsonNode... candidates) {
    return ShipmentReferences.firstTextValue(candidates);
  }

  public Map<String, Object> createShipment(CreateBusinessShipmentRequest request, AuthenticatedUser actor, String ipAddress) {
    return mutationService.createShipment(request, actor, ipAddress);
  }
  public Map<String, Object> inspectShipmentImportConflicts(ShipmentImportConflictCheckRequest request, AuthenticatedUser actor) {
    return mutationService.inspectShipmentImportConflicts(request, actor);
  }
  public Map<String, Object> createAssignedShipment(AssignedBusinessShipmentRequest request, AuthenticatedUser actor, String ipAddress) {
    return mutationService.createAssignedShipment(request, actor, ipAddress);
  }
  public Map<String, Object> updateShipment(String shipmentPublicId, UpdateBusinessShipmentRequest request, AuthenticatedUser actor, String ipAddress) {
    return mutationService.updateShipment(shipmentPublicId, request, actor, ipAddress);
  }
  public Map<String, Object> updateManualSnapshot(String shipmentPublicId, CreateBusinessShipmentRequest request, AuthenticatedUser actor, String ipAddress) {
    return mutationService.updateManualSnapshot(shipmentPublicId, request, actor, ipAddress);
  }
  public Map<String, Object> updateShipmentBusinessFields(ShipmentBusinessFieldsBatchUpdateRequest request, AuthenticatedUser actor, String ipAddress) {
    return mutationService.updateShipmentBusinessFields(request, actor, ipAddress);
  }
  public Map<String, Object> deleteShipment(String shipmentPublicId, AuthenticatedUser actor, String ipAddress) {
    return mutationService.deleteShipment(shipmentPublicId, actor, ipAddress);
  }
  public Map<String, Object> updateShipmentNote(String shipmentPublicId, String note, AuthenticatedUser actor, String ipAddress) {
    return mutationService.updateShipmentNote(shipmentPublicId, note, actor, ipAddress);
  }
  public Map<String, Object> invalidateCurrentSnapshot(String shipmentPublicId, SnapshotInvalidationRequest request, AuthenticatedUser actor, String ipAddress) {
    return mutationService.invalidateCurrentSnapshot(shipmentPublicId, request, actor, ipAddress);
  }



  public Map<String, Object> listPendingClientMatches(AuthenticatedUser actor) {
    return clientMatchService.listPendingClientMatches(actor);
  }
  public Map<String, Object> resolveClientMatch(long matchId, ResolveClientMatchRequest request, AuthenticatedUser actor, String ipAddress) {
    return clientMatchService.resolveClientMatch(matchId, request, actor, ipAddress);
  }

  private CustomerRecord requireManaged(String publicId, AuthenticatedUser actor) {
    return lookupService.requireManaged(publicId, actor);
  }

  private CustomerRecord requireTransferCustomer(String publicId, AuthenticatedUser actor) {
    return lookupService.requireTransferCustomer(publicId, actor);
  }

  private CustomerRecord requireAccessibleCustomer(String publicId, AuthenticatedUser actor) {
    return lookupService.requireAccessibleCustomer(publicId, actor);
  }

  private ShipmentRecord resolveShipment(CustomerShipmentBindingRequest request) {
    return shipmentLookupService.resolveShipment(request);
  }
  private ShipmentRecord findShipmentByReference(String carrier, String referenceType, String referenceNo) {
    return shipmentLookupService.findShipmentByReference(carrier, referenceType, referenceNo);
  }
  private ShipmentRecord requireShipment(String publicId) {
    return shipmentLookupService.requireShipment(publicId);
  }
  private Map<String, Object> requireBinding(long customerId, String shipmentPublicId) {
    return shipmentLookupService.requireBinding(customerId, shipmentPublicId);
  }
  private Map<String, Object> requireAvailableShipment(String shipmentPublicId, AuthenticatedUser actor) {
    return shipmentLookupService.requireAvailableShipment(shipmentPublicId, actor);
  }
  private String shipmentBindingSelect() {
    return shipmentLookupService.shipmentBindingSelect();
  }
  private String availableShipmentSelect() {
    return shipmentLookupService.availableShipmentSelect();
  }
  private ShipmentRecord mapShipment(ResultSet rs, int rowNumber) throws SQLException {
    return shipmentLookupService.mapShipment(rs, rowNumber);
  }
  private void requireShipmentAssignmentAuthority(ShipmentRecord shipment, AuthenticatedUser actor) {
    shipmentLookupService.requireShipmentAssignmentAuthority(shipment, actor);
  }
  private Map<String, Object> mapBinding(ResultSet rs, int rowNumber) throws SQLException {
    return shipmentLookupService.mapBinding(rs, rowNumber);
  }
  private Map<String, Object> mapAvailableShipment(ResultSet rs, int rowNumber) throws SQLException {
    return shipmentLookupService.mapAvailableShipment(rs, rowNumber);
  }

  private String baseCustomerSelect() {
    return lookupService.baseCustomerSelect();
  }

  private CustomerRecord mapCustomer(ResultSet rs, int rowNumber) throws SQLException {
    return lookupService.mapCustomer(rs, rowNumber);
  }

  private void putRefreshOutcome(Map<String, Object> value, ResultSet rs) throws SQLException {
    ShipmentRowMappers.putRefreshOutcome(value, rs);
  }



  private Map<String, Object> customerMetadata(CustomerRecord record) {
    return lookupService.customerMetadata(record);
  }

  private Map<String, Object> customerMetadataWithEmployee(CustomerRecord record) {
    return lookupService.customerMetadataWithEmployee(record);
  }

  private void revokeSessions(long customerId) {
    lookupService.revokeSessions(customerId);
  }

  private void syncOverseaAgentScopesForCustomer(long customerId) {
    overseaAgentService.syncScopesForCustomer(customerId);
  }

  private void syncOverseaAgentScopeForShipment(long customerId, long shipmentId) {
    overseaAgentService.syncScopeForShipment(customerId, shipmentId);
  }

  private void syncEmployeeAgentParticipant(long customerId, long shipmentId, long actorId) {
    overseaAgentService.syncEmployeeAgentParticipant(customerId, shipmentId, actorId);
  }

  private void removeUnusedEmployeeAgentParticipant(long shipmentId, long employeeId) {
    overseaAgentService.removeUnusedEmployeeAgentParticipant(shipmentId, employeeId);
  }


  private void requireAdministrator(AuthenticatedUser actor) {
    accessGuard.requireAdministrator(actor);
  }


  private void requireOperationsReader(AuthenticatedUser actor) {
    accessGuard.requireOperationsReader(actor);
  }

  private void requireManager(AuthenticatedUser actor) {
    accessGuard.requireManager(actor);
  }

  private void requireTransferManager(AuthenticatedUser actor) {
    accessGuard.requireTransferManager(actor);
  }

  private void audit(AuthenticatedUser actor, String action, long targetId, String detail, String ip) {
    auditService.customer(actor, action, targetId, detail, ip);
  }

  private void auditShipment(AuthenticatedUser actor, String action, long targetId, String detail, String ip) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (admin_user_id, action, target_type, target_id, detail, ip_address)
        VALUES (?, ?, 'SHIPMENT', ?, ?, ?)
        """,
        actor.id(),
        action,
        targetId,
        ClientInfo.trim(detail, 512),
        ClientInfo.trim(ip, 64)
    );
  }

  private void lockShipment(long shipmentId) {
    lookupService.lockShipment(shipmentId);
  }

  private void lockCustomer(String customerPublicId) {
    lookupService.lockCustomer(customerPublicId);
  }



  private void ensureShipmentRoleAvailable(long shipmentId, long customerId, String role) {
    accessPolicy.ensureShipmentRoleAvailable(shipmentId, customerId, role);
  }



  private String normalizeUsername(String value) {
    return inputRules.normalizeUsername(value);
  }


  private void validateInternalPassword(String password) {
    inputRules.validateInternalPassword(password);
  }

  private String normalizeDisplayName(String value) {
    return inputRules.normalizeDisplayName(value);
  }



  private String deletedUsername(String accountType, long id) {
    return inputRules.deletedUsername(accountType, id);
  }






  private String durableReferenceIdentity(String carrier, String type, String referenceNo) {
    return ShipmentReferences.durableReferenceIdentity(carrier, type, referenceNo);
  }

  private boolean isSharedCoscoNumericIdentity(
      String carrier,
      String type,
      String normalizedNumber
  ) {
    return ShipmentReferences.isSharedCoscoNumericIdentity(carrier, type, normalizedNumber);
  }



  private String normalizeCode(String value, String fallback) {
    return inputRules.normalizeCode(value, fallback);
  }

  private String normalizeReference(String value) {
    return ShipmentReferences.normalizeReference(value);
  }

  private Long nullableLong(ResultSet rs, String column) throws SQLException {
    long value = rs.getLong(column);
    return rs.wasNull() ? null : value;
  }

  private String instantString(ResultSet rs, String column) throws SQLException {
    return ShipmentRowMappers.instantString(rs, column);
  }


}
