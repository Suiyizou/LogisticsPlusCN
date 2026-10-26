// @ts-check
import { computed, ref, shallowRef } from "vue";
import { adminErrorText, useAdminSessionGuard } from "./useAdminSessionGuard.js";
import { normalizeAdminTicket } from "./adminBusinessPresentation.js";

/** @template T @param {T[]} initial */
function pageState(initial) {
  /** @type {import("vue").ShallowRef<T[]>} */
  const rows = shallowRef(initial);
  return { rows, total: ref(0), page: ref(1), size: ref(20), loaded: ref(false), version: 0 };
}
/** @param {number | undefined} value @param {number} fallback */
function totalCount(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? fallback)) : fallback;
}
/** @param {number} value */
function validPage(value) {
  return Number.isInteger(value) && value > 0;
}
/** @param {import("../../types/adminBusinessLists").AdminBusinessListPorts} ports */
export function useAdminBusinessLists({
  currentUser,
  isHostBusy,
  services,
  feedback,
  t,
  translate,
  confirmDelete,
  afterCustomerDeleted,
  copy
}) {
  const platform = pageState(
      /** @type {import("../../types/adminBusinessLists").AdminPlatformCustomer[]} */ ([])
    ),
    handovers = pageState(
      /** @type {import("../../types/adminBusinessLists").AdminHandover[]} */ ([])
    ),
    tickets = pageState(/** @type {import("../../types/adminBusinessLists").AdminTicket[]} */ ([]));
  /** @type {import("vue").ShallowRef<import("../../types/adminBusinessLists").AdminPlatformInfo | null>} */
  const platformInfo = shallowRef(null);
  /** @type {import("vue").ShallowRef<import("../../types/adminBusinessLists").AdminPlatformCustomer[]>} */
  const platformCustomers = platform.rows;
  /** @type {import("vue").ShallowRef<import("../../types/adminBusinessLists").AdminHandover[]>} */
  const customerHandovers = handovers.rows;
  /** @type {import("vue").ShallowRef<import("../../types/adminBusinessLists").AdminTicket[]>} */
  const adminTickets = tickets.rows;
  const customerHandoverStatus = ref("");
  const pending = ref(false),
    reading = ref(0);
  const busy = computed(() => pending.value || reading.value > 0);
  const session = useAdminSessionGuard({ currentUser, invalidate });
  function invalidate() {
    for (const state of [platform, handovers, tickets]) {
      state.version++;
      state.rows.value = [];
      state.total.value = 0;
      state.page.value = 1;
      state.size.value = 20;
      state.loaded.value = false;
    }
    platformInfo.value = null;
    customerHandoverStatus.value = "";
    pending.value = false;
    reading.value = 0;
  }
  /** A page selection and its rows are committed by the same request generation.
   * @param {"platform" | "handovers" | "tickets"} kind @param {boolean} [afterWrite] */
  async function readPage(kind, afterWrite = false) {
    const context = session.capture();
    if (context === null || (pending.value && !afterWrite)) return false;
    const state = kind === "platform" ? platform : kind === "handovers" ? handovers : tickets;
    const version = ++state.version,
      page = state.page.value,
      size = state.size.value;
    const status = customerHandoverStatus.value;
    const current = () =>
      session.current(context) &&
      state.version === version &&
      state.page.value === page &&
      state.size.value === size &&
      (kind !== "handovers" || customerHandoverStatus.value === status);
    /** @param {number} requestedPage */
    async function fetchPage(requestedPage) {
      if (kind === "platform") return services.fetchPlatformInfo({ page: requestedPage - 1, size });
      if (kind === "handovers")
        return services.fetchCustomerHandovers({ page: requestedPage - 1, size, status });
      return services.fetchAvailableBusinessShipments({ page: requestedPage, pageSize: size });
    }
    reading.value++;
    try {
      let data = await fetchPage(page);
      if (!current()) return false;
      let rows = Array.isArray(data.items) ? data.items : [];
      const total = totalCount(data.total, rows.length);
      let committedSize =
        kind === "tickets" &&
        "pageSize" in data &&
        typeof data.pageSize === "number" &&
        validPage(data.pageSize) &&
        data.pageSize >= 5 &&
        data.pageSize <= 100
          ? data.pageSize
          : size;
      let committedPage =
        kind === "tickets" &&
        "page" in data &&
        typeof data.page === "number" &&
        validPage(data.page)
          ? data.page
          : page;
      const lastPage = Math.max(1, Math.ceil(total / committedSize));
      if (committedPage > lastPage) {
        data = await fetchPage(lastPage);
        if (!current()) return false;
        committedPage =
          kind === "tickets" &&
          "page" in data &&
          typeof data.page === "number" &&
          validPage(data.page)
            ? data.page
            : lastPage;
        if (
          kind === "tickets" &&
          "pageSize" in data &&
          typeof data.pageSize === "number" &&
          validPage(data.pageSize) &&
          data.pageSize >= 5 &&
          data.pageSize <= 100
        )
          committedSize = data.pageSize;
        rows = Array.isArray(data.items) ? data.items : [];
      }
      if (kind === "platform") {
        const info = /** @type {import("../../types/adminBusinessLists").AdminPlatformInfo} */ (
          data
        );
        platformCustomers.value =
          /** @type {import("../../types/adminBusinessLists").AdminPlatformCustomer[]} */ (rows);
        platformInfo.value = { ...info, items: platformCustomers.value };
      } else if (kind === "handovers") {
        customerHandovers.value =
          /** @type {import("../../types/adminBusinessLists").AdminHandover[]} */ (rows);
      } else {
        adminTickets.value = rows.map(normalizeAdminTicket).filter((row) => row !== null);
      }
      state.page.value = committedPage;
      state.size.value = committedSize;
      state.total.value = totalCount(data.total, rows.length);
      state.loaded.value = true;
      return true;
    } catch (error) {
      feedback.handled(error);
      if (current()) throw error;
      return false;
    } finally {
      if (session.current(context)) reading.value--;
    }
  }
  /** @param {() => Promise<boolean>} task */
  async function performRead(task) {
    const context = session.capture();
    if (context === null || busy.value || isHostBusy()) return false;
    try {
      return await task();
    } catch (error) {
      if (session.current(context))
        await feedback.error(translate(adminErrorText(error, t("admin.employee.errorFallback"))));
      return false;
    }
  }
  const loadPlatformPage = () => readPage("platform");
  const loadCustomerHandoverPage = () => readPage("handovers");
  const loadAdminTicketPage = () => readPage("tickets");
  const refreshPlatformPage = () => performRead(loadPlatformPage);
  const refreshCustomerHandoverPage = () => performRead(loadCustomerHandoverPage);
  const refreshAdminTicketPage = () => performRead(loadAdminTicketPage);
  /** @param {"platform" | "handovers" | "tickets"} kind @param {number} page @param {number | undefined} [size] */
  function changePage(kind, page, size) {
    if (
      !validPage(page) ||
      (size !== undefined && (!validPage(size) || size > 100 || (kind === "tickets" && size < 5)))
    )
      return Promise.resolve(false);
    return performRead(() => {
      const state = kind === "platform" ? platform : kind === "handovers" ? handovers : tickets;
      if (state.page.value === page && (size === undefined || state.size.value === size))
        return Promise.resolve(false);
      state.page.value = page;
      if (size !== undefined) state.size.value = size;
      state.rows.value = [];
      state.loaded.value = false;
      return readPage(kind);
    });
  }
  /** @param {string} status */
  function changeCustomerHandoverStatus(status) {
    if (!["", "PENDING", "APPROVED", "REJECTED"].includes(status)) return Promise.resolve(false);
    return performRead(() => {
      if (customerHandoverStatus.value === status) return Promise.resolve(false);
      customerHandoverStatus.value = status;
      handovers.page.value = 1;
      customerHandovers.value = [];
      handovers.loaded.value = false;
      return readPage("handovers");
    });
  }
  /** @param {import("../../types/adminBusinessLists").AdminPlatformCustomer} row */
  async function handleDeletePlatformCustomer(row) {
    const context = session.capture();
    if (
      context === null ||
      busy.value ||
      isHostBusy() ||
      row.customerId == null ||
      row.customerId === ""
    )
      return false;
    const target = Object.freeze({ ...row });
    pending.value = true;
    try {
      if (!(await confirmDelete(target)) || !session.current(context) || isHostBusy()) return false;
      feedback.clear();
      await services.deletePlatformCustomer(target.customerId);
      if (!session.current(context)) return false;
      // One customer may occupy multiple platform rows because it has several agents.
      const removed = platformCustomers.value.filter(
        (item) => String(item.customerId) === String(target.customerId)
      ).length;
      platformCustomers.value = platformCustomers.value.filter(
        (item) => String(item.customerId) !== String(target.customerId)
      );
      platform.total.value = Math.max(0, platform.total.value - removed);
      if (platformInfo.value) {
        platformInfo.value = {
          ...platformInfo.value,
          items: platformCustomers.value,
          total: platform.total.value,
          customerCount: Math.max(0, (platformInfo.value.customerCount ?? 1) - 1)
        };
      }
      if (!platformCustomers.value.length && platform.page.value > 1) platform.page.value--;
      const results = await Promise.allSettled([
        readPage("platform", true),
        Promise.resolve().then(() => afterCustomerDeleted(() => session.current(context)))
      ]);
      if (!session.current(context)) return false;
      for (const result of results)
        if (result.status === "rejected") feedback.handled(result.reason);
      if (results.some((result) => result.status === "rejected"))
        await feedback.error(t("adminWorkflow.savedRefreshFailed"));
      else feedback.success(copy.platform().success);
      return true;
    } catch (error) {
      feedback.handled(error);
      if (session.current(context))
        await feedback.error(translate(adminErrorText(error, t("admin.employee.errorFallback"))), {
          popup: true
        });
      return false;
    } finally {
      if (session.current(context)) pending.value = false;
    }
  }
  return {
    platformInfo,
    platformCustomers,
    platformTotal: platform.total,
    platformPage: platform.page,
    platformPageSize: platform.size,
    customerHandovers,
    customerHandoverTotal: handovers.total,
    customerHandoverPage: handovers.page,
    customerHandoverPageSize: handovers.size,
    customerHandoverStatus,
    customerHandoversLoaded: handovers.loaded,
    adminTickets,
    adminTicketTotal: tickets.total,
    adminTicketPage: tickets.page,
    adminTicketPageSize: tickets.size,
    adminTicketsLoaded: tickets.loaded,
    busy,
    loadPlatformPage,
    loadCustomerHandoverPage,
    loadAdminTicketPage,
    refreshPlatformPage,
    refreshCustomerHandoverPage,
    refreshAdminTicketPage,
    handleDeletePlatformCustomer,
    changeCustomerHandoverStatus,
    changePlatformPage: (/** @type {number} */ page) => changePage("platform", page),
    changePlatformPageSize: (/** @type {number} */ size) => changePage("platform", 1, size),
    changeCustomerHandoverPage: (/** @type {number} */ page) => changePage("handovers", page),
    changeCustomerHandoverPageSize: (/** @type {number} */ size) =>
      changePage("handovers", 1, size),
    changeAdminTicketPage: (/** @type {number} */ page) => changePage("tickets", page),
    changeAdminTicketPageSize: (/** @type {number} */ size) => changePage("tickets", 1, size)
  };
}
