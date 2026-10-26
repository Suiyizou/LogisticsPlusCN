import createClient from "openapi-fetch";
import type { paths } from "../generated/platform-api";
import { createIdentityFetch, assertResponseIdentity } from "./identityFetch.js";
import { storedToken, clearSession } from "./authSession.js";
import { storedCustomerToken, clearCustomerSession } from "./customerSession.js";
import { notifyApiFailure } from "./apiClient.js";

export class ContractApiError extends Error {
  readonly apiError = true;
  readonly status: number;
  readonly code?: string;
  readonly errorId?: string;
  readonly retryAfterMs?: number;
  constructor(response: Response, body: unknown) {
    const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    super(typeof data.message === "string" ? data.message : `API ${response.status}`);
    this.name = "ContractApiError";
    this.status = response.status;
    this.code = typeof data.code === "string" ? data.code : undefined;
    this.errorId = typeof data.errorId === "string" ? data.errorId : undefined;
    this.retryAfterMs = typeof data.retryAfterMs === "number" ? data.retryAfterMs : undefined;
  }
}

export function createContractClient(identity: "employee" | "customer" = "employee") {
  const employee = identity === "employee";
  const base = import.meta.env.VITE_API_BASE_URL || "/api";
  return createClient<paths>({
    baseUrl: new URL(base, window.location.origin).href.replace(/\/$/, ""),
    fetch: createIdentityFetch({
      readToken: employee ? storedToken : storedCustomerToken,
      headerName: employee ? "X-Auth-Token" : "X-Customer-Token",
      expire() {
        (employee ? clearSession : clearCustomerSession)();
        window.dispatchEvent(new CustomEvent(employee ? "auth-expired" : "customer-auth-expired"));
      }
    })
  });
}

export async function contractData<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>
): Promise<T> {
  try {
    const result = await request;
    assertResponseIdentity(result.response);
    if (!result.response.ok) throw new ContractApiError(result.response, result.error);
    if (result.data === undefined) throw new Error("Expected a JSON API response");
    return result.data;
  } catch (error) {
    notifyApiFailure(error);
    throw error;
  }
}
