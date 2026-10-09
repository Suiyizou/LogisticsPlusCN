import { fetchCmaTrackingViaPlaywright } from "../channels/cma-playwright.mjs";
import { normalizeCmaSnapshot } from "./cma-tracking.mjs";
import { HttpError, batchCancelledHttpError } from "./http-utils.mjs";

/** CMA CGM 查询与快照完整性判定。从 server.mjs 下沉。 */

export async function fetchCmaTracking(request, credentials = {}, options = {}) {
  let result;
  try {
    result = await fetchCmaTrackingViaPlaywright(request, {
      timeoutMs: Number.parseInt(process.env.CMA_PLAYWRIGHT_TIMEOUT_MS ?? "45000", 10),
      sessionCookie: credentials.sessionCookie || undefined,
      userAgent: credentials.userAgent || undefined,
      signal: options.signal
    });
  } catch (error) {
    if (options.signal?.aborted || error?.code === "BATCH_CANCELLED") {
      throw batchCancelledHttpError();
    }
    throw new HttpError(
      error?.httpStatus ?? 502,
      error?.message || "CMA CGM Playwright 查询失败",
      error?.details
    );
  }

  return {
    snapshot: normalizeCmaSnapshot(result, request, new Date().toISOString()),
    raw: result,
    strategy: {
      requested: "PLAYWRIGHT",
      used: "PLAYWRIGHT",
      fallbackUsed: false
    }
  };
}

export function snapshotHasCompleteContainerDetails(snapshot, trackingRequest) {
  if (trackingRequest.type === "CONTAINER") {
    return Array.isArray(snapshot?.containers) && snapshot.containers.length > 0;
  }

  const expectedContainerCount = (snapshot?.summary?.containers ?? []).reduce(
    (total, container) => total + Number(container?.quantity ?? container?.count ?? 0),
    0
  );
  if (expectedContainerCount <= 0) return true;

  const actualContainerCount = new Set(
    (snapshot?.containers ?? [])
      .map((container) =>
        String(container?.number ?? "")
          .trim()
          .toUpperCase()
      )
      .filter(Boolean)
  ).size;
  return actualContainerCount >= expectedContainerCount;
}
