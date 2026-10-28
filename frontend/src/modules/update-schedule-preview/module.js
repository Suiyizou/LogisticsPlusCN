// @ts-check
/** @type {import("../../types/moduleRegistry").BusinessModuleRegistration} */
export const updateSchedulePreviewRegistration = {
  module: {
    id: "update-schedule-preview",
    mount: "update-schedule",
    surface: "business",
    icon: "Operation",
    labelKey: "updateSchedulePreview.title",
    roles: ["ADMIN", "BUSINESS"],
    navigation: { group: "business", order: 0 },
    pages: [{ name: "business-update-schedule-preview", path: "", view: "updateSchedulePreview" }]
  },
  views: { updateSchedulePreview: () => import("./pages/UpdateSchedulePreviewPage.vue") }
};
