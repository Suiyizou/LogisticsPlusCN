// @ts-check
import { adminConsoleMessages } from "../../i18n/adminConsoleMessages.js";
/** @param {string} locale */
export function adminConsoleCopy(locale) {
  return adminConsoleMessages[locale === "en-US" ? "en-US" : "zh-CN"];
}
/** @param {()=>string} getLocale */
export function createAdminConsoleCopy(getLocale) {
  return () => adminConsoleCopy(getLocale());
}
