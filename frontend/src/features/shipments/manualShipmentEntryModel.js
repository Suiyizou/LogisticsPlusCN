import { reactive } from "vue";
import { emptyManualShipmentFields } from "./useShipmentDetail.js";

export function createManualShipmentEntryModel(t) {
  let manualEntryKeySeed = 0;
  const manualServiceOptions = [
    { value: "OCEAN", labelKey: "customers.serviceOcean" },
    { value: "INLAND", labelKey: "customers.serviceInland" },
    { value: "CUSTOMS", labelKey: "customers.serviceCustoms" },
    { value: "WAREHOUSE", labelKey: "customers.serviceWarehouse" }
  ];
  const shipmentCreateForm = reactive({
    carrier: "COSCO",
    referenceType: "BOOKING",
    referenceNo: "",
    trackingStatus: "",
    note: "",
    ...emptyManualShipmentFields(),
    ...emptyDetailedManualShipmentFields()
  });
  function nextManualEntryKey(prefix) {
    manualEntryKeySeed += 1;
    return `${prefix}-${manualEntryKeySeed}`;
  }

  function createManualRouteNode(locationType, options = {}) {
    return {
      key: nextManualEntryKey("route"),
      locationType,
      city: "",
      countryCode: "",
      facilityCode: "",
      event: "",
      estimatedTime: "",
      actualTime: "",
      timezone: "",
      required: options.required === true,
      optional: options.optional === true
    };
  }

  function createManualContainerType() {
    return {
      key: nextManualEntryKey("container-type"),
      type: "",
      quantity: 1
    };
  }

  function createManualRoutingLeg() {
    const loadingPort =
      shipmentCreateForm.routeNodes.find((node) => ["FPOL", "POL"].includes(node.locationType))
        ?.city || "";
    const dischargePort =
      shipmentCreateForm.routeNodes.find((node) => ["LPOD", "POD"].includes(node.locationType))
        ?.city || "";
    return {
      key: nextManualEntryKey("routing-leg"),
      mode: "SEA",
      vesselName: "",
      service: "",
      voyage: "",
      loadPort: loadingPort,
      loadCountryCode: "",
      dischargePort,
      dischargeCountryCode: "",
      estimatedDeparture: "",
      actualDeparture: "",
      estimatedArrival: "",
      actualArrival: "",
      masterBill: ""
    };
  }

  function createManualContainer() {
    return {
      key: nextManualEntryKey("container"),
      number: "",
      type: shipmentCreateForm.containerTypes[0]?.type || "",
      transportMode: "",
      trafficTerm: shipmentCreateForm.trafficTerm || "",
      currentLocation: "",
      latestEvent: "",
      latestEventTime: ""
    };
  }

  function emptyDetailedManualShipmentFields() {
    return {
      bookingNumber: "",
      billOfLading: "",
      trafficTerm: "",
      serviceScopes: ["OCEAN"],
      estimatedDelivery: "",
      latestEventName: "",
      latestEventTime: "",
      latestEventLocation: "",
      routeNodes: [
        createManualRouteNode("POR", { required: true }),
        createManualRouteNode("FPOL", { required: true }),
        createManualRouteNode("LPOD", { required: true }),
        createManualRouteNode("FND", { required: true })
      ],
      routingLegs: [],
      containerTypes: [createManualContainerType()],
      containers: []
    };
  }

  function manualRouteNodeLabel(locationType) {
    const keys = {
      POR: "customers.routePlaceOfReceipt",
      FPOL: "customers.routeFirstLoadingPort",
      LPOD: "customers.routeLastDischargePort",
      FND: "customers.routeFinalDestination",
      TSP: "customers.routeTransshipment"
    };
    return t(keys[locationType] || "customers.routeTransshipment");
  }

  function addManualTransshipment() {
    const node = createManualRouteNode("TSP", { optional: true });
    const finalDischargeIndex = shipmentCreateForm.routeNodes.findIndex((item) =>
      ["LPOD", "POD"].includes(item.locationType)
    );
    const insertAt =
      finalDischargeIndex < 0
        ? Math.max(0, shipmentCreateForm.routeNodes.length - 1)
        : finalDischargeIndex;
    shipmentCreateForm.routeNodes.splice(insertAt, 0, node);
  }

  function removeManualRouteNode(index) {
    const node = shipmentCreateForm.routeNodes[index];
    if (!node?.optional) return;
    shipmentCreateForm.routeNodes.splice(index, 1);
  }

  function addManualContainerType() {
    shipmentCreateForm.containerTypes.push(createManualContainerType());
  }

  function addManualRoutingLeg() {
    shipmentCreateForm.routingLegs.push(createManualRoutingLeg());
  }

  function addManualContainer() {
    shipmentCreateForm.containers.push(createManualContainer());
  }

  function removeManualListItem(field, index) {
    if (!["containerTypes", "routingLegs", "containers"].includes(field)) return;
    shipmentCreateForm[field].splice(index, 1);
  }

  function resetShipmentCreateForm() {
    Object.assign(shipmentCreateForm, {
      carrier: "COSCO",
      referenceType: "BOOKING",
      referenceNo: "",
      trackingStatus: "",
      note: "",
      ...emptyManualShipmentFields(),
      ...emptyDetailedManualShipmentFields()
    });
  }

  return {
    shipmentCreateForm,
    manualServiceOptions,
    manualRouteNodeLabel,
    addManualTransshipment,
    removeManualRouteNode,
    addManualContainerType,
    addManualRoutingLeg,
    addManualContainer,
    removeManualListItem,
    resetShipmentCreateForm
  };
}

