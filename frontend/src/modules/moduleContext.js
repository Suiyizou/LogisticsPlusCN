// @ts-check
import { inject, provide } from "vue";

/** @type {import("vue").InjectionKey<Readonly<Partial<import("../types/businessModulePages").BusinessModulePageMap>>>} */
const moduleContextKey = Symbol("business-module-pages");

// Transitional composition port: pages receive only their own explicit contract.
// The host keeps the existing workflow lifetime across list/detail navigation.
/** @param {Partial<import("../types/businessModulePages").BusinessModulePageMap>} pages */
export function provideModulePages(pages) {
  provide(moduleContextKey, Object.freeze({ ...pages }));
}

/**
 * @template {keyof import("../types/businessModulePages").BusinessModulePageMap} ModuleId
 * @param {ModuleId} moduleId
 * @returns {import("../types/businessModulePages").BusinessModulePageMap[ModuleId]}
 */
export function useModulePages(moduleId) {
  const pages = inject(moduleContextKey, null)?.[moduleId];
  if (!pages) throw Error(`Missing business module composition: ${moduleId}`);
  return pages;
}
