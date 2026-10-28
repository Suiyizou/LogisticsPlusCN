import { i18n, t } from "../../i18n";
import { businessCompMessages } from "../../i18n/businessCompMessages";

for (const locale of ["zh-CN", "en-US"] as const) {
  i18n.global.mergeLocaleMessage(locale, businessCompMessages[locale]);
}

export function bwt(key: string) {
  return t(`businessComp.${key}`);
}
