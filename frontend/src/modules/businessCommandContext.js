// @ts-check
import { inject, provide } from "vue";
/** @type {import("vue").InjectionKey<ReturnType<typeof import("./businessCommands.js").useBusinessCommands>>} */
const businessCommandKey = Symbol("business-commands");
/** @param {ReturnType<typeof import("./businessCommands.js").useBusinessCommands>} commands */
export function provideBusinessCommands(commands) {
  provide(businessCommandKey, commands);
}
export function useBusinessCommandContext() {
  const commands = inject(businessCommandKey, null);
  if (!commands) throw Error("Business commands must be supplied by the business workspace");
  return commands;
}
