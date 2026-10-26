import { computed, nextTick, onScopeDispose, reactive, ref, watch } from "vue";

export function emptyManualShipmentFields() {
  return {
    forwarderJobNumber: "",
    vesselVoyage: "",
    portOfLoading: "",
    portOfDischarge: "",
    clientPoNumber: "",
    estimatedDeparture: "",
    estimatedArrival: "",
    actualDeparture: "",
    actualArrival: "",
    actualDelivery: "",
    currentLocation: "",
    volume: "",
    clientNameCode: ""
  };
}

/** Owns a ticket detail's state, request context and cancellation. I/O is injected. */
export function useShipmentDetail({
  canManage = ref(true),
  selectedShipmentId,
  menuItem,
  subView,
  availableShipments,
  shipments,
  selectedCustomer,
  selectedCustomerId,
  shipmentTrackingChannel,
  fetchBusinessShipmentSnapshot,
  updateBusinessShipment,
  updateBusinessShipmentManualSnapshot,
  invalidateBusinessShipmentSnapshot,
  deleteBusinessShipment,
  requestTracking,
  normalizeBusinessShipment,
  replaceShipmentInLocalCollections,
  loadAvailableShipments,
  selectCustomer,
  primaryBoundCustomerName,
  preferredTrackingReference,
  navigateTo,
  t,
  showSuccess,
  showError,
  showInfo,
  tick = nextTick,
  promptInvalidation = (...args) => window.prompt(...args),
  confirmDeletion = (...args) => window.confirm(...args)
}) {
  const detailShipmentSnapshot = ref(null);

  const loadingShipmentDetail = ref(false);

  const savingShipment = ref(false);

  const deletingShipment = ref(false);

  const refreshingShipment = ref(false);

  const refreshAbortController = ref(null);

  const refreshTrackingStatus = ref("");

  const refreshTrackingResponse = ref(null);

  const detailForm = reactive({
    referenceType: "BOOKING",
    referenceNo: "",
    trackingStatus: "",
    note: "",
    ...emptyManualShipmentFields()
  });

  let shipmentDetailRequestSequence = 0;

  let shipmentDetailContextVersion = 0;

  let shipmentDetailDisposed = false;

  const selectedShipment = computed(() => {
    if (detailShipmentSnapshot.value?.shipmentId === selectedShipmentId.value) {
      return detailShipmentSnapshot.value;
    }
    return availableShipments.value.find((s) => s.shipmentId === selectedShipmentId.value) || null;
  });

  watch(
    [selectedShipmentId, menuItem, subView],
    ([shipmentId]) => {
      resetShipmentDetailContext();
      if (shipmentId && subView.value === "detail" && menuItem.value === "shipments") {
        void loadShipmentDetailSnapshot();
      }
    },
    { immediate: true, flush: "sync" }
  );

  watch(
    selectedShipment,
    (shipment) => {
      syncDetailFormFromShipment(shipment);
    },
    { immediate: true }
  );

  function resetShipmentDetailContext() {
    shipmentDetailContextVersion += 1;
    shipmentDetailRequestSequence += 1;
    detailShipmentSnapshot.value = null;
    loadingShipmentDetail.value = false;
    refreshTrackingResponse.value = null;
    refreshTrackingStatus.value = "";
  }

  function captureShipmentDetailContext(shipmentId) {
    return { shipmentId, version: shipmentDetailContextVersion };
  }

  function isShipmentDetailContextCurrent(context) {
    return (
      !shipmentDetailDisposed &&
      context.version === shipmentDetailContextVersion &&
      context.shipmentId === selectedShipmentId.value &&
      menuItem.value === "shipments" &&
      subView.value === "detail"
    );
  }

  async function loadShipmentDetailSnapshot() {
    const shipmentId = selectedShipmentId.value;
    const context = captureShipmentDetailContext(shipmentId);
    const requestSequence = ++shipmentDetailRequestSequence;
    if (!shipmentId) {
      detailShipmentSnapshot.value = null;
      return;
    }
    if (!isShipmentDetailContextCurrent(context)) return;
    const isCurrent = () =>
      isShipmentDetailContextCurrent(context) && requestSequence === shipmentDetailRequestSequence;
    loadingShipmentDetail.value = true;
    try {
      const response = await fetchBusinessShipmentSnapshot(shipmentId);
      if (!isCurrent()) return;
      detailShipmentSnapshot.value = normalizeBusinessShipment(response?.item || response);
    } catch (error) {
      if (!isCurrent()) return;
      showError(error, "customers.loadShipmentDetailFailed");
      detailShipmentSnapshot.value = null;
      if ([403, 404].includes(error?.status)) selectedShipmentId.value = "";
    } finally {
      if (isCurrent()) loadingShipmentDetail.value = false;
    }
  }

  async function saveManualSnapshot() {
    if (!canManage.value || shipmentDetailDisposed) return;
    const shipment = selectedShipment.value;
    if (
      !shipment?.shipmentId ||
      savingShipment.value ||
      loadingShipmentDetail.value ||
      refreshingShipment.value ||
      deletingShipment.value
    )
      return;
    const context = captureShipmentDetailContext(shipment.shipmentId);
    shipmentDetailRequestSequence += 1;
    const unsavedTicketFields = {
      referenceType: detailForm.referenceType,
      referenceNo: detailForm.referenceNo,
      note: detailForm.note
    };
    savingShipment.value = true;
    try {
      const updated = await updateBusinessShipmentManualSnapshot(shipment.shipmentId, {
        trackingStatus: detailForm.trackingStatus,
        forwarderJobNumber: detailForm.forwarderJobNumber,
        vesselVoyage: detailForm.vesselVoyage,
        portOfLoading: detailForm.portOfLoading,
        portOfDischarge: detailForm.portOfDischarge,
        clientPoNumber: detailForm.clientPoNumber,
        estimatedDeparture: detailForm.estimatedDeparture,
        estimatedArrival: detailForm.estimatedArrival,
        actualDeparture: detailForm.actualDeparture,
        actualArrival: detailForm.actualArrival,
        actualDelivery: detailForm.actualDelivery,
        currentLocation: detailForm.currentLocation,
        volume: detailForm.volume,
        clientNameCode: detailForm.clientNameCode
      });
      if (!isShipmentDetailContextCurrent(context)) return;
      const normalized = normalizeBusinessShipment(updated);
      replaceShipmentInLocalCollections(normalized);
      detailShipmentSnapshot.value = normalized;
      await tick();
      if (!isShipmentDetailContextCurrent(context)) return;
      Object.assign(detailForm, unsavedTicketFields);
      showSuccess("customers.manualSnapshotSaved");
    } catch (error) {
      if (isShipmentDetailContextCurrent(context))
        showError(error, "customers.manualSnapshotFailed");
    } finally {
      savingShipment.value = false;
    }
  }

  async function invalidateSnapshot() {
    if (!canManage.value || shipmentDetailDisposed) return;
    const shipment = selectedShipment.value;
    if (
      !shipment?.shipmentId ||
      savingShipment.value ||
      loadingShipmentDetail.value ||
      refreshingShipment.value ||
      deletingShipment.value
    )
      return;
    const reason = promptInvalidation(
      t("customers.invalidateReasonPrompt"),
      "Upstream snapshot is empty or incorrect"
    );
    if (!reason?.trim()) return;
    const context = captureShipmentDetailContext(shipment.shipmentId);
    shipmentDetailRequestSequence += 1;
    savingShipment.value = true;
    try {
      await invalidateBusinessShipmentSnapshot(shipment.shipmentId, reason.trim());
      if (!isShipmentDetailContextCurrent(context)) return;
      await Promise.all([
        selectedCustomer.value ? selectCustomer(selectedCustomer.value.id) : Promise.resolve(),
        loadAvailableShipments(),
        loadShipmentDetailSnapshot()
      ]);
      if (isShipmentDetailContextCurrent(context)) showSuccess("customers.snapshotInvalidated");
    } catch (error) {
      if (isShipmentDetailContextCurrent(context))
        showError(error, "customers.snapshotInvalidateFailed");
    } finally {
      savingShipment.value = false;
    }
  }

  function syncDetailFormFromShipment(shipment) {
    if (!shipment) {
      detailForm.referenceType = "BOOKING";
      detailForm.referenceNo = "";
      detailForm.trackingStatus = "";
      detailForm.note = "";
      Object.assign(detailForm, emptyManualShipmentFields());
      return;
    }
    detailForm.referenceType = shipment.referenceType || "BOOKING";
    detailForm.referenceNo = shipment.referenceNo || "";
    detailForm.trackingStatus = shipment.trackingStatus || "";
    detailForm.note = shipment.note || "";
    Object.assign(detailForm, {
      forwarderJobNumber: shipment.forwarderJobNumber || "",
      vesselVoyage: shipment.vesselVoyage || "",
      portOfLoading: shipment.portOfLoading || "",
      portOfDischarge: shipment.portOfDischarge || "",
      clientPoNumber: shipment.clientPoNumber || "",
      estimatedDeparture: shipment.estimatedDeparture || "",
      estimatedArrival: shipment.estimatedArrival || "",
      actualDeparture: shipment.actualDeparture || "",
      actualArrival: shipment.actualArrival || "",
      actualDelivery: shipment.actualDelivery || "",
      currentLocation: shipment.currentLocation || "",
      volume: shipment.volume || "",
      clientNameCode: shipment.clientNameCode || primaryBoundCustomerName(shipment)
    });
  }

  async function saveShipmentDetail() {
    if (!canManage.value || shipmentDetailDisposed) return;
    const shipment = selectedShipment.value;
    if (
      !shipment?.shipmentId ||
      savingShipment.value ||
      loadingShipmentDetail.value ||
      refreshingShipment.value ||
      deletingShipment.value
    )
      return;
    const context = captureShipmentDetailContext(shipment.shipmentId);
    shipmentDetailRequestSequence += 1;
    const unsavedManualFields = {
      trackingStatus: detailForm.trackingStatus,
      ...Object.fromEntries(
        Object.keys(emptyManualShipmentFields()).map((key) => [key, detailForm[key]])
      )
    };
    savingShipment.value = true;
    try {
      const updated = await updateBusinessShipment(shipment.shipmentId, {
        referenceType: detailForm.referenceType,
        referenceNo: detailForm.referenceNo,
        note: detailForm.note
      });
      if (!isShipmentDetailContextCurrent(context)) return;
      const normalized = normalizeBusinessShipment(updated);
      replaceShipmentInLocalCollections(normalized);
      detailShipmentSnapshot.value = normalized;
      await tick();
      if (!isShipmentDetailContextCurrent(context)) return;
      Object.assign(detailForm, unsavedManualFields);
      showSuccess("customers.shipmentSaved");
    } catch (error) {
      if (isShipmentDetailContextCurrent(context)) showError(error, "customers.shipmentSaveFailed");
    } finally {
      savingShipment.value = false;
    }
  }

  async function refreshShipmentFromCarrier() {
    const shipment = selectedShipment.value;
    const preferredReference = preferredTrackingReference(shipment);
    if (
      !shipment?.carrier ||
      !preferredReference.number ||
      refreshingShipment.value ||
      savingShipment.value ||
      loadingShipmentDetail.value ||
      deletingShipment.value
    )
      return;
    const context = captureShipmentDetailContext(shipment.shipmentId);
    refreshingShipment.value = true;
    refreshTrackingStatus.value = t("customers.updateTrackingNodeService");
    refreshTrackingResponse.value = null;
    const controller = new AbortController();
    refreshAbortController.value = controller;
    try {
      const { response: resp, data } = await requestTracking(
        {
          carrier: shipment.carrier,
          channel: shipmentTrackingChannel.value,
          type: preferredReference.type,
          number: preferredReference.number,
          forceRefresh: true
        },
        controller.signal
      );
      if (!isShipmentDetailContextCurrent(context)) return;
      const snapshot = data?.snapshot;
      const hasDetails = Boolean(
        snapshot?.containers?.length ||
        snapshot?.route?.length ||
        snapshot?.routingLegs?.length ||
        snapshot?.sailingSchedule?.length ||
        snapshot?.summary?.latestEvent?.name ||
        snapshot?.summary?.origin?.name ||
        snapshot?.summary?.destination?.name
      );
      refreshTrackingResponse.value = {
        status: resp.status,
        ok: resp.ok,
        code: data?.code || data?.diagnostic?.code || (resp.ok ? "SUCCESS" : data?.error) || "-",
        message:
          data?.warning || data?.diagnostic?.code === "UPSTREAM_EMPTY"
            ? t("customers.refreshReturnedNoData")
            : data?.message ||
              data?.diagnostic?.message ||
              (resp.ok ? t("customers.updateTrackingSuccessDefault") : resp.statusText) ||
              "-",
        carrier: shipment.carrier,
        type: preferredReference.type,
        number: preferredReference.number,
        hasDetails
      };
      if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
      if (data?.cacheSource === "MYSQL_STALE" || data?.warning) {
        throw new Error(data?.warning || t("customers.refreshFailed"));
      }
      refreshTrackingStatus.value = t("customers.updateTrackingSaving");
      await loadAvailableShipments();
      if (!isShipmentDetailContextCurrent(context)) return;
      await loadShipmentDetailSnapshot();
      if (!isShipmentDetailContextCurrent(context)) return;
      if (selectedCustomerId.value) {
        await selectCustomer(selectedCustomerId.value);
      }
      if (!isShipmentDetailContextCurrent(context)) return;
      const updated = [...availableShipments.value, ...shipments.value].find(
        (s) => s.shipmentId === shipment.shipmentId
      );
      if (updated) {
        Object.assign(detailForm, {
          referenceType: updated.referenceType || detailForm.referenceType,
          referenceNo: updated.referenceNo || detailForm.referenceNo,
          trackingStatus: updated.trackingStatus || detailForm.trackingStatus
        });
      }
      refreshTrackingStatus.value = t("customers.updateTrackingComplete");
      showSuccess("customers.refreshSuccess");
    } catch (error) {
      if (!isShipmentDetailContextCurrent(context)) return;
      if (error?.name === "AbortError") {
        refreshTrackingStatus.value = t("customers.updateTrackingCancelled");
        showInfo("customers.refreshCancelled");
      } else {
        refreshTrackingStatus.value = t("customers.updateTrackingFailed");
        showError(error, "customers.refreshFailed");
      }
    } finally {
      refreshingShipment.value = false;
      refreshAbortController.value = null;
    }
  }

  function cancelRefreshShipment() {
    if (refreshAbortController.value) {
      refreshAbortController.value.abort();
    }
  }

  async function removeShipment() {
    if (!canManage.value || shipmentDetailDisposed) return;
    const shipment = selectedShipment.value;
    if (
      !shipment?.shipmentId ||
      deletingShipment.value ||
      savingShipment.value ||
      loadingShipmentDetail.value ||
      refreshingShipment.value
    )
      return;
    if (!confirmDeletion(t("customers.deleteShipmentConfirm"))) return;
    deletingShipment.value = true;
    const shipmentId = shipment.shipmentId;
    const context = captureShipmentDetailContext(shipmentId);
    try {
      await deleteBusinessShipment(shipmentId);
      shipments.value = shipments.value.filter((item) => item.shipmentId !== shipmentId);
      await loadAvailableShipments();
      if (!isShipmentDetailContextCurrent(context)) return;
      navigateTo("shipments");
      showSuccess("customers.shipmentDeleted");
    } catch (error) {
      if (isShipmentDetailContextCurrent(context))
        showError(error, "customers.shipmentDeleteFailed");
    } finally {
      deletingShipment.value = false;
    }
  }

  onScopeDispose(() => {
    shipmentDetailDisposed = true;
    resetShipmentDetailContext();
    refreshAbortController.value?.abort();
  });
  return {
    detailShipmentSnapshot,
    loadingShipmentDetail,
    savingShipment,
    deletingShipment,
    refreshingShipment,
    refreshAbortController,
    refreshTrackingStatus,
    refreshTrackingResponse,
    detailForm,
    selectedShipment,
    loadShipmentDetailSnapshot,
    saveShipmentDetail,
    saveManualSnapshot,
    invalidateSnapshot,
    refreshShipmentFromCarrier,
    cancelRefreshShipment,
    removeShipment
  };
}
