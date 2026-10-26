// @ts-check
import { adminOverviewMessages } from "../../i18n/adminOverviewMessages.js";
/** @param {string} locale */
export function adminOverviewCopy(locale) {
  return adminOverviewMessages[locale === "en-US" ? "en-US" : "zh-CN"];
}
