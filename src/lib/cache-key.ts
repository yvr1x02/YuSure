/**
 * Key of the 24-hour report cache (ADR-0003): normalized domain + path of the address typed.
 * Scheme, query string and fragment do not count, nor a trailing slash.
 * Expects a URL from normalizeAddress: host already lowercase, without the trailing dot.
 */
export function cacheKey(url: URL): string {
  return normalizedDomain(url) + url.pathname.replace(/\/+$/, "");
}

/** Lowercase, without "www." (ADR-0003, `domain` column). */
export function normalizedDomain(url: URL): string {
  return url.hostname.replace(/^www\./, "");
}