function manualRowHasValue(item, ignored = ["key"]) {
  return Object.entries(item || {}).some(
    ([key, value]) =>
      !ignored.includes(key) && value !== null && value !== undefined && String(value).trim() !== ""
  );
}

function stripManualRowState(item) {
  return Object.fromEntries(
    Object.entries(item || {}).filter(([key]) => !["key", "required", "optional"].includes(key))
  );
}

export function buildManualShipmentPayload(form) {
  const routeNodes = form.routeNodes.map((item) => {
    const node = stripManualRowState(item);
    return {
      ...node,
      countryCode: String(node.countryCode || "")
        .trim()
        .toUpperCase()
    };
  });
  const firstLoadingPort = routeNodes.find((node) => ["FPOL", "POL"].includes(node.locationType));
  const lastDischargePort = routeNodes.find((node) => ["LPOD", "POD"].includes(node.locationType));
  const containerTypes = form.containerTypes
    .map((item) => ({
      type: String(item.type || "")
        .trim()
        .toUpperCase(),
      quantity: Number(item.quantity || 0)
    }))
    .filter((item) => item.type && item.quantity > 0);
  const volume = containerTypes.map((item) => `${item.type} × ${item.quantity}`).join(" · ");
  const routingLegs = form.routingLegs
    .filter((item) => manualRowHasValue(item, ["key", "mode"]))
    .map(stripManualRowState);
  const containers = form.containers
    .filter((item) => manualRowHasValue(item))
    .map(stripManualRowState);

  return {
    ...form,
    trackingStatus: form.latestEventName,
    currentLocation: form.latestEventLocation,
    portOfLoading: firstLoadingPort?.city || "",
    portOfDischarge: lastDischargePort?.city || "",
    volume,
    bookingNumber: form.bookingNumber || (form.referenceType === "BOOKING" ? form.referenceNo : ""),
    billOfLading: form.billOfLading,
    serviceScopes: [...form.serviceScopes],
    routeNodes,
    routingLegs,
    containerTypes,
    containers
  };
}

export function shipmentImportIdentity(shipment) {
  const carrier = String(shipment?.carrier || "COSCO")
    .trim()
    .toUpperCase();
  const referenceType = "BOOKING";
  let referenceNo = String(shipment?.referenceNo || shipment?.bookingNumber || "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
  if (carrier === "COSCO" && /^COSU[0-9]{6,20}$/.test(referenceNo)) {
    referenceNo = referenceNo.slice(4);
  }
  return `${carrier}|${referenceType}|${referenceNo}`;
}
