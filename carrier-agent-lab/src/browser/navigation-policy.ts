import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { OFFICIAL_HOSTS } from "../carriers.js";

export interface NavigationPolicyOptions {
  mode: "official-only" | "public-https";
  allowLocalhost?: boolean;
  extraHosts?: string[];
  allowedHosts?: string[];
}

export interface ResolvedNavigation {
  url: URL;
  hostname: string;
  address: string;
  family: 4 | 6;
}

const NON_PUBLIC_ADDRESSES = buildNonPublicBlockList();
const LOOPBACK_ADDRESSES = new BlockList();
LOOPBACK_ADDRESSES.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK_ADDRESSES.addSubnet("::1", 128, "ipv6");

export async function assertNavigableUrl(rawUrl: string, options: NavigationPolicyOptions): Promise<URL> {
  return (await resolveNavigableUrl(rawUrl, options)).url;
}

/** Resolve, validate, and return the numeric address that the socket must use. */
export async function resolveNavigableUrl(
  rawUrl: string,
  options: NavigationPolicyOptions,
): Promise<ResolvedNavigation> {
  const url = new URL(rawUrl);
  if (url.username || url.password) throw new Error("Browser navigation does not allow URL credentials");
  const hostname = normalizeHostname(url.hostname);
  const localhostCandidate = options.allowLocalhost === true
    && ["http:", "https:"].includes(url.protocol)
    && isLoopbackName(hostname);
  if (localhostCandidate) {
    const localAddresses = await resolveAddresses(hostname);
    if (localAddresses.length > 0 && localAddresses.every(({ address }) => isLoopbackAddress(address))) {
      const localAddress = localAddresses[0]!;
      return { url, hostname, address: localAddress.address, family: localAddress.family };
    }
    throw new Error("Local test hostname did not resolve exclusively to loopback");
  }
  if (url.protocol !== "https:") {
    throw new Error("Browser navigation only allows public HTTPS URLs");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Browser navigation only allows the standard HTTPS port");
  }
  if (isLocalName(hostname)) throw new Error("Local and private hosts are blocked");
  const allowedHosts = options.allowedHosts ?? [...OFFICIAL_HOSTS, ...(options.extraHosts ?? [])];
  if (options.mode === "official-only" && !hostMatches(hostname, allowedHosts)) {
    throw new Error(`Host is outside the official carrier allowlist: ${hostname}`);
  }
  const addresses = await resolveAddresses(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => isNonPublicAddress(address))) {
    throw new Error(`Host resolves to a private, reserved, or unavailable address: ${hostname}`);
  }
  const address = addresses[0]!;
  return { url, hostname, address: address.address, family: address.family };
}

function hostMatches(hostname: string, allowed: string[]): boolean {
  return allowed.some((rawHost) => {
    const host = normalizeHostname(rawHost);
    return hostname === host || hostname.endsWith(`.${host}`);
  });
}

function isLocalName(hostname: string): boolean {
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || (isIP(hostname) !== 0 && isNonPublicAddress(hostname));
}

function isLoopbackName(hostname: string): boolean {
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || (isIP(hostname) !== 0 && isLoopbackAddress(hostname));
}

function isNonPublicAddress(address: string): boolean {
  const value = normalizeHostname(address);
  const family = isIP(value);
  return family === 0 || NON_PUBLIC_ADDRESSES.check(value, family === 6 ? "ipv6" : "ipv4");
}

function isLoopbackAddress(address: string): boolean {
  const value = normalizeHostname(address);
  const family = isIP(value);
  return family !== 0 && LOOPBACK_ADDRESSES.check(value, family === 6 ? "ipv6" : "ipv4");
}

function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  return lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
}

async function resolveAddresses(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>> {
  const family = isIP(hostname);
  if (family !== 0) return [{ address: hostname, family: family as 4 | 6 }];
  const results = await lookup(hostname, { all: true });
  return results
    .filter((result): result is { address: string; family: 4 | 6 } => result.family === 4 || result.family === 6)
    .map(({ address, family: addressFamily }) => ({
      address: normalizeHostname(address),
      family: addressFamily,
    }));
}

function buildNonPublicBlockList(): BlockList {
  const blockList = new BlockList();
  const ipv4: Array<[string, number]> = [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
  ];
  const ipv6: Array<[string, number]> = [
    ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48],
    ["100::", 64], ["2001::", 23], ["2001:db8::", 32], ["2002::", 16],
    ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
  ];
  for (const [network, prefix] of ipv4) blockList.addSubnet(network, prefix, "ipv4");
  for (const [network, prefix] of ipv6) blockList.addSubnet(network, prefix, "ipv6");
  return blockList;
}
