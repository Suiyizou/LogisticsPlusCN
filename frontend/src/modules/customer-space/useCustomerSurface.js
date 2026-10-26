import { computed, onScopeDispose, readonly, ref } from "vue";
import { customerSurfaceFallback } from "./customerCopy.js";
/** This runtime belongs to the customer host, independently of all employee sessions. */
export function useCustomerSurface({ session, api, t = customerSurfaceFallback }) {
  const principal = ref(null),
    checked = ref(false),
    busy = ref(false),
    error = ref("");
  let version = 0,
    disposed = false;
  const valid = (request) => !disposed && request === version;
  const user = computed(() => (principal.value ? { ...principal.value, role: "CUSTOMER" } : null));
  async function restore() {
    const request = ++version,
      token = session.readToken();
    busy.value = true;
    error.value = "";
    principal.value = null;
    try {
      if (!token || session.expired() || !session.read()?.customer?.id) {
        session.clear();
        return false;
      }
      // There is no customer/me endpoint. The protected list is the existing server-side auth probe.
      await api.request("/customer/shipments?page=1&pageSize=1", { token });
      if (!valid(request) || session.readToken() !== token) return false;
      principal.value = session.read().customer;
      return true;
    } catch (failure) {
      if (valid(request)) error.value = failure?.message || String(failure);
      return false;
    } finally {
      if (valid(request)) {
        checked.value = true;
        busy.value = false;
      }
    }
  }
  async function login(credentials) {
    const request = ++version;
    busy.value = true;
    error.value = "";
    try {
      const response = await api.login(credentials);
      if (!response?.token || !response?.customer?.id)
        throw Error(t("customerSurface.invalidLogin"));
      if (!valid(request)) return false;
      await api.request("/customer/shipments?page=1&pageSize=1", { token: response.token });
      if (!valid(request)) return false;
      session.save(response);
      principal.value = response.customer;
      checked.value = true;
      return true;
    } catch (failure) {
      if (valid(request)) error.value = failure?.message || String(failure);
      return false;
    } finally {
      if (valid(request)) busy.value = false;
    }
  }
  function expire() {
    ++version;
    principal.value = null;
    busy.value = false;
    checked.value = true;
    error.value = t("customerSurface.expired");
  }
  async function logout() {
    const token = session.readToken();
    ++version;
    principal.value = null;
    session.clear();
    busy.value = false;
    checked.value = true;
    error.value = "";
    try {
      if (token) await api.request("/customer/logout", { method: "POST", token });
    } catch {
      /* Local access is already revoked. */
    }
  }
  onScopeDispose(() => {
    disposed = true;
    ++version;
    principal.value = null;
  });
  return {
    user,
    checked: readonly(checked),
    busy: readonly(busy),
    error: readonly(error),
    restore,
    login,
    logout,
    expire
  };
}
