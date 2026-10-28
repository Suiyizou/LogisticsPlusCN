package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
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
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 票单创建、变更、手工快照与删除。
 *
 * <p>从 {@code BusinessCustomerService} 拆出的写域：新建/批量导入冲突/指定客户创建、手工快照
 * 组装、更新（含业务字段与手工快照）、删除、备注、快照失效与发布前校验。
 */
@Service
public class CustomerShipmentMutationService {
  private static final List<String> CARRIERS = com.cargoplanner.backend.shipment.TrackingCarriers.CODES;

  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;
  private final CustomerAccessGuard accessGuard;
  private final CustomerLookupService lookupService;
  private final ShipmentLookupService shipmentLookupService;
  private final CustomerShipmentAccessPolicy accessPolicy;
  private final OverseaAgentService overseaAgentService;
  private final CustomerAuditService auditService;
  private final CustomerInputRules inputRules;
  private final CustomerShipmentBindingService bindingService;

  public CustomerShipmentMutationService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      CustomerAccessGuard accessGuard,
      CustomerLookupService lookupService,
      ShipmentLookupService shipmentLookupService,
      CustomerShipmentAccessPolicy accessPolicy,
      OverseaAgentService overseaAgentService,
      CustomerAuditService auditService,
      CustomerInputRules inputRules,
      CustomerShipmentBindingService bindingService
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.accessGuard = accessGuard;
    this.lookupService = lookupService;
    this.shipmentLookupService = shipmentLookupService;
    this.accessPolicy = accessPolicy;
    this.overseaAgentService = overseaAgentService;
    this.auditService = auditService;
    this.inputRules = inputRules;
    this.bindingService = bindingService;
  }

  @Transactional
  public Map<String, Object> createShipment(
      CreateBusinessShipmentRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    if (request == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment is required");
    String carrier = normalizeCarrier(request.carrier());
    String referenceType = normalizeReferenceType(request.referenceType(), carrier);
    String referenceNo = normalizeShipmentReference(carrier, referenceType, request.referenceNo());
    assertReferenceIdentityAvailable(carrier, referenceType, referenceNo, null);
    String trackingStatus = normalizeTrackingStatus(request.trackingStatus(), null);
    String note = normalizeShipmentNote(request.note(), null);
    String publicId = UUID.randomUUID().toString();
    Instant now = Instant.now();
    KeyHolder keyHolder = new GeneratedKeyHolder();
    try {
      jdbcTemplate.update(connection -> {
        PreparedStatement statement = connection.prepareStatement(
            """
            INSERT INTO cp_shipments (
              public_id, carrier_code, tracking_status, business_note,
              created_by, responsible_agent_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            Statement.RETURN_GENERATED_KEYS
        );
        statement.setString(1, publicId);
        statement.setString(2, carrier);
        statement.setString(3, trackingStatus);
        statement.setString(4, note);
        statement.setLong(5, actor.id());
        statement.setLong(6, actor.id());
        statement.setTimestamp(7, Timestamp.from(now));
        statement.setTimestamp(8, Timestamp.from(now));
        return statement;
      }, keyHolder);
      Number generatedId = keyHolder.getKey();
      if (generatedId == null) throw new IllegalStateException("Shipment id was not generated");
      jdbcTemplate.update(
          """
          INSERT INTO cp_shipment_references (
            shipment_id, carrier_code, reference_type, reference_no_raw,
            reference_no_normalized, primary_reference
          ) VALUES (?, ?, ?, ?, ?, TRUE)
          """,
          generatedId.longValue(),
          carrier,
          referenceType,
          referenceNo,
          referenceNo
      );
      persistManualSnapshot(
          generatedId.longValue(), carrier, referenceType, referenceNo,
          trackingStatus, request, now, actor
      );
      auditService.shipment(actor, "CREATE_BUSINESS_SHIPMENT", generatedId.longValue(),
          "Created shipment " + referenceNo, ipAddress);
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment reference already exists");
    }
    return shipmentLookupService.requireAvailableShipment(publicId, actor);
  }

  public Map<String, Object> inspectShipmentImportConflicts(
      ShipmentImportConflictCheckRequest request,
      AuthenticatedUser actor
  ) {
    accessGuard.requireManager(actor);
    List<CreateBusinessShipmentRequest> shipments =
        request == null || request.shipments() == null ? List.of() : request.shipments();
    if (shipments.size() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At most 500 shipments can be checked");
    }

    Set<String> checkedIdentities = new LinkedHashSet<>();
    List<Map<String, Object>> conflicts = new ArrayList<>();
    int snapshotConflictCount = 0;
    for (CreateBusinessShipmentRequest shipment : shipments) {
      if (shipment == null) continue;
      String carrier = normalizeCarrier(shipment.carrier());
      String referenceType = normalizeReferenceType(shipment.referenceType(), carrier);
      String referenceNo = normalizeShipmentReference(
          carrier, referenceType, shipment.referenceNo()
      );
      String identity = ShipmentReferences.durableReferenceIdentity(carrier, referenceType, referenceNo);
      if (!checkedIdentities.add(identity)) continue;

      ShipmentRecord existing = shipmentLookupService.findShipmentByReference(carrier, referenceType, referenceNo);
      if (existing == null) continue;
      shipmentLookupService.requireShipmentAssignmentAuthority(existing, actor);
      Integer currentSnapshotCount = jdbcTemplate.queryForObject(
          """
          SELECT COUNT(*)
          FROM cp_shipments s
          JOIN cp_tracking_snapshots t ON t.id = s.current_snapshot_id
          WHERE s.id = ? AND t.invalidated_at IS NULL
          """,
          Integer.class,
          existing.id()
      );
      boolean hasCurrentSnapshot =
          currentSnapshotCount != null && currentSnapshotCount > 0;
      if (hasCurrentSnapshot) snapshotConflictCount += 1;

      Map<String, Object> conflict = new LinkedHashMap<>();
      conflict.put("shipmentId", existing.publicId());
      conflict.put("carrier", carrier);
      conflict.put("referenceType", referenceType);
      conflict.put("referenceNo", referenceNo);
      conflict.put("hasCurrentSnapshot", hasCurrentSnapshot);
      conflicts.add(conflict);
    }

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("checked", checkedIdentities.size());
    response.put("existingCount", conflicts.size());
    response.put("snapshotConflictCount", snapshotConflictCount);
    response.put("conflicts", conflicts);
    return response;
  }

  @Transactional
  public Map<String, Object> createAssignedShipment(
      AssignedBusinessShipmentRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    if (request == null || request.customerId() == null || request.customerId().isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Select a customer before creating a shipment");
    }
    lookupService.requireManaged(request.customerId(), actor);
    if (request.shipment() == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment is required");
    }
    CreateBusinessShipmentRequest shipmentRequest = request.shipment();
    String carrier = normalizeCarrier(shipmentRequest.carrier());
    String referenceType = normalizeReferenceType(shipmentRequest.referenceType(), carrier);
    String referenceNo = normalizeShipmentReference(
        carrier, referenceType, shipmentRequest.referenceNo()
    );
    boolean overwriteExisting = Boolean.TRUE.equals(request.overwriteExisting());
    ShipmentRecord existing = overwriteExisting
        ? shipmentLookupService.findShipmentByReference(carrier, referenceType, referenceNo)
        : null;
    Map<String, Object> saved;
    boolean overwritten = existing != null;
    if (overwritten) {
      shipmentLookupService.requireShipmentAssignmentAuthority(existing, actor);
      String incomingNote = hasText(shipmentRequest.note()) ? shipmentRequest.note() : null;
      updateShipment(
          existing.publicId(),
          new UpdateBusinessShipmentRequest(
              null, null, null, incomingNote
          ),
          actor,
          ipAddress
      );
      updateManualSnapshot(existing.publicId(), shipmentRequest, actor, ipAddress);
      saved = shipmentLookupService.requireAvailableShipment(existing.publicId(), actor);
    } else {
      saved = createShipment(shipmentRequest, actor, ipAddress);
    }
    Object rawShipmentId = saved.get("shipmentId");
    if (rawShipmentId == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Saved shipment id is unavailable");
    }
    String shipmentId = String.valueOf(rawShipmentId);
    bindingService.bindShipment(
        request.customerId(),
        new CustomerShipmentBindingRequest(shipmentId, null, null, null),
        actor,
        ipAddress
    );
    boolean publish = !Boolean.FALSE.equals(request.publishToCustomer());
    if (publish) {
      bindingService.setShipmentPublication(
          request.customerId(),
          shipmentId,
          new ShipmentPublicationRequest(true),
          actor,
          ipAddress
      );
    }
    Map<String, Object> response = new LinkedHashMap<>(saved);
    response.put("customerId", request.customerId());
    response.put("published", publish);
    response.put("overwritten", overwritten);
    return response;
  }

  private void persistManualSnapshot(
      long shipmentId,
      String carrier,
      String referenceType,
      String referenceNo,
      String requestedStatus,
      CreateBusinessShipmentRequest request,
      Instant now,
      AuthenticatedUser actor
  ) {
    lookupService.lockShipment(shipmentId);
    String status = requestedStatus == null ? "Pending update" : requestedStatus;
    String jobNumber = normalizeManualField(request.forwarderJobNumber(), 160);
    String vesselVoyage = normalizeManualField(request.vesselVoyage(), 240);
    String loadingPort = normalizeManualField(request.portOfLoading(), 160);
    String dischargePort = normalizeManualField(request.portOfDischarge(), 160);
    String clientPo = normalizeManualField(request.clientPoNumber(), 160);
    String etd = normalizeManualField(request.estimatedDeparture(), 80);
    String eta = normalizeManualField(request.estimatedArrival(), 80);
    String actualDeparture = normalizeManualField(request.actualDeparture(), 80);
    String actualArrival = normalizeManualField(request.actualArrival(), 80);
    String actualDelivery = normalizeManualField(request.actualDelivery(), 80);
    String currentLocation = normalizeManualField(request.currentLocation(), 160);
    String volume = normalizeManualField(request.volume(), 80);
    String clientCode = normalizeManualField(request.clientNameCode(), 160);
    String bookingNumber = normalizeManualField(request.bookingNumber(), 160);
    String billOfLading = normalizeManualField(request.billOfLading(), 160);
    String trafficTerm = normalizeManualField(request.trafficTerm(), 80);
    String estimatedDelivery = normalizeManualField(request.estimatedDelivery(), 80);
    String latestEventName = normalizeManualField(request.latestEventName(), 160);
    String latestEventTime = normalizeManualField(request.latestEventTime(), 80);
    String latestEventLocation = normalizeManualField(request.latestEventLocation(), 160);
    List<String> serviceScopes = normalizeManualServiceScopes(request.serviceScopes());
    List<ManualRouteNodeRequest> routeNodes = normalizeManualRouteNodes(request.routeNodes());
    List<ManualRoutingLegRequest> requestedRoutingLegs =
        normalizeManualRoutingLegs(request.routingLegs());
    List<ManualContainerSummaryRequest> containerTypes =
        normalizeManualContainerTypes(request.containerTypes());
    List<ManualContainerRequest> requestedContainers =
        normalizeManualContainers(request.containers());
    validateDetailedManualSnapshot(request, routeNodes, containerTypes);

    ManualRouteNodeRequest placeOfReceipt = manualRouteNode(routeNodes, "POR");
    ManualRouteNodeRequest firstLoadingPort = manualRouteNode(routeNodes, "FPOL", "POL");
    ManualRouteNodeRequest lastDischargePort = manualRouteNode(routeNodes, "LPOD", "POD");
    ManualRouteNodeRequest finalDestination = manualRouteNode(routeNodes, "FND");
    if (firstLoadingPort != null) loadingPort = firstLoadingPort.city();
    if (lastDischargePort != null) dischargePort = lastDischargePort.city();
    if (bookingNumber == null && "BOOKING".equals(referenceType)) bookingNumber = referenceNo;
    if (billOfLading == null && "BILLOFLADING".equals(referenceType)) billOfLading = referenceNo;
    if (latestEventName == null) latestEventName = status;
    if (latestEventLocation == null) latestEventLocation = currentLocation;
    if (latestEventTime == null) {
      latestEventTime = actualDelivery != null
          ? actualDelivery
          : actualArrival != null ? actualArrival : actualDeparture;
    }

    jdbcTemplate.update(
        """
        UPDATE cp_shipments
        SET job_number = COALESCE(?, job_number),
            client_po_number = COALESCE(?, client_po_number),
            client_name_code = COALESCE(?, client_name_code),
            original_bill_of_lading = COALESCE(?, original_bill_of_lading)
        WHERE id = ?
        """,
        jobNumber,
        clientPo,
        clientCode,
        "BILLOFLADING".equals(referenceType) ? referenceNo : null,
        shipmentId
    );

    ObjectNode snapshot = currentSnapshotCopy(shipmentId);
    objectField(snapshot, "provider").put("code", carrier);
    snapshot.put("channel", "MANUAL");
    snapshot.put("fetchedAt", now.toString());
    ObjectNode tracking = objectField(snapshot, "tracking");
    tracking.put("type", referenceType);
    tracking.put("number", referenceNo);
    tracking.put("status", status);
    ObjectNode summary = objectField(snapshot, "summary");
    if (bookingNumber != null) addUniqueManualText(arrayField(summary, "bookingNumbers"), bookingNumber);
    if (billOfLading != null) summary.put("billOfLading", billOfLading);
    ObjectNode latestEvent = objectField(summary, "latestEvent");
    latestEvent.put("name", latestEventName);
    putManualField(latestEvent, "location", latestEventLocation);
    putManualField(latestEvent, "occurredAt", latestEventTime);
    String originName = placeOfReceipt != null ? placeOfReceipt.city() : loadingPort;
    String destinationName = finalDestination != null ? finalDestination.city() : dischargePort;
    if (originName != null) objectField(summary, "origin").put("name", originName);
    if (destinationName != null) objectField(summary, "destination").put("name", destinationName);
    if (placeOfReceipt != null && placeOfReceipt.countryCode() != null) {
      objectField(summary, "origin").put("countryCode", placeOfReceipt.countryCode());
    }
    if (finalDestination != null && finalDestination.countryCode() != null) {
      objectField(summary, "destination").put("countryCode", finalDestination.countryCode());
    }
    putManualField(summary, "vesselVoyage", vesselVoyage);
    putManualField(summary, "volume", volume);
    putManualField(summary, "trafficTerm", trafficTerm);
    if (serviceScopes != null) {
      ArrayNode scopes = summary.putArray("serviceScopes");
      serviceScopes.forEach(scopes::add);
    }
    if (containerTypes != null) {
      ArrayNode containerSummary = summary.putArray("containers");
      for (ManualContainerSummaryRequest item : containerTypes) {
        ObjectNode value = containerSummary.addObject();
        value.put("containerType", item.type());
        value.put("quantity", item.quantity());
      }
    }

    ObjectNode references = objectField(snapshot, "references");
    if (bookingNumber != null) {
      addUniqueManualText(arrayField(references, "bookingNumbers"), bookingNumber);
    }
    if (billOfLading != null) references.put("masterBill", billOfLading);

    if (routeNodes != null && !routeNodes.isEmpty()) {
      ArrayNode route = snapshot.putArray("route");
      for (int index = 0; index < routeNodes.size(); index += 1) {
        ManualRouteNodeRequest item = routeNodes.get(index);
        ObjectNode node = route.addObject();
        node.put("sequence", index + 1);
        node.put("locationType", item.locationType());
        node.put("city", item.city());
        putManualField(node, "countryCode", item.countryCode());
        putManualField(node, "facilityCode", item.facilityCode());
        putManualField(node, "event", manualRouteEvent(item));
        putManualField(node, "estimatedTime", manualRouteEstimatedTime(
            item, etd, eta, estimatedDelivery
        ));
        putManualField(node, "actualTime", manualRouteActualTime(
            item, actualDeparture, actualArrival, actualDelivery
        ));
        putManualField(node, "timezone", item.timezone());
        if (latestEventLocation != null
            && latestEventLocation.equalsIgnoreCase(item.city())) {
          node.put("active", true);
        }
      }
    }

    if (requestedRoutingLegs != null && !requestedRoutingLegs.isEmpty()) {
      ArrayNode routingLegs = snapshot.putArray("routingLegs");
      for (int index = 0; index < requestedRoutingLegs.size(); index += 1) {
        ManualRoutingLegRequest item = requestedRoutingLegs.get(index);
        ObjectNode leg = routingLegs.addObject();
        leg.put("sequence", index + 1);
        putManualField(leg, "mode", item.mode());
        putManualField(leg, "vesselName", item.vesselName());
        putManualField(leg, "service", item.service());
        putManualField(leg, "voyage", item.voyage());
        putManualField(leg, "loadPort", item.loadPort());
        putManualField(leg, "loadCountryCode", item.loadCountryCode());
        putManualField(leg, "dischargePort", item.dischargePort());
        putManualField(leg, "dischargeCountryCode", item.dischargeCountryCode());
        putManualField(leg, "estimatedDeparture", item.estimatedDeparture());
        putManualField(leg, "actualDeparture", item.actualDeparture());
        putManualField(leg, "estimatedArrival", item.estimatedArrival());
        putManualField(leg, "actualArrival", item.actualArrival());
        putManualField(leg, "masterBill", item.masterBill());
      }
    } else if (vesselVoyage != null || loadingPort != null || dischargePort != null
        || etd != null || eta != null || actualDeparture != null || actualArrival != null) {
      ArrayNode routingLegs = arrayField(snapshot, "routingLegs");
      ObjectNode leg = routingLegs.size() > 0 && routingLegs.get(0).isObject()
          ? (ObjectNode) routingLegs.get(0)
          : routingLegs.insertObject(0);
      putManualField(leg, "vesselName", vesselVoyage);
      putManualField(leg, "estimatedDeparture", etd);
      putManualField(leg, "estimatedArrival", eta);
      putManualField(leg, "actualDeparture", actualDeparture);
      putManualField(leg, "actualArrival", actualArrival);
      putManualField(leg, "portOfLoading", loadingPort);
      putManualField(leg, "portOfDischarge", dischargePort);
      putManualField(leg, "loadPort", loadingPort);
      putManualField(leg, "dischargePort", dischargePort);
    }
    if (requestedContainers != null) {
      ArrayNode containers = snapshot.putArray("containers");
      for (ManualContainerRequest item : requestedContainers) {
        ObjectNode container = containers.addObject();
        putManualField(container, "number", item.number());
        putManualField(container, "type", item.type());
        putManualField(container, "transportMode", item.transportMode());
        putManualField(container, "trafficTerm", item.trafficTerm());
        putManualField(container, "currentLocation", item.currentLocation());
        putManualField(container, "latestEvent", item.latestEvent());
        putManualField(container, "latestEventTime", item.latestEventTime());
        container.putArray("milestones");
        container.put("detailSource", "BUSINESS_MANUAL");
      }
    }
    if (etd != null || eta != null || actualDeparture != null
        || actualArrival != null || actualDelivery != null || estimatedDelivery != null) {
      ObjectNode keyTimes = objectField(snapshot, "keyTimes");
      if (etd != null) {
        ObjectNode departure = objectField(keyTimes, "estimatedDeparture");
        departure.put("time", etd);
        if (loadingPort != null) departure.put("location", loadingPort);
      }
      if (eta != null) {
        ObjectNode arrival = objectField(keyTimes, "estimatedFinalArrival");
        arrival.put("time", eta);
        if (dischargePort != null) arrival.put("location", dischargePort);
      }
      if (actualDeparture != null) objectField(keyTimes, "actualDeparture").put("time", actualDeparture);
      if (actualArrival != null) objectField(keyTimes, "actualArrival").put("time", actualArrival);
      if (actualDelivery != null) objectField(keyTimes, "actualDelivery").put("time", actualDelivery);
      if (estimatedDelivery != null) {
        ObjectNode delivery = objectField(keyTimes, "estimatedDelivery");
        delivery.put("time", estimatedDelivery);
        if (destinationName != null) delivery.put("location", destinationName);
      }
    }
    ArrayNode extra = arrayField(snapshot, "extraInformation");
    addManualExtra(extra, "vesselVoyage", vesselVoyage);
    addManualExtra(extra, "portOfLoading", loadingPort);
    addManualExtra(extra, "portOfDischarge", dischargePort);
    addManualExtra(extra, "estimatedDeparture", etd);
    addManualExtra(extra, "estimatedArrival", eta);
    addManualExtra(extra, "actualDeparture", actualDeparture);
    addManualExtra(extra, "actualArrival", actualArrival);
    addManualExtra(extra, "actualDelivery", actualDelivery);
    addManualExtra(extra, "currentLocation", currentLocation);
    addManualExtra(extra, "volume", volume);
    addManualExtra(extra, "trafficTerm", trafficTerm);
    addManualExtra(extra, "estimatedDelivery", estimatedDelivery);

    String snapshotJson;
    try {
      snapshotJson = objectMapper.writeValueAsString(snapshot);
    } catch (JsonProcessingException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize manual shipment data");
    }
    String payloadSha = sha256(snapshotJson);
    List<Long> activeSnapshotIds = jdbcTemplate.query(
        """
        SELECT id FROM cp_tracking_snapshots
        WHERE shipment_id = ? AND queried_by = ?
          AND query_reference_type = ? AND query_reference_no = ?
          AND invalidated_at IS NULL
        ORDER BY id DESC LIMIT 1 FOR UPDATE
        """,
        (rs, rowNumber) -> rs.getLong("id"),
        shipmentId, actor.id(), referenceType, referenceNo
    );
    long snapshotId;
    if (activeSnapshotIds.isEmpty()) {
      KeyHolder snapshotKeyHolder = new GeneratedKeyHolder();
      jdbcTemplate.update(connection -> {
        PreparedStatement statement = connection.prepareStatement(
            """
            INSERT INTO cp_tracking_snapshots (
              shipment_id, query_reference_type, query_reference_no, queried_by,
              queried_by_username, source_channel, snapshot_json, strategy_json,
              payload_sha256, fetched_at, fresh_until, created_at
            ) VALUES (?, ?, ?, ?, ?, 'MANUAL', ?, NULL, ?, ?, ?, ?)
            """,
            Statement.RETURN_GENERATED_KEYS
        );
        statement.setLong(1, shipmentId);
        statement.setString(2, referenceType);
        statement.setString(3, referenceNo);
        statement.setLong(4, actor.id());
        statement.setString(5, actor.username());
        statement.setString(6, snapshotJson);
        statement.setString(7, payloadSha);
        statement.setTimestamp(8, Timestamp.from(now));
        statement.setTimestamp(9, Timestamp.from(now));
        statement.setTimestamp(10, Timestamp.from(now));
        return statement;
      }, snapshotKeyHolder);
      Number key = snapshotKeyHolder.getKey();
      if (key == null) {
        throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save manual shipment data");
      }
      snapshotId = key.longValue();
    } else {
      snapshotId = activeSnapshotIds.get(0);
      jdbcTemplate.update(
          """
          UPDATE cp_tracking_snapshots
          SET shipment_id = ?, queried_by_username = ?, source_channel = 'MANUAL',
              snapshot_json = ?, strategy_json = NULL, payload_sha256 = ?,
              fetched_at = ?, fresh_until = ?
          WHERE id = ?
          """,
          shipmentId, actor.username(), snapshotJson, payloadSha,
          Timestamp.from(now), Timestamp.from(now), snapshotId
      );
    }
    jdbcTemplate.update(
        """
        UPDATE cp_shipments
        SET current_snapshot_id = ?, tracking_status = ?, last_tracked_at = ?,
            fresh_until = ?, updated_at = ?
        WHERE id = ?
        """,
        snapshotId, status, Timestamp.from(now), Timestamp.from(now),
        Timestamp.from(now), shipmentId
    );
    jdbcTemplate.update(
        "UPDATE cp_customer_shipment_access SET publication_status = 'DRAFT', published_at = NULL, published_by = NULL WHERE shipment_id = ?",
        shipmentId
    );
  }

  private List<String> normalizeManualServiceScopes(List<String> requested) {
    if (requested == null) return null;
    if (requested.size() > 12) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Too many shipment service types");
    }
    LinkedHashSet<String> values = new LinkedHashSet<>();
    for (String requestedValue : requested) {
      String value = normalizeManualField(requestedValue, 40);
      if (value != null) values.add(value.toUpperCase(Locale.ROOT));
    }
    return List.copyOf(values);
  }

  private void validateDetailedManualSnapshot(
      CreateBusinessShipmentRequest request,
      List<ManualRouteNodeRequest> routeNodes,
      List<ManualContainerSummaryRequest> containerTypes
  ) {
    if (request.routeNodes() != null) {
      Set<String> types = routeNodes == null
          ? Set.of()
          : routeNodes.stream()
              .map(ManualRouteNodeRequest::locationType)
              .collect(java.util.stream.Collectors.toSet());
      if (!types.containsAll(List.of("POR", "FPOL", "LPOD", "FND"))) {
        throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "Manual route must include POR, FPOL, LPOD, and FND"
        );
      }
    }
    if (request.containerTypes() != null
        && (containerTypes == null || containerTypes.isEmpty())) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "At least one container type and quantity is required"
      );
    }
  }

  private List<ManualRouteNodeRequest> normalizeManualRouteNodes(
      List<ManualRouteNodeRequest> requested
  ) {
    if (requested == null) return null;
    if (requested.size() > 20) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A manual route cannot exceed 20 nodes");
    }
    List<ManualRouteNodeRequest> values = new ArrayList<>();
    for (ManualRouteNodeRequest item : requested) {
      if (item == null) continue;
      String city = normalizeManualField(item.city(), 160);
      if (city == null) continue;
      String locationType = normalizeManualField(item.locationType(), 32);
      values.add(new ManualRouteNodeRequest(
          locationType == null ? "WAYPOINT" : locationType.toUpperCase(Locale.ROOT),
          city,
          normalizeCountryCode(item.countryCode()),
          normalizeManualField(item.facilityCode(), 160),
          normalizeManualField(item.event(), 160),
          normalizeManualField(item.estimatedTime(), 80),
          normalizeManualField(item.actualTime(), 80),
          normalizeManualField(item.timezone(), 40)
      ));
    }
    return List.copyOf(values);
  }

  private List<ManualRoutingLegRequest> normalizeManualRoutingLegs(
      List<ManualRoutingLegRequest> requested
  ) {
    if (requested == null) return null;
    if (requested.size() > 50) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A manual shipment cannot exceed 50 routing legs");
    }
    List<ManualRoutingLegRequest> values = new ArrayList<>();
    for (ManualRoutingLegRequest item : requested) {
      if (item == null) continue;
      String mode = normalizeManualField(item.mode(), 40);
      String vesselName = normalizeManualField(item.vesselName(), 160);
      String service = normalizeManualField(item.service(), 120);
      String voyage = normalizeManualField(item.voyage(), 120);
      String loadPort = normalizeManualField(item.loadPort(), 160);
      String dischargePort = normalizeManualField(item.dischargePort(), 160);
      String etd = normalizeManualField(item.estimatedDeparture(), 80);
      String atd = normalizeManualField(item.actualDeparture(), 80);
      String eta = normalizeManualField(item.estimatedArrival(), 80);
      String ata = normalizeManualField(item.actualArrival(), 80);
      String masterBill = normalizeManualField(item.masterBill(), 160);
      if (mode == null && vesselName == null && service == null && voyage == null
          && loadPort == null && dischargePort == null && etd == null && atd == null
          && eta == null && ata == null && masterBill == null) {
        continue;
      }
      values.add(new ManualRoutingLegRequest(
          mode == null ? null : mode.toUpperCase(Locale.ROOT),
          vesselName,
          service,
          voyage,
          loadPort,
          normalizeCountryCode(item.loadCountryCode()),
          dischargePort,
          normalizeCountryCode(item.dischargeCountryCode()),
          etd,
          atd,
          eta,
          ata,
          masterBill
      ));
    }
    return List.copyOf(values);
  }

  private List<ManualContainerSummaryRequest> normalizeManualContainerTypes(
      List<ManualContainerSummaryRequest> requested
  ) {
    if (requested == null) return null;
    if (requested.size() > 20) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A manual shipment cannot exceed 20 container types");
    }
    List<ManualContainerSummaryRequest> values = new ArrayList<>();
    for (ManualContainerSummaryRequest item : requested) {
      if (item == null) continue;
      String type = normalizeManualField(item.type(), 40);
      if (type == null) continue;
      int quantity = item.quantity() == null ? 1 : item.quantity();
      if (quantity < 1 || quantity > 999) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Container quantity must be between 1 and 999");
      }
      values.add(new ManualContainerSummaryRequest(
          type.toUpperCase(Locale.ROOT),
          quantity
      ));
    }
    return List.copyOf(values);
  }

  private List<ManualContainerRequest> normalizeManualContainers(
      List<ManualContainerRequest> requested
  ) {
    if (requested == null) return null;
    if (requested.size() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A manual shipment cannot exceed 500 containers");
    }
    List<ManualContainerRequest> values = new ArrayList<>();
    for (ManualContainerRequest item : requested) {
      if (item == null) continue;
      String number = normalizeManualField(item.number(), 40);
      String type = normalizeManualField(item.type(), 40);
      String mode = normalizeManualField(item.transportMode(), 40);
      String terms = normalizeManualField(item.trafficTerm(), 80);
      String location = normalizeManualField(item.currentLocation(), 160);
      String latestEvent = normalizeManualField(item.latestEvent(), 160);
      String latestEventTime = normalizeManualField(item.latestEventTime(), 80);
      if (number == null && type == null && mode == null && terms == null
          && location == null && latestEvent == null && latestEventTime == null) {
        continue;
      }
      values.add(new ManualContainerRequest(
          number == null ? null : number.toUpperCase(Locale.ROOT),
          type == null ? null : type.toUpperCase(Locale.ROOT),
          mode == null ? null : mode.toUpperCase(Locale.ROOT),
          terms,
          location,
          latestEvent,
          latestEventTime
      ));
    }
    return List.copyOf(values);
  }

  private String normalizeCountryCode(String value) {
    String normalized = normalizeManualField(value, 2);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private ManualRouteNodeRequest manualRouteNode(
      List<ManualRouteNodeRequest> nodes,
      String... locationTypes
  ) {
    if (nodes == null || nodes.isEmpty()) return null;
    Set<String> expected = Set.of(locationTypes);
    return nodes.stream()
        .filter(node -> expected.contains(node.locationType()))
        .findFirst()
        .orElse(null);
  }

  private String manualRouteEvent(ManualRouteNodeRequest node) {
    if (node.event() != null) return node.event();
    return switch (node.locationType()) {
      case "POR" -> "Place of Receipt";
      case "FPOL", "POL" -> "Estimated Time of Departure";
      case "LPOD", "POD" -> "Estimated Time of Arrival";
      case "FND" -> "Cargo Pickup Estimated Time";
      default -> "Transshipment";
    };
  }

  private String manualRouteEstimatedTime(
      ManualRouteNodeRequest node,
      String estimatedDeparture,
      String estimatedArrival,
      String estimatedDelivery
  ) {
    if (node.estimatedTime() != null) return node.estimatedTime();
    return switch (node.locationType()) {
      case "FPOL", "POL" -> estimatedDeparture;
      case "LPOD", "POD" -> estimatedArrival;
      case "FND" -> estimatedDelivery;
      default -> null;
    };
  }

  private String manualRouteActualTime(
      ManualRouteNodeRequest node,
      String actualDeparture,
      String actualArrival,
      String actualDelivery
  ) {
    if (node.actualTime() != null) return node.actualTime();
    return switch (node.locationType()) {
      case "FPOL", "POL" -> actualDeparture;
      case "LPOD", "POD" -> actualArrival;
      case "FND" -> actualDelivery;
      default -> null;
    };
  }

  private void addUniqueManualText(ArrayNode values, String value) {
    if (value == null) return;
    for (JsonNode existing : values) {
      if (value.equalsIgnoreCase(existing.asText())) return;
    }
    values.add(value);
  }

  private String normalizeManualField(String value, int maxLength) {
    if (value == null) return null;
    String normalized = value.replaceAll("\\s+", " ").trim();
    if (normalized.isBlank()) return null;
    if (normalized.length() > maxLength) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Manual shipment field is too long");
    }
    return normalized;
  }

  private void putManualField(ObjectNode node, String name, String value) {
    if (value != null) node.put(name, value);
  }

  private void addManualExtra(ArrayNode values, String key, String value) {
    if (value == null) return;
    ObjectNode item = null;
    for (JsonNode existing : values) {
      if (existing.isObject() && key.equals(existing.path("key").asText())) {
        item = (ObjectNode) existing;
        break;
      }
    }
    if (item == null) item = values.addObject();
    item.put("key", key);
    item.put("value", value);
    item.put("source", "BUSINESS_MANUAL");
  }

  private ObjectNode currentSnapshotCopy(long shipmentId) {
    List<String> values = jdbcTemplate.query(
        """
        SELECT t.snapshot_json
        FROM cp_shipments s
        JOIN cp_tracking_snapshots t
          ON t.id = s.current_snapshot_id AND t.invalidated_at IS NULL
        WHERE s.id = ?
        LIMIT 1
        """,
        (rs, rowNumber) -> rs.getString("snapshot_json"),
        shipmentId
    );
    if (!values.isEmpty() && values.get(0) != null && !values.get(0).isBlank()) {
      try {
        JsonNode current = objectMapper.readTree(values.get(0));
        if (current != null && current.isObject()) return ((ObjectNode) current).deepCopy();
      } catch (JsonProcessingException ignored) {
        // A malformed payload cannot be used as a safe merge base.
      }
    }
    return objectMapper.createObjectNode();
  }

  private ObjectNode objectField(ObjectNode parent, String field) {
    JsonNode current = parent.get(field);
    if (current != null && current.isObject()) return (ObjectNode) current;
    ObjectNode created = objectMapper.createObjectNode();
    parent.set(field, created);
    return created;
  }

  private ArrayNode arrayField(ObjectNode parent, String field) {
    JsonNode current = parent.get(field);
    if (current != null && current.isArray()) return (ArrayNode) current;
    ArrayNode created = objectMapper.createArrayNode();
    parent.set(field, created);
    return created;
  }

  private String sha256(String value) {
    try {
      return HexFormat.of().formatHex(
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))
      );
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 is unavailable", error);
    }
  }

  @Transactional
  public Map<String, Object> updateShipment(
      String shipmentPublicId,
      UpdateBusinessShipmentRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    ShipmentRecord shipment = shipmentLookupService.requireShipment(shipmentPublicId);
    shipmentLookupService.requireShipmentAssignmentAuthority(shipment, actor);
    BusinessShipmentRecord existing = requireBusinessShipment(shipment.id());
    if (request == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment update is required");

    String referenceType = request.referenceType() == null
        ? existing.referenceType()
        : normalizeReferenceType(request.referenceType(), shipment.carrier());
    String referenceNo = request.referenceNo() == null
        ? existing.referenceNo()
        : normalizeShipmentReference(shipment.carrier(), referenceType, request.referenceNo());
    boolean referenceChanged = !referenceType.equals(existing.referenceType())
        || !referenceNo.equals(ShipmentReferences.normalizeReference(existing.referenceNo()));
    if (referenceChanged) {
      assertReferenceIdentityAvailable(
          shipment.carrier(), referenceType, referenceNo, shipment.id()
      );
    }
    // Tracking status belongs to the manual/live snapshot workflow. The base shipment endpoint
    // deliberately ignores legacy trackingStatus input so the row and current snapshot cannot
    // diverge.
    String trackingStatus = existing.trackingStatus();
    String note = request.note() == null
        ? existing.note()
        : normalizeShipmentNote(request.note(), null);
    Instant now = Instant.now();
    try {
      jdbcTemplate.update(
          """
          UPDATE cp_shipment_references
          SET reference_type = ?, reference_no_raw = ?, reference_no_normalized = ?
          WHERE id = ?
          """,
          referenceType,
          referenceNo,
          referenceNo,
          existing.referenceId()
      );
      if (referenceChanged) {
        jdbcTemplate.update(
            """
            UPDATE cp_shipments
            SET current_snapshot_id = NULL, tracking_status = ?, business_note = ?,
                last_tracked_at = NULL, fresh_until = NULL, updated_at = ?
            WHERE id = ?
            """,
            trackingStatus,
            note,
            Timestamp.from(now),
            shipment.id()
        );
        jdbcTemplate.update(
            "UPDATE cp_customer_shipment_access SET publication_status = 'DRAFT', published_at = NULL, published_by = NULL WHERE shipment_id = ?",
            shipment.id()
        );
      } else {
        jdbcTemplate.update(
            "UPDATE cp_shipments SET tracking_status = ?, business_note = ?, updated_at = ? WHERE id = ?",
            trackingStatus,
            note,
            Timestamp.from(now),
            shipment.id()
        );
      }
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment reference already exists");
    }
    auditService.shipment(actor, "UPDATE_BUSINESS_SHIPMENT", shipment.id(),
        "Updated shipment " + referenceNo, ipAddress);
    return shipmentLookupService.requireAvailableShipment(shipment.publicId(), actor);
  }

  @Transactional
  public Map<String, Object> updateManualSnapshot(
      String shipmentPublicId,
      CreateBusinessShipmentRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    if (request == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Manual shipment data is required");
    ShipmentRecord shipment = shipmentLookupService.requireShipment(shipmentPublicId);
    shipmentLookupService.requireShipmentAssignmentAuthority(shipment, actor);
    BusinessShipmentRecord existing = requireBusinessShipment(shipment.id());
    if (!hasManualSnapshotChanges(request)) {
      return shipmentLookupService.requireAvailableShipment(shipment.publicId(), actor);
    }
    String status = normalizeTrackingStatus(request.trackingStatus(), existing.trackingStatus());
    Instant now = Instant.now();
    persistManualSnapshot(
        shipment.id(), shipment.carrier(), existing.referenceType(),
        ShipmentReferences.normalizeReference(existing.referenceNo()), status, request, now, actor
    );
    auditService.shipment(actor, "UPDATE_MANUAL_SHIPMENT_SNAPSHOT", shipment.id(),
        "Updated manual shipment data " + existing.referenceNo(), ipAddress);
    return shipmentLookupService.requireAvailableShipment(shipment.publicId(), actor);
  }

  /**
   * Updates the three operator-owned card fields without touching the carrier snapshot. All
   * targets are authorized and normalized before the first write so the batch is transactional.
   */
  @Transactional
  public Map<String, Object> updateShipmentBusinessFields(
      ShipmentBusinessFieldsBatchUpdateRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    List<ShipmentBusinessFieldsUpdateItem> requested = request == null
        ? null
        : request.items();
    if (requested == null || requested.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one shipment is required");
    }
    if (requested.size() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A shipment batch cannot exceed 500 rows");
    }

    List<ShipmentBusinessFieldsTarget> targets = new ArrayList<>();
    Set<String> shipmentIds = new LinkedHashSet<>();
    for (ShipmentBusinessFieldsUpdateItem item : requested) {
      String shipmentPublicId = item == null || item.shipmentId() == null
          ? ""
          : item.shipmentId().trim();
      if (shipmentPublicId.isBlank() || !shipmentIds.add(shipmentPublicId)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment ids must be present and unique");
      }
      ShipmentRecord shipment = shipmentLookupService.requireShipment(shipmentPublicId);
      shipmentLookupService.requireShipmentAssignmentAuthority(shipment, actor);
      targets.add(new ShipmentBusinessFieldsTarget(
          shipment,
          normalizeManualField(item.forwarderJobNumber(), 160),
          normalizeManualField(item.clientPoNumber(), 160),
          normalizeManualField(item.clientNameCode(), 160)
      ));
    }

    Instant now = Instant.now();
    for (ShipmentBusinessFieldsTarget target : targets) {
      lookupService.lockShipment(target.shipment().id());
      jdbcTemplate.update(
          """
          UPDATE cp_shipments
          SET job_number = ?, client_po_number = ?, client_name_code = ?, updated_at = ?
          WHERE id = ?
          """,
          target.jobNumber(),
          target.clientPoNumber(),
          target.clientNameCode(),
          Timestamp.from(now),
          target.shipment().id()
      );
      auditService.shipment(
          actor,
          "BATCH_UPDATE_SHIPMENT_BUSINESS_FIELDS",
          target.shipment().id(),
          "Updated operator-owned business fields for " + target.shipment().publicId(),
          ipAddress
      );
    }
    return Map.of(
        "updated", targets.size(),
        "shipmentIds", List.copyOf(shipmentIds)
    );
  }

  private boolean hasManualSnapshotChanges(CreateBusinessShipmentRequest request) {
    return hasText(request.trackingStatus())
        || hasText(request.forwarderJobNumber())
        || hasText(request.vesselVoyage())
        || hasText(request.portOfLoading())
        || hasText(request.portOfDischarge())
        || hasText(request.clientPoNumber())
        || hasText(request.estimatedDeparture())
        || hasText(request.estimatedArrival())
        || hasText(request.actualDeparture())
        || hasText(request.actualArrival())
        || hasText(request.actualDelivery())
        || hasText(request.currentLocation())
        || hasText(request.volume())
        || hasText(request.clientNameCode())
        || hasText(request.bookingNumber())
        || hasText(request.billOfLading())
        || hasText(request.trafficTerm())
        || hasText(request.estimatedDelivery())
        || hasText(request.latestEventName())
        || hasText(request.latestEventTime())
        || hasText(request.latestEventLocation())
        || (request.serviceScopes() != null && !request.serviceScopes().isEmpty())
        || (request.routeNodes() != null && !request.routeNodes().isEmpty())
        || (request.routingLegs() != null && !request.routingLegs().isEmpty())
        || (request.containerTypes() != null && !request.containerTypes().isEmpty())
        || (request.containers() != null && !request.containers().isEmpty());
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }

  @Transactional
  public Map<String, Object> deleteShipment(
      String shipmentPublicId,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    ShipmentRecord shipment = shipmentLookupService.requireShipment(shipmentPublicId);
    shipmentLookupService.requireShipmentAssignmentAuthority(shipment, actor);
    Integer fileCount = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM cp_shipment_files WHERE shipment_id = ? AND status <> 'DELETED'",
        Integer.class,
        shipment.id()
    );
    if (fileCount != null && fileCount > 0) {
      throw new ApiException(HttpStatus.CONFLICT, "Remove shipment files before deleting this shipment");
    }
    auditService.shipment(actor, "DELETE_BUSINESS_SHIPMENT", shipment.id(),
        "Deleted shipment " + shipment.publicId(), ipAddress);
    jdbcTemplate.update(
        "DELETE FROM cp_shipment_file_audit WHERE shipment_id = ?",
        shipment.id()
    );
    jdbcTemplate.update(
        "DELETE FROM cp_shipment_files WHERE shipment_id = ? AND status = 'DELETED'",
        shipment.id()
    );
    jdbcTemplate.update("DELETE FROM cp_shipments WHERE id = ?", shipment.id());
    return Map.of("deleted", true, "shipmentId", shipment.publicId());
  }

  @Transactional
  public Map<String, Object> updateShipmentNote(
      String shipmentPublicId,
      String note,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireOperationsReader(actor);
    ShipmentRecord shipment = shipmentLookupService.requireShipment(shipmentPublicId);
    shipmentLookupService.requireShipmentAssignmentAuthority(shipment, actor);
    String normalized = note == null ? "" : note.trim();
    if (normalized.length() > 2000) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment note must not exceed 2000 characters");
    }
    Instant updatedAt = Instant.now();
    jdbcTemplate.update(
        "UPDATE cp_shipments SET business_note = ?, updated_at = ? WHERE id = ?",
        normalized.isBlank() ? null : normalized,
        Timestamp.from(updatedAt),
        shipment.id()
    );
    auditService.shipment(actor, "UPDATE_SHIPMENT_NOTE", shipment.id(), "Updated shipment note", ipAddress);
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("shipmentId", shipment.publicId());
    value.put("note", normalized);
    value.put("updatedAt", updatedAt.toString());
    return value;
  }

  @Transactional
  public Map<String, Object> invalidateCurrentSnapshot(
      String shipmentPublicId,
      SnapshotInvalidationRequest request,
      AuthenticatedUser actor,
      String ipAddress
  ) {
    accessGuard.requireManager(actor);
    ShipmentRecord shipment = shipmentLookupService.requireShipment(shipmentPublicId);
    shipmentLookupService.requireShipmentAssignmentAuthority(shipment, actor);
    String reason = request == null || request.reason() == null ? "" : request.reason().trim();
    if (reason.isBlank() || reason.length() > 500) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalidation reason must contain 1-500 characters");
    }
    Long snapshotId = jdbcTemplate.queryForObject(
        // Refresh persistence takes the shipment lock before touching snapshots too.
        "SELECT current_snapshot_id FROM cp_shipments WHERE id = ? FOR UPDATE",
        Long.class,
        shipment.id()
    );
    if (snapshotId == null) throw new ApiException(HttpStatus.CONFLICT, "Shipment has no current snapshot");
    Instant now = Instant.now();
    int invalidated = jdbcTemplate.update(
        "UPDATE cp_tracking_snapshots SET invalidated_at = ?, invalidated_by = ?, invalidation_reason = ? WHERE id = ? AND shipment_id = ? AND invalidated_at IS NULL",
        Timestamp.from(now), actor.id(), reason, snapshotId, shipment.id()
    );
    if (invalidated != 1) {
      throw new ApiException(HttpStatus.CONFLICT, "Current snapshot is no longer valid");
    }
    int cleared = jdbcTemplate.update(
        "UPDATE cp_shipments SET current_snapshot_id = NULL, tracking_status = 'Needs review', last_tracked_at = NULL, fresh_until = NULL, updated_at = ? WHERE id = ? AND current_snapshot_id = ?",
        Timestamp.from(now), shipment.id(), snapshotId
    );
    if (cleared != 1) {
      throw new ApiException(HttpStatus.CONFLICT, "Current snapshot changed during invalidation");
    }
    jdbcTemplate.update(
        "UPDATE cp_customer_shipment_access SET publication_status = 'DRAFT', published_at = NULL, published_by = NULL WHERE shipment_id = ?",
        shipment.id()
    );
    auditService.shipment(actor, "INVALIDATE_TRACKING_SNAPSHOT", shipment.id(), reason, ipAddress);
    return Map.of(
        "shipmentId", shipment.publicId(),
        "invalidated", true,
        "snapshotId", snapshotId,
        "status", "Needs review"
    );
  }

  private String normalizeCarrier(String value) {
    String normalized = inputRules.normalizeCode(value, "COSCO");
    if (!CARRIERS.contains(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported carrier");
    }
    return normalized;
  }

  private String normalizeTrackingStatus(String value, String fallback) {
    String normalized = value == null ? fallback : value.trim();
    if (normalized != null && normalized.length() > 80) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Tracking status must not exceed 80 characters");
    }
    return normalized == null || normalized.isBlank() ? null : normalized;
  }

  private String normalizeShipmentNote(String value, String fallback) {
    String normalized = value == null ? fallback : value.trim();
    if (normalized != null && normalized.length() > 2000) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment note must not exceed 2000 characters");
    }
    return normalized == null || normalized.isBlank() ? null : normalized;
  }

  private BusinessShipmentRecord requireBusinessShipment(long shipmentId) {
    List<BusinessShipmentRecord> records = jdbcTemplate.query(
        """
        SELECT s.tracking_status, s.business_note,
               r.id AS reference_id, r.reference_type, r.reference_no_raw
        FROM cp_shipments s
        JOIN cp_shipment_references r ON r.id = (
          SELECT r2.id FROM cp_shipment_references r2
          WHERE r2.shipment_id = s.id
          ORDER BY CASE WHEN r2.reference_type = 'BOOKING' THEN 0 ELSE 1 END,
                   r2.primary_reference DESC, r2.id ASC LIMIT 1
        )
        WHERE s.id = ?
        """,
        (rs, rowNumber) -> new BusinessShipmentRecord(
            rs.getLong("reference_id"),
            rs.getString("reference_type"),
            rs.getString("reference_no_raw"),
            rs.getString("tracking_status"),
            rs.getString("business_note")
        ),
        shipmentId
    );
    if (records.isEmpty()) throw new ApiException(HttpStatus.CONFLICT, "Shipment has no primary reference");
    return records.get(0);
  }

  private String normalizeReferenceType(String value) {
    return normalizeReferenceType(value, "COSCO");
  }

  private String normalizeReferenceType(String value, String carrier) {
    String normalized = inputRules.normalizeCode(value, "BOOKING");
    if (!com.cargoplanner.backend.shipment.TrackingCarriers.supportsReference(carrier, normalized)) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "New and updated shipments must use the booking number; the bill of lading is supplementary data only"
      );
    }
    return normalized;
  }

  private String normalizeShipmentReference(String carrier, String type, String value) {
    String normalized = ShipmentReferences.normalizeReference(value);
    if ("COSCO".equals(carrier)
        && ("BOOKING".equals(type) || "BILLOFLADING".equals(type))
        && normalized.matches("COSU[0-9]{6,20}")) {
      normalized = normalized.substring(4);
    }
    if (!normalized.matches("[A-Z0-9-]{4,35}")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Shipment number format is invalid");
    }
    return normalized;
  }

  private void assertReferenceIdentityAvailable(
      String carrier,
      String type,
      String referenceNo,
      Long excludedShipmentId
  ) {
    String normalized = ShipmentReferences.normalizeReference(referenceNo);
    boolean sharedCoscoIdentity = ShipmentReferences.isSharedCoscoNumericIdentity(carrier, type, normalized);
    String canonical = sharedCoscoIdentity && normalized.startsWith("COSU")
        ? normalized.substring(4)
        : normalized;
    String sql = sharedCoscoIdentity
        ? """
          SELECT COUNT(*) FROM cp_shipment_references
          WHERE carrier_code = ?
            AND reference_type IN ('BOOKING', 'BILLOFLADING')
            AND reference_no_normalized IN (?, ?)
          """
        : """
          SELECT COUNT(*) FROM cp_shipment_references
          WHERE carrier_code = ? AND reference_type = ? AND reference_no_normalized = ?
          """;
    List<Object> parameters = new ArrayList<>();
    parameters.add(carrier);
    if (sharedCoscoIdentity) {
      parameters.add(canonical);
      parameters.add("COSU" + canonical);
    } else {
      parameters.add(type);
      parameters.add(normalized);
    }
    if (excludedShipmentId != null) {
      sql += " AND shipment_id <> ?";
      parameters.add(excludedShipmentId);
    }
    Integer count = jdbcTemplate.queryForObject(sql, Integer.class, parameters.toArray());
    if (count != null && count > 0) {
      throw new ApiException(HttpStatus.CONFLICT, "Shipment reference already exists");
    }
  }


  private record ShipmentBusinessFieldsTarget(
      ShipmentRecord shipment,
      String jobNumber,
      String clientPoNumber,
      String clientNameCode
  ) {}

  private record BusinessShipmentRecord(
      long referenceId,
      String referenceType,
      String referenceNo,
      String trackingStatus,
      String note
  ) {}
}
