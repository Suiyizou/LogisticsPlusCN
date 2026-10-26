// @ts-check
/** @type {WeakMap<Response,()=>void>} */
const responseGuards = new WeakMap();

/** @param {Response} response */
export function assertResponseIdentity(response) {
  responseGuards.get(response)?.();
}
/**
 * A request belongs to the identity that started it. Late 401s and successful
 * responses cannot clear or populate a newer session.
 * @param {{readToken:()=>string, expire:()=>void, headerName:string, fetchImpl?:typeof fetch}} options
 */
export function createIdentityFetch({
  readToken,
  expire,
  headerName,
  fetchImpl = globalThis.fetch
}) {
  if (!["X-Auth-Token", "X-Customer-Token"].includes(headerName))
    throw new Error("Unsupported identity header");
  /** @type {typeof fetch} */
  const authenticatedFetch = async (input, init) => {
    const token = readToken();
    if (!token) throw Object.assign(new Error("Authentication required"), { status: 401 });
    const request = new Request(input, init);
    // A caller cannot smuggle the other identity into a typed module request.
    request.headers.delete("X-Auth-Token");
    request.headers.delete("X-Customer-Token");
    request.headers.set(headerName, token);
    const response = await fetchImpl(request);
    if (readToken() !== token) throw new DOMException("Session changed", "AbortError");
    // Parsing a streamed JSON body can finish after another login. Check again
    // in contractData after parsing, rather than only when response headers arrive.
    if (response.status !== 401)
      responseGuards.set(response, () => {
        if (readToken() !== token) throw new DOMException("Session changed", "AbortError");
      });
    if (response.status === 401) expire();
    return response;
  };
  return authenticatedFetch;
}
