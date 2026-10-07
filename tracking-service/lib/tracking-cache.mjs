/**
 * 追踪请求缓存与 in-flight 去重。
 *
 * 从 server.mjs 下沉：TTL 缓存 + 同一 key 的并发请求复用。批量任务与强制刷新不参与
 * in-flight 复用（与原实现一致）。
 */
export function createTrackingCache({ ttlMs }) {
  const cache = new Map();
  const inFlight = new Map();

  return {
    peek(key) {
      return cache.get(key);
    },
    invalidate(key) {
      cache.delete(key);
    },
    getInFlight(key) {
      return inFlight.get(key);
    },
    setInFlight(key, promise) {
      inFlight.set(key, promise);
    },
    clearInFlight(key, promise) {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    },
    store(key, value, now = Date.now()) {
      cache.set(key, { value, expiresAt: now + ttlMs });
    }
  };
}
