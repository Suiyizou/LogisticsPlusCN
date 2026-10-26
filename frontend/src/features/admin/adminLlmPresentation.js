// @ts-check

/** @param {Pick<import("../../types/adminWorkflows").AdminWorkflowPorts, "t">} ports */
export function createAdminLlmPresentation({ t }) {
  /** @param {import("../../types/adminWorkflows").AdminLlmSettings | null} settings */
  function status(settings) {
    const key =
      settings?.enabled == null
        ? "llmUnloaded"
        : !settings.enabled
          ? "llmDisabled"
          : settings.apiKeyConfigured
            ? "llmEnabled"
            : "llmMissingKey";
    return t(`adminWorkflow.${key}`);
  }
  /** @param {import("../../types/adminWorkflows").AdminLlmSettings | null} settings */
  function keyStatus(settings) {
    if (settings?.apiKeyConfigured == null) return t("adminWorkflow.llmUnloaded");
    if (!settings.apiKeyConfigured) return t("adminWorkflow.llmKeyMissing");
    const preview = settings.apiKeyPreview?.trim();
    return preview
      ? t("adminWorkflow.llmKeyConfigured", { preview })
      : t("adminWorkflow.llmKeyConfiguredOnly");
  }
  return { status, keyStatus };
}
