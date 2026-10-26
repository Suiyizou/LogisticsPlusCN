// @ts-check
import { rawAdminPages } from "./definitions.js";
const loaders = {
  overview: () => import("../../features/admin/AdminOverviewPage.vue"),
  audit: () => import("../../features/admin/AdminAuditPage.vue"),
  employees: () => import("../../features/admin/AdminEmployeesPage.vue"),
  platform: () => import("../../features/admin/AdminPlatformPage.vue"),
  handovers: () => import("../../features/admin/AdminHandoversPage.vue"),
  tickets: () => import("../../features/admin/AdminTicketsPage.vue"),
  announcements: () => import("../../features/admin/AdminAnnouncementsPage.vue"),
  devices: () => import("../../features/admin/AdminDevicesPage.vue"),
  files: () => import("../../features/admin/AdminFilesPage.vue"),
  system: () => import("../../features/admin/AdminSystemSettingsPage.vue")
};
/** @type {import("../../types/moduleRegistry").BusinessModuleRegistration[]} */
export const adminRegistrations = rawAdminPages.map((page, order) => ({
  module: {
    id: `admin-${page.key}`,
    mount: page.key,
    surface: "admin",
    labelKey: `admin.${page.key}`,
    roles: ["ADMIN"],
    navigation: { group: page.group, order },
    pages: [{ name: `admin-${page.key}`, path: "", view: `admin-${page.key}` }]
  },
  views: { [`admin-${page.key}`]: loaders[/** @type {keyof typeof loaders} */ (page.key)] }
}));
