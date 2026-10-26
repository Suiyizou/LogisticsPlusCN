// @ts-check
import { computed, nextTick, reactive, ref, shallowRef } from "vue";
import { adminErrorText, useAdminSessionGuard } from "./useAdminSessionGuard.js";

/** @param {string} password */
export function isStrongEmployeePassword(password) {
  return (
    password !== "123456" &&
    password !== "Admin@123456" &&
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}

/** @param {import("../../types/adminWorkflows").AdminAccountPorts} ports */
export function useAdminAccounts({
  currentUser,
  isHostBusy,
  services,
  feedback,
  t,
  translate,
  confirmDelete,
  writeClipboard,
  onUserUpdated
}) {
  /** @type {import("vue").Ref<import("../../types/adminWorkflows").AdminEmployee[]>} */
  const employees = ref([]);
  const employeeTotal = ref(0),
    employeePage = ref(1),
    employeePageSize = ref(20);
  const employeeDialogOpen = ref(false),
    employeeDialogError = ref("");
  /** @type {import("vue").Ref<string | number>} */
  const editingEmployeeId = ref("");
  const emptyForm = () => ({
    username: "",
    displayName: "",
    password: "",
    passwordConfirm: "",
    role: "OVERSEA_AGENT",
    partyRole: "AGENT",
    status: "ACTIVE"
  });
  const employeeForm = reactive(emptyForm());
  const resetPasswordDialog = reactive({
    open: false,
    userId: /** @type {string | number} */ (""),
    username: "",
    pending: false,
    error: ""
  });
  const temporaryPasswordDialog = reactive({
    open: false,
    username: "",
    password: "",
    copied: false
  });
  const resetPasswordConfirmButtonRef = shallowRef(/** @type {HTMLElement | null} */ (null));
  const temporaryPasswordCopyButtonRef = shallowRef(/** @type {HTMLElement | null} */ (null));
  const pending = ref(false),
    reading = ref(0),
    copying = ref(false);
  const busy = computed(() => pending.value || reading.value > 0);
  const editingEmployeeIsSelf = computed(
    () => editingEmployeeId.value !== "" && isSelf(editingEmployeeId.value)
  );
  let readVersion = 0,
    credentialVersion = 0;
  /** @type {{ focus: () => void } | null} */
  let resetPasswordTrigger = null;
  const session = useAdminSessionGuard({ currentUser, invalidate });

  /** @param {string | number} id */
  function isSelf(id) {
    return String(id) === String(currentUser.value?.id);
  }
  function canStart() {
    return session.authorized() && !busy.value && !isHostBusy() && !temporaryPasswordDialog.open;
  }
  function clearEditor() {
    employeeDialogOpen.value = false;
    editingEmployeeId.value = "";
    employeeDialogError.value = "";
    Object.assign(employeeForm, emptyForm());
  }
  function clearReset() {
    Object.assign(resetPasswordDialog, {
      open: false,
      userId: "",
      username: "",
      pending: false,
      error: ""
    });
  }
  function clearResult() {
    credentialVersion++;
    copying.value = false;
    Object.assign(temporaryPasswordDialog, {
      open: false,
      username: "",
      password: "",
      copied: false
    });
  }
  function invalidate() {
    readVersion++;
    clearEditor();
    clearReset();
    clearResult();
    resetPasswordTrigger = null;
    pending.value = false;
    reading.value = 0;
    employees.value = [];
    employeeTotal.value = 0;
    employeePage.value = 1;
    employeePageSize.value = 20;
  }
  /** @param {number | null} context */
  function restoreFocus(context) {
    const trigger = resetPasswordTrigger;
    resetPasswordTrigger = null;
    void nextTick(() => {
      if (session.current(context)) trigger?.focus();
    });
  }
  /** @param {unknown} error @param {boolean} [popup] */
  function report(error, popup = false) {
    return feedback.error(translate(adminErrorText(error, t("admin.employee.errorFallback"))), {
      popup
    });
  }

  async function loadEmployeePage() {
    const context = session.capture();
    if (context === null) return false;
    const version = ++readVersion,
      page = employeePage.value,
      size = employeePageSize.value;
    const current = () =>
      session.current(context) &&
      version === readVersion &&
      page === employeePage.value &&
      size === employeePageSize.value;
    reading.value++;
    try {
      const data = await services.fetchEmployees({ page: page - 1, size });
      if (!current()) return false;
      employees.value = Array.isArray(data?.items) ? data.items : [];
      employeeTotal.value = Number(data?.total || 0);
      return true;
    } catch (error) {
      feedback.handled(error);
      if (current()) throw error;
      return false;
    } finally {
      if (session.current(context)) reading.value--;
    }
  }

  /** @param {import("../../types/adminWorkflows").AdminEmployee | null} [user] */
  function openEmployeeDialog(user = null) {
    if (!canStart() || resetPasswordDialog.open) return false;
    clearEditor();
    editingEmployeeId.value = user?.id ?? "";
    Object.assign(employeeForm, {
      username: user?.username || "",
      displayName: user?.displayName || "",
      role: user?.role || "OVERSEA_AGENT",
      partyRole: "AGENT",
      status: user?.status || "ACTIVE"
    });
    employeeDialogOpen.value = true;
    return true;
  }
  function closeEmployeeDialog() {
    if (pending.value) return false;
    clearEditor();
    return true;
  }

  /** @param {() => Promise<unknown>} action @param {number} context @param {boolean} [popup] */
  async function runWrite(action, context, popup = false) {
    pending.value = true;
    feedback.clear();
    try {
      const result = await action();
      return result !== false && session.current(context);
    } catch (error) {
      feedback.handled(error);
      if (session.current(context)) await report(error, popup);
      return false;
    } finally {
      if (session.current(context)) pending.value = false;
    }
  }
  /** A committed write remains successful if its subsequent list refresh fails. @param {number} context */
  async function refreshAfterWrite(context) {
    if (!session.current(context)) return;
    try {
      await loadEmployeePage();
    } catch (error) {
      if (session.current(context))
        await feedback.error(t("adminWorkflow.savedRefreshFailed"), { popup: true });
    }
  }

  async function handleSaveEmployee() {
    if (!canStart() || !employeeDialogOpen.value) return false;
    const context = session.capture();
    if (context === null) return false;
    employeeDialogError.value = "";
    const id = editingEmployeeId.value,
      editing = id !== "",
      form = { ...employeeForm };
    const suppliedPassword = Boolean(form.password || form.passwordConfirm);
    if (editing && isSelf(id) && suppliedPassword) {
      employeeDialogError.value = t("admin.employee.selfPasswordEditHint");
      return false;
    }
    if ((!editing || suppliedPassword) && !isStrongEmployeePassword(form.password)) {
      employeeDialogError.value = t("admin.employee.passwordRuleError");
      return false;
    }
    if ((!editing || suppliedPassword) && form.password !== form.passwordConfirm) {
      employeeDialogError.value = t("admin.employee.passwordMismatch");
      return false;
    }
    /** @type {import("../../types/adminWorkflows").AdminEmployeePayload} */
    const payload = {
      displayName: form.displayName,
      role: form.role,
      partyRole: "AGENT",
      status: form.status,
      password: form.password || null
    };
    if (!editing) payload.username = form.username;
    return runWrite(
      async () => {
        const updated = editing
          ? await services.updateEmployee(id, payload)
          : await services.createEmployee(payload);
        if (!session.current(context)) return;
        clearEditor();
        if (editing && isSelf(id)) onUserUpdated(updated);
        if (!session.current(context)) return;
        feedback.success(t(editing ? "admin.employee.saved" : "admin.employee.created"));
        await refreshAfterWrite(context);
      },
      context,
      true
    );
  }

  /** @param {import("../../types/adminWorkflows").AdminEmployee} user @param {{ currentTarget?: EventTarget | null }} [event] */
  function openResetPasswordDialog(user, event) {
    if (!canStart() || employeeDialogOpen.value || user?.id == null || isSelf(user.id))
      return false;
    const target = event?.currentTarget;
    resetPasswordTrigger =
      target && "focus" in target && typeof target.focus === "function"
        ? /** @type {HTMLElement} */ (target)
        : null;
    Object.assign(resetPasswordDialog, {
      open: true,
      userId: user.id,
      username: user.username || user.displayName || "",
      pending: false,
      error: ""
    });
    const context = session.capture();
    void nextTick(() => {
      if (session.current(context) && resetPasswordDialog.open)
        resetPasswordConfirmButtonRef.value?.focus();
    });
    return true;
  }
  function closeResetPasswordDialog() {
    if (pending.value) return false;
    clearReset();
    restoreFocus(session.capture());
    return true;
  }
  async function confirmResetPassword() {
    if (!canStart() || !resetPasswordDialog.open || isSelf(resetPasswordDialog.userId))
      return false;
    const context = session.capture();
    if (context === null) return false;
    const id = resetPasswordDialog.userId,
      username = resetPasswordDialog.username;
    pending.value = true;
    resetPasswordDialog.pending = true;
    resetPasswordDialog.error = "";
    feedback.clear();
    try {
      const response = await services.resetEmployeePassword(id);
      if (!session.current(context)) return false;
      const password = String(response?.temporaryPassword ?? "");
      if (!password) throw Error(t("admin.employee.temporaryPasswordMissing"));
      clearReset();
      clearResult();
      Object.assign(temporaryPasswordDialog, { open: true, username, password });
      feedback.success(t("admin.employee.resetPasswordSuccess", { username }));
      await nextTick();
      if (session.current(context) && temporaryPasswordDialog.open)
        temporaryPasswordCopyButtonRef.value?.focus();
      return true;
    } catch (error) {
      feedback.handled(error);
      if (session.current(context))
        resetPasswordDialog.error = translate(
          adminErrorText(error, t("admin.employee.errorFallback"))
        );
      return false;
    } finally {
      if (session.current(context)) {
        pending.value = false;
        resetPasswordDialog.pending = false;
      }
    }
  }
  async function copyTemporaryPassword() {
    const context = session.capture(),
      version = credentialVersion;
    if (context === null || !temporaryPasswordDialog.open || copying.value) return false;
    copying.value = true;
    const current = () =>
      session.current(context) && version === credentialVersion && temporaryPasswordDialog.open;
    try {
      await writeClipboard(temporaryPasswordDialog.password);
      if (!current()) return false;
      temporaryPasswordDialog.copied = true;
      return true;
    } catch {
      if (current())
        await feedback.error(t("admin.employee.copyTemporaryPasswordFailed"), { popup: true });
      return false;
    } finally {
      if (current()) copying.value = false;
    }
  }
  function closeTemporaryPasswordDialog() {
    clearResult();
    restoreFocus(session.capture());
  }

  /** @param {import("../../types/adminWorkflows").AdminEmployee} user */
  async function toggleEmployee(user) {
    if (
      !canStart() ||
      employeeDialogOpen.value ||
      resetPasswordDialog.open ||
      user?.id == null ||
      isSelf(user.id)
    )
      return false;
    const context = session.capture();
    if (context === null) return false;
    const id = user.id,
      status = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    const payload = {
      displayName: user.displayName || "",
      role: user.role,
      partyRole: "AGENT",
      status
    };
    return runWrite(async () => {
      await services.updateEmployee(id, payload);
      if (!session.current(context)) return;
      feedback.success(
        t(status === "ACTIVE" ? "adminWorkflow.employeeEnabled" : "adminWorkflow.employeeDisabled")
      );
      await refreshAfterWrite(context);
    }, context);
  }
  /** @param {import("../../types/adminWorkflows").AdminEmployee} user */
  async function handleDeleteEmployee(user) {
    if (
      !canStart() ||
      employeeDialogOpen.value ||
      resetPasswordDialog.open ||
      user?.id == null ||
      isSelf(user.id)
    )
      return false;
    const context = session.capture();
    if (context === null) return false;
    const captured = { ...user },
      page = employeePage.value;
    return runWrite(
      async () => {
        if (!(await confirmDelete(captured)) || !session.current(context)) return false;
        await services.deleteEmployee(captured.id);
        if (!session.current(context)) return;
        if (employeePage.value === page && employees.value.length === 1 && page > 1)
          employeePage.value--;
        feedback.success(t("adminWorkflow.employeeDeleted"));
        await refreshAfterWrite(context);
      },
      context,
      true
    );
  }
  /** @param {number} page */
  async function changeEmployeePage(page) {
    const context = session.capture();
    if (
      context === null ||
      busy.value ||
      isHostBusy() ||
      !Number.isInteger(page) ||
      page < 1 ||
      page === employeePage.value
    )
      return false;
    employeePage.value = page;
    employees.value = [];
    try {
      return await loadEmployeePage();
    } catch (error) {
      if (session.current(context))
        await feedback.error(translate(adminErrorText(error, t("admin.employee.errorFallback"))));
      return false;
    }
  }
  return {
    changeEmployeePage,
    employees,
    employeeTotal,
    employeePage,
    employeePageSize,
    employeeDialogOpen,
    editingEmployeeId,
    employeeDialogError,
    employeeForm,
    editingEmployeeIsSelf,
    resetPasswordDialog,
    temporaryPasswordDialog,
    resetPasswordConfirmButtonRef,
    temporaryPasswordCopyButtonRef,
    busy,
    copying,
    loadEmployeePage,
    openEmployeeDialog,
    closeEmployeeDialog,
    handleSaveEmployee,
    openResetPasswordDialog,
    closeResetPasswordDialog,
    confirmResetPassword,
    copyTemporaryPassword,
    closeTemporaryPasswordDialog,
    toggleEmployee,
    handleDeleteEmployee
  };
}
