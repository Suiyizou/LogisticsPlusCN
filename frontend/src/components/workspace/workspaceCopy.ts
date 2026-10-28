import { i18n, t } from "../../i18n";
import { workspaceRefinementMessages } from "../../i18n/workspaceRefinementMessages.js";
for (const locale of ["zh-CN", "en-US"] as const) {
  i18n.global.mergeLocaleMessage(locale, workspaceRefinementMessages[locale]);
}
export function wt(key: string, values?: Record<string, string | number>) {
  return t(`workspaceV2.${key}`, values);
}
