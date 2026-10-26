// @ts-check
import {
  PLATFORM_ACTION_COPY,
  TICKET_COPY,
  HANDOVER_COPY
} from "../../i18n/adminBusinessMessages.js";
/** @param {{ locale: () => string, t: import("../../types/adminWorkflows").AdminWorkflowPorts["t"], ui: import("../../types/adminWorkflows").AdminWorkflowPorts["t"] }} ports */
export function createAdminBusinessCopy({ locale, t, ui }) {
  const language = () => (locale() === "en-US" ? "en-US" : "zh-CN");
  function platform() {
    return {
      ...PLATFORM_ACTION_COPY[language()],
      summary: (/** @type {number} */ customers, /** @type {number} */ assigned) =>
        ui("admin.platform.summary", { customers, assigned }),
      customer: ui("admin.platform.customer"),
      clientCode: ui("admin.platform.clientCode"),
      partyRole: ui("admin.platform.partyRole"),
      business: ui("admin.platform.business"),
      agent: ui("admin.platform.agent"),
      unassigned: ui("admin.platform.unassigned"),
      shipments: ui("admin.platform.shipments"),
      empty: ui("admin.platform.empty"),
      status: t("admin.list.status"),
      actions: t("admin.list.actions"),
      manage: t("admin.console.manage"),
      refresh: ui("admin.files.refresh")
    };
  }
  return {
    platform,
    ticket: () => TICKET_COPY[language()],
    handover: () => HANDOVER_COPY[language()],
    separator: () => (language() === "en-US" ? ", " : "、")
  };
}
