import { lookup } from "node:dns/promises";

import { SafeRequestError } from "./errors";
import { isPublicAddress } from "./ip";

export type ResolvedAddress = { address: string; family: number };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

// family 0 without ADDRCONFIG hints: getaddrinfo returns every A and AAAA record.
export const systemResolver: Resolver = (hostname) => lookup(hostname, { all: true, family: 0 });

/**
 * Resolves the name once and returns the IP to connect to (ADR-0002, rules 3 and 4).
 * One non-public address among the answers blocks the request; IPv4 is preferred
 * for the connection.
 */
export async function resolvePublic(hostname: string, resolve: Resolver): Promise<string> {
  let answers: ResolvedAddress[];
  try {
    answers = await resolve(hostname);
  } catch (error) {
    throw new SafeRequestError("dns_failed", `lookup failed: ${(error as NodeJS.ErrnoException).code ?? error}`);
  }
  if (answers.length === 0) throw new SafeRequestError("dns_failed", "no addresses");

  const blocked = answers.find((answer) => !isPublicAddress(answer.address));
  if (blocked) throw new SafeRequestError("not_public", `resolves to non-public ${blocked.address}`);

  return (answers.find((answer) => answer.family === 4) ?? answers[0]).address;
}
