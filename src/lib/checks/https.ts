import { SafeRequestError, type SafeRequestOptions, type SafeResponse } from "@/lib/safe-request";

import { asError, unverified, type CheckResult } from "./result";

type Request = (url: URL, options?: SafeRequestOptions) => Promise<SafeResponse>;

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * "Il sito risponde in https": any response counts. A rejected certificate still means
 * the site answers in https; its validity is judged only by the certificate check.
 * A connection closed before any response counts as no https when http on the same
 * host answers (decided in M3); otherwise the site may simply be down.
 */
export function evaluateHttps(result: SafeResponse | SafeRequestError, httpTrace: HttpTrace): CheckResult {
  const id = "https";
  if (!(result instanceof SafeRequestError)) {
    const chain = [...result.redirects, result.url].map(String).join(" → ");
    const found = [`${chain} (${result.status})`];
    return { id, outcome: result.url.protocol === "https:" ? "ok" : "problem", found };
  }
  const found = [`${result.code}: ${result.message}`];
  switch (result.code) {
    case "tls_error":
    case "too_large":
    case "bad_response":
      return { id, outcome: "ok", found };
    case "connection_refused":
      return { id, outcome: "problem", found };
    case "connection_reset": {
      const httpAnswer = httpTrace.hops[0];
      if (!httpAnswer) return unverified(id, result);
      return { id, outcome: "problem", found: [...found, `${httpAnswer.url} → ${httpAnswer.status}`] };
    }
    default:
      return unverified(id, result);
  }
}

export type HttpHop = { url: string; status: number; location?: string };
export type HttpTrace = {
  hops: HttpHop[];
  error?: SafeRequestError;
  /** The last http response when it is a page, not a redirect: the fallback for the page checks. */
  page?: SafeResponse;
};

/** Follows redirects one by one while they stay on http, at most 5 (SPEC, "Da http:// si arriva a https://"). */
export async function traceHttpRedirects(target: URL, request: Request, signal?: AbortSignal): Promise<HttpTrace> {
  const hops: HttpHop[] = [];
  let url = new URL(target);
  url.protocol = "http:";

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    let response: SafeResponse;
    try {
      response = await request(url, { followRedirects: false, signal });
    } catch (error) {
      return { hops, error: asError(error) };
    }
    const location = response.headers.location;
    let next: URL | undefined;
    if (location && REDIRECT_STATUSES.has(response.status)) {
      try {
        next = new URL(location, url);
      } catch {
        // An unparsable Location leads nowhere: the chain ends here.
      }
    }
    hops.push({ url: url.href, status: response.status, location: next?.href });
    if (!next) return { hops, page: response };
    if (next.protocol !== "http:") return { hops };
    url = next;
  }
  return { hops, error: new SafeRequestError("too_many_redirects", `more than ${MAX_REDIRECTS} redirects on http`) };
}

export function evaluateHttpRedirect(trace: HttpTrace): CheckResult {
  const id = "httpRedirect";
  const found = trace.hops.map((hop) => `${hop.url} → ${hop.status}${hop.location ? ` → ${hop.location}` : ""}`);

  if (trace.error) {
    if (trace.hops.length === 0 && trace.error.code === "connection_refused") {
      return { id, outcome: "warning", found: [`${trace.error.code}: ${trace.error.message}`] };
    }
    const result = unverified(id, trace.error);
    return { ...result, found: [...found, ...result.found] };
  }
  const last = trace.hops.at(-1);
  const reachesHttps = last?.location?.startsWith("https://") ?? false;
  return { id, outcome: reachesHttps ? "ok" : "problem", found };
}
