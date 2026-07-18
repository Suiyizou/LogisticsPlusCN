import { computed, ref } from "vue";
import { createI18n } from "vue-i18n";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import en from "element-plus/es/locale/lang/en";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, localeOptions, messages } from "./messages";

const STORAGE_KEY = "cargo-planner-locale";

function normalizeLocale(value) {
  const raw = String(value || "").toLowerCase();
  if (raw.startsWith("en")) return "en-US";
  if (raw.startsWith("zh")) return "zh-CN";
  return "";
}

function initialLocale() {
  try {
    const saved = normalizeLocale(localStorage.getItem(STORAGE_KEY));
    if (SUPPORTED_LOCALES.includes(saved)) return saved;
  } catch {
    // localStorage can be unavailable in hardened browser contexts.
  }
  const browserLocale = typeof navigator === "undefined" ? "" : normalizeLocale(navigator.language);
  return SUPPORTED_LOCALES.includes(browserLocale) ? browserLocale : DEFAULT_LOCALE;
}

export const currentLocale = ref(initialLocale());

export const i18n = createI18n({
  legacy: false,
  locale: currentLocale.value,
  fallbackLocale: DEFAULT_LOCALE,
  messages,
  missingWarn: false,
  fallbackWarn: false
});

export const elementPlusLocale = computed(() => currentLocale.value === "en-US" ? en : zhCn);
export { localeOptions };

export function getCurrentLocale() {
  return currentLocale.value;
}

export function setLocale(locale) {
  const next = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  currentLocale.value = next;
  i18n.global.locale.value = next;
  document.documentElement.lang = next;
  document.title = i18n.global.t("app.name");
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Non-critical persistence failure.
  }
  window.dispatchEvent(new CustomEvent("cargo-planner-locale-change", { detail: { locale: next } }));
}

export function toggleLocale() {
  setLocale(currentLocale.value === "zh-CN" ? "en-US" : "zh-CN");
}

export function t(key, params) {
  return i18n.global.t(key, params);
}

setLocale(currentLocale.value);
