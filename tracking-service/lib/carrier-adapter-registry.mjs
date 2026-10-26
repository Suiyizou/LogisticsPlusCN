import { HttpError } from "./http-utils.mjs";
/** The executable registry owns adapter lifecycle; HTTP has no carrier-specific dispatch. */
export function createCarrierAdapterRegistry(adapters) {
  const entries = new Map();
  for (const adapter of adapters) {
    const { code, name, capabilities } = adapter;
    if (
      !/^[A-Z][A-Z0-9_-]*$/.test(code || "") ||
      entries.has(code) ||
      !name ||
      !capabilities ||
      !Array.isArray(capabilities.types) ||
      !capabilities.types.length ||
      !Array.isArray(capabilities.channels) ||
      !capabilities.channels.length ||
      [...capabilities.types, ...capabilities.channels].some(
        (value) => typeof value !== "string" || !value.trim()
      ) ||
      (adapter.health !== undefined && typeof adapter.health !== "function") ||
      (adapter.dispose !== undefined && typeof adapter.dispose !== "function") ||
      !capabilities.channels.includes(capabilities.defaultChannel) ||
      typeof adapter.prepare !== "function" ||
      typeof adapter.track !== "function"
    )
      throw Error(`Invalid or duplicate executable carrier adapter: ${code}`);
    entries.set(
      code,
      Object.freeze({
        ...adapter,
        capabilities: Object.freeze({
          ...capabilities,
          types: Object.freeze([...capabilities.types]),
          channels: Object.freeze([...capabilities.channels])
        })
      })
    );
  }
  let disposal;
  const get = (value) => {
    const code = String(value || "COSCO")
        .trim()
        .toUpperCase(),
      adapter = entries.get(code);
    if (!adapter) throw new HttpError(400, "不支持的船司");
    if (adapter.enabled === false) throw new HttpError(501, `${adapter.name} 适配器尚未接入`);
    return adapter;
  };
  return Object.freeze({
    get,
    list: () =>
      [...entries.values()].map(({ code, name, enabled = true, source, capabilities }) => ({
        code,
        name,
        enabled,
        source,
        channel: capabilities.defaultChannel,
        channels: [...capabilities.channels].filter((channel) => channel !== "AUTO"),
        defaultChannel: capabilities.defaultChannel,
        capabilities: {
          ...capabilities,
          types: [...capabilities.types],
          channels: [...capabilities.channels]
        }
      })),
    health: async (code) => {
      const adapter = get(code);
      return adapter.health ? adapter.health() : { status: "unknown", carrier: adapter.code };
    },
    dispose: () => {
      disposal ||= Promise.allSettled(
        [...entries.values()].map((adapter) => Promise.resolve().then(() => adapter.dispose?.()))
      ).then((results) => {
        const failures = results
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason);
        if (failures.length) throw new AggregateError(failures, "Carrier adapter cleanup failed");
      });
      return disposal;
    }
  });
}
