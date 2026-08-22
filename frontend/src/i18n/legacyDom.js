import { currentLocale, getCurrentLocale } from "./index";
import { translateLegacyText } from "./legacyText";

const textSource = new WeakMap();
const attrSource = new WeakMap();
const translatableAttrs = ["placeholder", "title", "aria-label", "alt"];

function hasChinese(text) {
  return /[\u3400-\u9fff]/.test(String(text || ""));
}

function shouldSkipNode(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return Boolean(element?.closest?.("[data-i18n-ignore], script, style, code, pre"));
}

function translateTextNode(node, locale) {
  if (!node.nodeValue || !node.nodeValue.trim() || shouldSkipNode(node)) return;
  if (locale === "zh-CN") {
    if (textSource.has(node)) node.nodeValue = textSource.get(node);
    else textSource.set(node, node.nodeValue);
    return;
  }
  if (hasChinese(node.nodeValue)) textSource.set(node, node.nodeValue);
  const source = textSource.get(node) || node.nodeValue;
  const translated = translateLegacyText(source, locale);
  if (translated !== node.nodeValue) node.nodeValue = translated;
}

function translateElementAttrs(element, locale) {
  if (shouldSkipNode(element)) return;
  let sources = attrSource.get(element);
  if (!sources) {
    sources = {};
    attrSource.set(element, sources);
  }
  translatableAttrs.forEach((attr) => {
    const value = element.getAttribute(attr);
    if (!value) return;
    if (locale === "zh-CN") {
      if (sources[attr]) element.setAttribute(attr, sources[attr]);
      else sources[attr] = value;
      return;
    }
    if (hasChinese(value)) sources[attr] = value;
    const source = sources[attr] || value;
    const translated = translateLegacyText(source, locale);
    if (translated !== value) element.setAttribute(attr, translated);
  });
}

function walk(root, locale) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root, locale);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) translateElementAttrs(root, locale);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, locale);
    else translateElementAttrs(node, locale);
    node = walker.nextNode();
  }
}

function patchDialogs() {
  if (window.__cargoPlannerDialogI18nPatched) return;
  const nativeConfirm = window.confirm.bind(window);
  const nativeAlert = window.alert.bind(window);
  window.confirm = (message) => nativeConfirm(translateLegacyText(message, getCurrentLocale()));
  window.alert = (message) => nativeAlert(translateLegacyText(message, getCurrentLocale()));
  window.__cargoPlannerDialogI18nPatched = true;
}

export function installLegacyDomI18n(root = document.getElementById("app")) {
  if (!root || root.__cargoPlannerLegacyI18nInstalled) return;
  root.__cargoPlannerLegacyI18nInstalled = true;
  patchDialogs();

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      walk(root, currentLocale.value);
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: translatableAttrs
  });

  window.addEventListener("cargo-planner-locale-change", schedule);
  schedule();
}
