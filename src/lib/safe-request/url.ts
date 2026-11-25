import { isIP } from "node:net";

import { SafeRequestError } from "./errors";

const DEFAULT_PORT = { "http:": "80", "https:": "443" } as const;

/**
 * Turns what the user typed into a URL, or throws SafeRequestError.
 * Accepts "trattoriadamario.it" without a scheme (SPEC, Home).
 */
export function normalizeAddress(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new SafeRequestError("invalid_url", "empty address");

  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new SafeRequestError("invalid_url", "unparsable address");
  }

  url.hash = "";
  // "esempio.it." is a valid FQDN, but a trailing dot breaks SNI and the Host header.
  if (url.hostname.endsWith(".")) url.hostname = url.hostname.slice(0, -1);
  checkUrl(url);
  return url;
}

/**
 * The rules of ADR-0002 that depend only on the URL; applied to the address typed
 * and again to every redirect. new URL() has already turned decimal, hex and octal
 * IPv4 forms into dotted notation, so the IP check below catches them too.
 */
export function checkUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeRequestError("not_allowed", `scheme ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new SafeRequestError("not_allowed", "credentials in URL");
  }
  // new URL() empties the port when it is the scheme default: anything else is another port.
  if (url.port && url.port !== DEFAULT_PORT[url.protocol]) {
    throw new SafeRequestError("not_allowed", `port ${url.port}`);
  }

  const host = url.hostname;
  if (isIP(host.replace(/^\[|\]$/g, ""))) {
    throw new SafeRequestError("not_public", "IP literal host");
  }
  if (!host.includes(".") || host.endsWith(".")) {
    throw new SafeRequestError("not_public", "host without a top-level domain");
  }
}
