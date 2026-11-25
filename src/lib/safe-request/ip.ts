import ipaddr from "ipaddr.js";

/**
 * True only for addresses anyone on the internet could reach (ADR-0002).
 * Allowlist: after unwrapping IPv4-mapped IPv6, only the "unicast" range passes;
 * private, loopback, link-local, reserved, multicast, tunnels (6to4, Teredo, NAT64) do not.
 */
export function isPublicAddress(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  return ipaddr.process(ip).range() === "unicast";
}
