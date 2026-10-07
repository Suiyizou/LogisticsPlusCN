/** COSCO 上游保护类错误判定。从 server.mjs 下沉，供路由与归一化共用。 */

export function isCoscoBlockedError(error) {
  return error?.details?.code === "COSCO_UPSTREAM_BLOCKED" || error?.upstreamStatus === 403;
}

export function isCoscoProtectionError(error) {
  return (
    isCoscoBlockedError(error) ||
    error?.details?.code === "COSCO_UPSTREAM_RATE_LIMITED" ||
    error?.details?.code === "COSCO_UPSTREAM_UNAVAILABLE" ||
    error?.code === "COSCO_QUEUE_BUSY" ||
    error?.status === 429 ||
    error?.httpStatus === 429 ||
    error?.upstreamStatus === 429
  );
}
