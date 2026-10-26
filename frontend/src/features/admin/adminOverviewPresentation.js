// @ts-check
import { adminOverviewCopy } from "./adminOverviewCopy.js";

/** @param {unknown} value */
export function adminCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
/** @param {number | null | undefined} value */
export function adminMetric(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? String(value) : "-";
}
/** @param {string | number | null | undefined} value */
export function adminRecordId(value) {
  return value != null && value !== "" ? String(value) : "-";
}
/** @param {string | number | null | undefined} value */
export function adminTargetId(value) {
  const id = adminRecordId(value);
  return id === "-" ? id : `#${id}`;
}
/** @param {string | null | undefined} value @param {string} locale */
export function formatAdminAuditDate(value, locale) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat(locale === "en-US" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
/** @param {string | null | undefined} value */
export function formatAdminOverviewDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "-";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? `${value.slice(5, 7)}/${value.slice(8, 10)}`
    : "-";
}
/** @param {() => string} getLocale */
export function createAdminOverviewPresentation(getLocale) {
  /** @param {string | null | undefined} code */
  function action(code) {
    const copy = adminOverviewCopy(getLocale());
    if (code === "EMPTY") return copy.noOperations;
    return (
      (code && copy.actions[code]) ||
      String(code || "-")
        .toLowerCase()
        .replaceAll("_", " ")
    );
  }
  /** @param {string | null | undefined} code */
  function category(code) {
    const copy = adminOverviewCopy(getLocale());
    if (code === "BUSINESS") return copy.businessCategory;
    if (code === "MANAGEMENT") return copy.managementCategory;
    return code || "-";
  }
  /** @param {string | null | undefined} code */
  function target(code) {
    return (code && adminOverviewCopy(getLocale()).targets[code]) || code || "-";
  }
  return { action, category, target };
}

/** @param {{busy:boolean,page:number,total:number,pageSize:number}} state @param {number} nextPage */
export function canChangeAdminAuditPage(state, nextPage) {
  return (
    !state.busy &&
    Number.isInteger(nextPage) &&
    nextPage > 0 &&
    nextPage !== state.page &&
    Number.isInteger(state.pageSize) &&
    state.pageSize > 0 &&
    Number.isFinite(state.total) &&
    state.total >= 0 &&
    nextPage <= Math.max(1, Math.ceil(state.total / state.pageSize))
  );
}
