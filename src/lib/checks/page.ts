import { SafeRequestError, type SafeRequestErrorCode, type SafeResponse } from "@/lib/safe-request";

import type { CheckId, ReasonCode } from "./catalog";
import { isClientRendered, parseHtml, visibleText, type CheerioAPI } from "./html";
import type { HttpTrace } from "./https";
import type { CheckResult } from "./result";

/** The response the page checks read: headers, cookies and HTML, and whether the browser builds its content. */
export type Page = { response: SafeResponse; overHttp: boolean; html?: CheerioAPI; clientRendered?: boolean };
export type NoPage = { reason: ReasonCode; found: string[] };

// https does not answer, or its certificate is refused: the http version stands in (SPEC, regole comuni).
const FALLBACK_CODES = new Set<SafeRequestErrorCode>([
  "tls_error",
  "connection_refused",
  "connection_reset",
  "connection_failed",
  "timeout",
]);

export function choosePage(https: SafeResponse | SafeRequestError, trace: HttpTrace): Page | NoPage {
  if (!(https instanceof SafeRequestError)) return readPage(https);
  const httpsFound = `https: ${https.code} (${https.message})`;
  if (!FALLBACK_CODES.has(https.code)) return { reason: https.code, found: [httpsFound] };
  if (trace.page) return readPage(trace.page);

  const httpEnd = trace.error ? `${trace.error.code} (${trace.error.message})` : `rimanda a ${trace.hops.at(-1)?.location}`;
  const found = [httpsFound, `http: ${httpEnd}`];
  return { reason: trace.error?.code === "scan_deadline" ? "scan_deadline" : "page_unreachable", found };
}

export function readPage(response: SafeResponse): Page {
  const html = parseHtml(response);
  return { response, overHttp: response.url.protocol === "http:", html, clientRendered: html && isClientRendered(html) };
}

/** A header as one string: Node joins repeated headers with ", ". Empty counts as missing. */
export function header(page: Page, name: string): string | undefined {
  const value = page.response.headers[name.toLowerCase()];
  return (Array.isArray(value) ? value.join(", ") : value)?.trim() || undefined;
}

/** "Valori letti" line for a header, with its original spelling. */
export function headerLine(page: Page, name: string): string {
  return `${name}: ${header(page, name) ?? "assente"}`;
}

/**
 * Runs a check on the HTML of the page. Without HTML it is unverified; a content check
 * (headings, images, forms, links) is unverified too when the browser builds the page.
 */
export function htmlCheck(
  id: CheckId,
  page: Page,
  evaluate: ($: CheerioAPI) => CheckResult,
  { content = false }: { content?: boolean } = {},
): CheckResult {
  if (!page.html) return { id, outcome: "unverified", reason: "not_html", found: [headerLine(page, "Content-Type")] };
  if (content && page.clientRendered) {
    const text = visibleText(page.html).length;
    return { id, outcome: "unverified", reason: "client_rendered", found: [`Testo visibile nell'HTML: ${text} caratteri, contenitore dell'app vuoto`] };
  }
  return evaluate(page.html);
}

/** For checks that only mean something on an https page: the missing https is counted elsewhere. */
export function readOverHttp(id: CheckId, page: Page): CheckResult {
  return { id, outcome: "unverified", reason: "read_over_http", found: [`Pagina letta: ${page.response.url.href}`] };
}
