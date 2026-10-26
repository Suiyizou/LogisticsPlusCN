import { computed, onScopeDispose, reactive, ref, watch } from "vue";
import { normalizeCustomer } from "./useCustomerDirectory.js";

function emptyCreateForm() {
  return {
    displayName: "",
    username: "",
    password: "",
    userCode: "",
    partyRole: "SHIPPER",
    contactEmail: "",
    remark: ""
  };
}
function customerProfile(customer) {
  return {
    username: customer?.username || "",
    displayName: customer?.displayName || "",
    clientCode: customer?.clientCode || "",
    contactEmail: customer?.contactEmail || "",
    partyRole: customer?.partyRole || "SHIPPER"
  };
}

/** Forms and customer writes own their gates; async responses cannot close a different form. */
export function useCustomerForms({
  directory,
  canManage,
  createBusinessCustomer,
  updateBusinessCustomer,
  deleteBusinessCustomer,
  resetBusinessCustomerPassword,
  loadAvailableShipments,
  openPasswordResetResult,
  t,
  clearMessage,
  showSuccess,
  showError,
  confirm = (message) => window.confirm(message)
}) {
  const createDialogOpen = ref(false);
  const createForm = reactive(emptyCreateForm());
  const creating = ref(false);
  const mutatingCustomer = ref(false);
  const isEditMode = ref(false);
  const editingCustomerId = ref("");
  const editForm = reactive(customerProfile(null));
  const resetPasswordDialogOpen = ref(false);
  const clientCodeDialogOpen = ref(false);
  const clientCodeSupplement = ref("");
  const busy = computed(
    () => creating.value || mutatingCustomer.value || directory.customerWriteBusy.value
  );
  let disposed = false;
  let lastProfileId = "";
  let lastProfile = customerProfile(null);
  let passwordTarget = "";
  let clientCodeTarget = "";
  const allowed = () => !disposed && canManage.value && !busy.value;
  function beginWrite(flag) {
    flag.value = true;
    directory.customerWriteBusy.value = true;
  }
  function finishWrite(flag) {
    if (disposed) return;
    flag.value = false;
    directory.customerWriteBusy.value = false;
  }

  watch(
    directory.selectedCustomer,
    (customer) => {
      const profile = customerProfile(customer);
      const unchanged = Object.keys(lastProfile).every((key) => editForm[key] === lastProfile[key]);
      // A background directory refresh must not replace unsaved fields for this customer.
      if (customer?.id !== lastProfileId || unchanged) Object.assign(editForm, profile);
      lastProfileId = customer?.id || "";
      lastProfile = profile;
    },
    { immediate: true, flush: "sync" }
  );
  watch(
    directory.selectedCustomerId,
    () => {
      resetPasswordDialogOpen.value = false;
      clientCodeDialogOpen.value = false;
    },
    { flush: "sync" }
  );
  watch(
    resetPasswordDialogOpen,
    (open) => {
      if (open) passwordTarget = directory.selectedCustomerId.value;
    },
    { flush: "sync" }
  );

  function resetDialog() {
    Object.assign(createForm, emptyCreateForm());
    isEditMode.value = false;
    editingCustomerId.value = "";
    createDialogOpen.value = false;
  }
  function closeCreateDialog() {
    if (disposed || creating.value) return;
    resetDialog();
  }
  function openCreateCustomer() {
    if (!allowed()) return;
    closeCreateDialog();
    createDialogOpen.value = true;
  }
  function openEditCustomer(row) {
    if (!row?.id || !allowed()) return;
    Object.assign(createForm, emptyCreateForm(), {
      ...customerProfile(row),
      userCode: row.clientCode || "",
      remark: row.remark || ""
    });
    // clientCode belongs to the API payload; the dialog uses userCode.
    delete createForm.clientCode;
    isEditMode.value = true;
    editingCustomerId.value = row.id;
    createDialogOpen.value = true;
  }
  async function submitCustomerForm() {
    if (!allowed()) return;
    const id = isEditMode.value ? editingCustomerId.value : "";
    if (isEditMode.value && !id) return;
    const payload = {
      username: createForm.username,
      displayName: createForm.displayName,
      partyRole: createForm.partyRole,
      clientCode: createForm.userCode,
      contactEmail: createForm.contactEmail.trim(),
      remark: createForm.remark || ""
    };
    if (!id) payload.password = createForm.password;
    beginWrite(creating);
    clearMessage();
    try {
      const response = id
        ? await updateBusinessCustomer(id, payload)
        : await createBusinessCustomer(payload);
      if (disposed) return;
      const customer = normalizeCustomer(response);
      directory.replaceCustomer(customer);
      resetDialog();
      if (id) showSuccess("customers.saved");
      else await directory.loadCustomers(customer.id);
    } catch (error) {
      if (!disposed) showError(error, id ? "customers.saveFailed" : "customers.createFailed");
    } finally {
      finishWrite(creating);
    }
  }

  async function updateSelected(
    payload,
    successKey,
    failureKey = "customers.saveFailed",
    afterSave
  ) {
    if (!allowed() || !directory.selectedCustomer.value) return;
    const context = directory.captureSelection();
    beginWrite(mutatingCustomer);
    clearMessage();
    try {
      const response = await updateBusinessCustomer(context.id, { ...payload });
      if (disposed) return;
      directory.replaceCustomer(normalizeCustomer(response));
      if (!directory.isSelectionCurrent(context)) return;
      await afterSave?.();
      if (directory.isSelectionCurrent(context)) showSuccess(successKey);
    } catch (error) {
      if (directory.isSelectionCurrent(context)) showError(error, failureKey);
    } finally {
      finishWrite(mutatingCustomer);
    }
  }
  async function saveCustomer() {
    await updateSelected({ ...editForm }, "customers.saved", "customers.saveFailed", async () => {
      Object.assign(editForm, customerProfile(directory.selectedCustomer.value));
      if (directory.selectedCustomer.value?.partyRole === "OVERSEA_AGENT")
        await directory.loadLinkedCustomers(directory.selectedCustomerId.value);
    });
  }
  async function toggleCustomerStatus(row) {
    if (!row?.id || !allowed()) return;
    const status = row.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    if (
      !confirm(
        t(status === "DISABLED" ? "customers.confirmDisable" : "customers.confirmEnable", {
          name: row.displayName || row.username
        })
      )
    )
      return;
    beginWrite(mutatingCustomer);
    try {
      const response = await updateBusinessCustomer(row.id, { status });
      if (disposed) return;
      directory.replaceCustomer(normalizeCustomer(response));
      showSuccess(status === "DISABLED" ? "customers.disabled" : "customers.enabled");
    } catch (error) {
      if (!disposed) showError(error, "customers.saveFailed");
    } finally {
      finishWrite(mutatingCustomer);
    }
  }
  async function deactivateCustomer() {
    if (
      !allowed() ||
      !directory.selectedCustomer.value ||
      !confirm(t("customers.deactivateConfirm"))
    )
      return;
    await updateSelected(
      { status: "DISABLED" },
      "customers.deactivated",
      "customers.deactivateFailed"
    );
  }
  async function reactivateCustomer() {
    await updateSelected(
      { status: "ACTIVE" },
      "customers.reactivated",
      "customers.reactivateFailed"
    );
  }

  async function deleteRows(rows, confirmKey, successKey) {
    if (
      !allowed() ||
      !rows.length ||
      !confirm(
        t(confirmKey, {
          count: rows.length,
          name: rows[0].displayName || rows[0].username
        })
      )
    )
      return;
    const targets = [...new Map(rows.filter((row) => row.id).map((row) => [row.id, row])).values()];
    if (!targets.length) return;
    beginWrite(mutatingCustomer);
    try {
      const results = await Promise.allSettled(
        targets.map((row) => deleteBusinessCustomer(row.id))
      );
      if (disposed) return;
      const deleted = targets
        .filter((_, index) => results[index].status === "fulfilled")
        .map((row) => row.id);
      const failures = results.filter((result) => result.status === "rejected");
      directory.removeCustomers(deleted);
      if (deleted.length) {
        await Promise.all([
          directory.loadCustomers("", { selectFirst: false }),
          loadAvailableShipments()
        ]);
        if (disposed) return;
      }
      const failedIds = new Set(
        targets.filter((_, index) => results[index].status === "rejected").map((row) => row.id)
      );
      await directory.syncCustomerSelection(
        directory.customers.value.filter((row) => failedIds.has(row.id))
      );
      if (disposed) return;
      if (failures.length) {
        // All requests have settled: successful deletions are reconciled before showing failure.
        const error = deleted.length
          ? {
              message: t("customers.customerDeletePartial", {
                succeeded: deleted.length,
                failed: failures.length
              })
            }
          : failures[0].reason;
        showError(error, "customers.deleteCustomerFailed");
      } else showSuccess(successKey, { count: deleted.length });
    } catch (error) {
      if (!disposed) showError(error, "customers.deleteCustomerFailed");
    } finally {
      finishWrite(mutatingCustomer);
    }
  }
  async function deleteCustomerRow(row) {
    if (row?.id)
      await deleteRows([row], "customers.confirmDeleteCustomer", "customers.customerArchived");
  }
  async function deleteSelectedCustomers() {
    await deleteRows(
      [...directory.selectedCustomerRows.value],
      "customers.confirmDeleteSelectedCustomers",
      "customers.selectedCustomersArchived"
    );
  }

  function closeResetPasswordDialog() {
    if (!mutatingCustomer.value) resetPasswordDialogOpen.value = false;
  }
  function openResetPassword(row) {
    if (!row?.id || !allowed()) return;
    directory.selectedCustomerId.value = row.id;
    resetPasswordDialogOpen.value = true;
  }
  async function resetPassword() {
    if (
      !allowed() ||
      !directory.selectedCustomer.value ||
      passwordTarget !== directory.selectedCustomerId.value
    )
      return;
    const context = directory.captureSelection();
    const username = directory.selectedCustomer.value.username;
    const temporaryPassword = `${username}!@#2026`;
    beginWrite(mutatingCustomer);
    clearMessage();
    try {
      await resetBusinessCustomerPassword(context.id, temporaryPassword);
      if (!directory.isSelectionCurrent(context)) return;
      resetPasswordDialogOpen.value = false;
      openPasswordResetResult(username, temporaryPassword);
    } catch (error) {
      if (directory.isSelectionCurrent(context)) showError(error, "customers.passwordResetFailed");
    } finally {
      finishWrite(mutatingCustomer);
    }
  }
  function openClientCodeSupplement() {
    if (!allowed() || !directory.selectedCustomer.value) return;
    clientCodeTarget = directory.selectedCustomerId.value;
    clientCodeSupplement.value = directory.selectedCustomer.value.clientCode || "";
    clientCodeDialogOpen.value = true;
  }
  function closeClientCodeSupplement() {
    if (disposed || mutatingCustomer.value) return;
    clientCodeDialogOpen.value = false;
    clientCodeSupplement.value = "";
    clientCodeTarget = "";
  }
  async function saveClientCodeSupplement() {
    if (clientCodeTarget !== directory.selectedCustomerId.value) return;
    await updateSelected(
      { clientCode: clientCodeSupplement.value },
      "customers.supplementSaved",
      "customers.saveFailed",
      () => {
        clientCodeDialogOpen.value = false;
      }
    );
  }
  onScopeDispose(() => {
    disposed = true;
    createForm.password = "";
  });
  return {
    createDialogOpen,
    createForm,
    creating,
    mutatingCustomer,
    isEditMode,
    editForm,
    resetPasswordDialogOpen,
    clientCodeDialogOpen,
    clientCodeSupplement,
    openCreateCustomer,
    openEditCustomer,
    closeCreateDialog,
    submitCustomerForm,
    saveCustomer,
    toggleCustomerStatus,
    deactivateCustomer,
    reactivateCustomer,
    deleteCustomerRow,
    deleteSelectedCustomers,
    closeResetPasswordDialog,
    openResetPassword,
    resetPassword,
    openClientCodeSupplement,
    closeClientCodeSupplement,
    saveClientCodeSupplement
  };
}
