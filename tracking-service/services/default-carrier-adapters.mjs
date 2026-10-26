import { createHash } from "node:crypto";
import { fetchCmaTracking } from "../lib/cma-query.mjs";
import { closeCmaPlaywrightBrowser } from "../channels/cma-playwright.mjs";
import { createCarrierAdapterRegistry } from "../lib/carrier-adapter-registry.mjs";
import {
  CARRIER_ADAPTERS,
  normalizeQueryChannel,
  normalizeTrackingRequest
} from "../lib/carrier-adapters.mjs";
import { HttpError, secureTextEquals } from "../lib/http-utils.mjs";
export function createDefaultCarrierAdapters({
  cosco,
  adapterKey = "",
  fetchCma = fetchCmaTracking,
  closeCma = closeCmaPlaywrightBrowser
}) {
  function authorizeProxy(headers) {
    const expected = String(adapterKey ?? "").trim();
    if (!expected)
      throw new HttpError(503, "Proxy channel internal authorization is not configured", {
        code: "COSCO_PROXY_ACCESS_NOT_CONFIGURED"
      });
    if (!hasProxyAuthorization(headers))
      throw new HttpError(403, "Proxy tracking channel requires business authorization", {
        code: "COSCO_PROXY_FORBIDDEN"
      });
  }
  function hasProxyAuthorization(headers) {
    return secureTextEquals(
      String(headers["x-tracking-adapter-key"] ?? "").trim(),
      String(adapterKey ?? "").trim()
    );
  }
  function authorizeCoscoChannel(queryChannel, headers) {
    if (
      queryChannel.code === "PROXY" ||
      (queryChannel.code === "PLAYWRIGHT" && cosco.hasPlaywrightProxy)
    )
      authorizeProxy(headers);
  }
  const coscoAdapter = {
    ...CARRIER_ADAPTERS.COSCO,
    capabilities: {
      types: ["BOOKING", "CONTAINER"],
      channels: ["AUTO", "NETWORK", "PLAYWRIGHT", "PROXY"],
      defaultChannel: "AUTO"
    },
    prepare(input, { channel, headers }) {
      const queryChannel = normalizeQueryChannel(channel ?? input.channel ?? "AUTO");
      authorizeCoscoChannel(queryChannel, headers);
      return {
        tracking: normalizeTrackingRequest(input),
        channel: queryChannel,
        // AUTO can fall back to private proxy routes. Neither cached results nor
        // in-flight work may cross that authorization boundary; never retain the key.
        cacheScope: hasProxyAuthorization(headers) ? "proxy-authorized" : "public",
        authorizeProxy: () => authorizeProxy(headers)
      };
    },
    track(prepared, options) {
      return cosco.runTracking(prepared.tracking, prepared.channel, {
        ...options,
        authorizeProxyFallback: prepared.authorizeProxy
      });
    },
    authorizeChannel: authorizeCoscoChannel,
    health: () => cosco.getHealth(),
    dispose: () => cosco.dispose?.()
  };
  const cmaAdapter = {
    ...CARRIER_ADAPTERS.CMA,
    capabilities: {
      types: ["BOOKING", "CONTAINER"],
      channels: ["PLAYWRIGHT"],
      defaultChannel: "PLAYWRIGHT"
    },
    prepare(input, { headers }) {
      const credentials = {
        sessionCookie: String(headers["x-cma-session-cookie"] ?? "").trim(),
        userAgent: String(headers["x-cma-browser-user-agent"] ?? "").trim()
      };
      return {
        tracking: normalizeTrackingRequest(input),
        channel: normalizeQueryChannel("PLAYWRIGHT"),
        credentials,
        cacheScope: createHash("sha256").update(JSON.stringify(credentials)).digest("hex")
      };
    },
    track(prepared, { signal }) {
      return fetchCma(prepared.tracking, prepared.credentials, { signal });
    },
    health: () => ({ status: "on-demand", carrier: "CMA" }),
    dispose: closeCma
  };
  return createCarrierAdapterRegistry([coscoAdapter, cmaAdapter]);
}
