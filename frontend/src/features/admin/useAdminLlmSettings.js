// @ts-check
import { computed, reactive, ref, watch } from "vue";
import { adminErrorText, useAdminSessionGuard } from "./useAdminSessionGuard.js";

/** @param {import("../../types/adminWorkflows").AdminLlmPorts} ports */
export function useAdminLlmSettings({ currentUser, isHostBusy, services, feedback, t, translate }) {
  const defaults = () => ({
    enabled: true,
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    apiKey: "",
    clearApiKey: false
  });
  const llmForm = reactive(defaults());
  /** @type {import("vue").Ref<import("../../types/adminWorkflows").AdminLlmSettings | null>} */
  const llmSettings = ref(null);
  const pending = ref(false),
    reading = ref(0);
  const busy = computed(() => pending.value || reading.value > 0);
  const baseline = ref(JSON.stringify(defaults()));
  let revision = 0,
    readVersion = 0;
  const dirty = computed(() => JSON.stringify(llmForm) !== baseline.value);
  watch(
    llmForm,
    () => {
      revision++;
    },
    { flush: "sync" }
  );
  const session = useAdminSessionGuard({ currentUser, invalidate });

  function invalidate() {
    readVersion++;
    pending.value = false;
    reading.value = 0;
    llmSettings.value = null;
    Object.assign(llmForm, defaults());
    baseline.value = JSON.stringify(llmForm);
  }
  /** Only masked settings may be retained by the page. @param {import("../../types/adminWorkflows").AdminLlmSettings} data */
  function masked(data) {
    return {
      enabled: data?.enabled,
      baseUrl: data?.baseUrl,
      model: data?.model,
      provider: data?.provider,
      apiKeyConfigured: data?.apiKeyConfigured,
      apiKeyPreview: data?.apiKeyPreview
    };
  }
  /** @param {import("../../types/adminWorkflows").AdminLlmSettings} settings */
  function synchronize(settings) {
    Object.assign(llmForm, {
      ...defaults(),
      enabled: settings?.enabled ?? true,
      baseUrl: settings?.baseUrl || defaults().baseUrl,
      model: settings?.model || defaults().model
    });
    baseline.value = JSON.stringify(llmForm);
  }
  async function loadLlmSettings() {
    const context = session.capture();
    if (context === null || pending.value) return false;
    const version = ++readVersion,
      draft = revision,
      wasDirty = dirty.value;
    reading.value++;
    try {
      const data = await services.fetchLlmSettings();
      if (!session.current(context) || version !== readVersion) return false;
      llmSettings.value = masked(data);
      if (!wasDirty && draft === revision) synchronize(data);
      return true;
    } catch (error) {
      feedback.handled(error);
      if (session.current(context) && version === readVersion) throw error;
      return false;
    } finally {
      if (session.current(context)) reading.value--;
    }
  }
  async function handleUpdateLlmSettings() {
    const context = session.capture();
    if (context === null || busy.value || isHostBusy()) return false;
    const form = { ...llmForm },
      draft = revision;
    if (form.clearApiKey && form.apiKey) {
      await feedback.error(t("adminWorkflow.llmKeyConflict"));
      return false;
    }
    /** @type {import("../../types/adminWorkflows").AdminLlmPayload} */
    const payload = {
      enabled: form.enabled,
      baseUrl: form.baseUrl,
      model: form.model,
      clearApiKey: form.clearApiKey
    };
    if (form.apiKey) payload.apiKey = form.apiKey;
    pending.value = true;
    feedback.clear();
    try {
      const data = await services.updateLlmSettings(payload);
      if (!session.current(context)) return false;
      llmSettings.value = masked(data);
      if (draft === revision) synchronize(data);
      else {
        // Keep edits made during the request; wipe only the credential that was submitted.
        if (llmForm.apiKey === form.apiKey) llmForm.apiKey = "";
        if (llmForm.clearApiKey === form.clearApiKey) llmForm.clearApiKey = false;
        baseline.value = JSON.stringify({
          ...defaults(),
          enabled: data?.enabled ?? true,
          baseUrl: data?.baseUrl || defaults().baseUrl,
          model: data?.model || defaults().model
        });
      }
      feedback.success(t("adminWorkflow.llmSaved"));
      return true;
    } catch (error) {
      feedback.handled(error);
      if (session.current(context))
        await feedback.error(translate(adminErrorText(error, t("admin.employee.errorFallback"))));
      return false;
    } finally {
      if (session.current(context)) pending.value = false;
    }
  }
  return { llmSettings, llmForm, busy, dirty, loadLlmSettings, handleUpdateLlmSettings };
}
