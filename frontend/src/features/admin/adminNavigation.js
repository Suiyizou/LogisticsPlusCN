// @ts-check
import { adminNavigationEnglish } from "../../i18n/adminNavigationMessages.js";
import { rawAdminPages, rawAdminNavGroups } from "../../modules/admin/definitions.js";
import { platformModules } from "../../modules/registry.js";
import { modulesForSurface } from "../../modules/moduleCatalog.js";
export { rawAdminPages, rawAdminNavGroups } from "../../modules/admin/definitions.js";
/** Resolve built-in route metadata through the same bilingual page titles as the admin shell.
 * @param {string} titleKey @param {string} locale */
export function adminRouteTitle(titleKey, locale) {
  const page = rawAdminPages.find((entry) => titleKey === `admin.${entry.key}`);
  if (!page) return "";
  return locale === "en-US"
    ? adminNavigationEnglish.pages[page.key]?.title || page.title
    : page.title;
}
/** @param {string} locale
 * @param {(key: string) => string} translate
 * @param {import("../../types/moduleRegistry").BusinessModuleDefinition[]} modules */
export function adminNavigation(locale, translate = (key) => key, modules = platformModules) {
  const english = locale === "en-US";
  const pages = modulesForSurface(modules, "admin", "ADMIN").map((module) => {
    const builtin = rawAdminPages.find((page) => module.id === `admin-${page.key}`);
    const page = builtin || {
      key: module.id,
      no: "",
      group: module.navigation?.group || "settings",
      groupLabel: "",
      label: translate(module.labelKey),
      description: "",
      eyebrow: "",
      title: translate(module.labelKey),
      subtitle: ""
    };
    return {
      ...page,
      ...(english && builtin ? adminNavigationEnglish.pages[builtin.key] : {}),
      group: module.navigation?.group || page.group,
      routeName: module.pages.find((entry) => entry.path === "")?.name || "",
      moduleId: module.id
    };
  });
  const groups = rawAdminNavGroups.map((group) => ({
    ...group,
    ...(english ? adminNavigationEnglish.groups[group.key] : {})
  }));
  for (const page of pages)
    if (!groups.some((group) => group.key === page.group))
      groups.push({ key: page.group, no: "", label: page.group, description: "" });
  return { pages, groups };
}
