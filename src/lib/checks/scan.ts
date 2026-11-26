import { SafeRequestError, type CertificateInfo, type SafeRequestOptions, type SafeResponse } from "@/lib/safe-request";

import { evaluateAccessibleNames, evaluateFormLabels, evaluateImageAlt } from "./accessibility";
import { CHECKS, type CheckId } from "./catalog";
import { evaluateCertificate } from "./certificate";
import { evaluateCookies } from "./cookies";
import {
  evaluateClickjacking,
  evaluateCsp,
  evaluateExposedVersions,
  evaluateHsts,
  evaluateNosniff,
  evaluatePermissionsPolicy,
  evaluateReferrerPolicy,
} from "./headers";
import { evaluateHttpRedirect, evaluateHttps, traceHttpRedirects } from "./https";
import { evaluateMixedContent } from "./mixed-content";
import { choosePage, type Page } from "./page";
import { asError, type CheckResult } from "./result";
import { evaluateRobots, evaluateSitemap, sitemapUrl } from "./robots";
import {
  evaluateCanonical,
  evaluateH1,
  evaluateLang,
  evaluateMetaDescription,
  evaluateNoindex,
  evaluateOpenGraph,
  evaluateStructuredData,
  evaluateTitle,
  evaluateViewport,
} from "./seo";

export const SCAN_TIMEOUT_MS = 30_000;

/** The network side of a scan: the bound functions of @/lib/safe-request in production. */
export type ScanIO = {
  safeRequest: (url: URL, options?: SafeRequestOptions) => Promise<SafeResponse>;
  inspectCertificate: (url: URL, options?: Pick<SafeRequestOptions, "signal">) => Promise<CertificateInfo>;
};

export type ScanReport = {
  url: string;
  scannedAt: string;
  /** The address the page checks read; set only when it is the http fallback (SPEC, regole comuni). */
  readOverHttp?: string;
  results: CheckResult[];
};

// Checks on the page itself; the report lists every result in catalog order.
const PAGE_CHECKS: [CheckId, (page: Page) => CheckResult][] = [
  ["mixedContent", evaluateMixedContent],
  ["hsts", evaluateHsts],
  ["csp", evaluateCsp],
  ["clickjacking", evaluateClickjacking],
  ["nosniff", evaluateNosniff],
  ["referrerPolicy", evaluateReferrerPolicy],
  ["permissionsPolicy", evaluatePermissionsPolicy],
  ["cookies", evaluateCookies],
  ["exposedVersions", evaluateExposedVersions],
  ["noindex", evaluateNoindex],
  ["title", evaluateTitle],
  ["viewport", evaluateViewport],
  ["metaDescription", evaluateMetaDescription],
  ["lang", evaluateLang],
  ["h1", evaluateH1],
  ["canonical", evaluateCanonical],
  ["openGraph", evaluateOpenGraph],
  ["structuredData", evaluateStructuredData],
  ["imageAlt", evaluateImageAlt],
  ["formLabels", evaluateFormLabels],
  ["accessibleNames", evaluateAccessibleNames],
];
const CATALOG_ORDER = Object.keys(CHECKS);

export type ScanOutcome = { ok: true; report: ScanReport } | { ok: false; reason: "not_public" | "dns_failed" };

export async function runScan(
  address: URL,
  io: ScanIO,
  { now = new Date(), timeoutMs = SCAN_TIMEOUT_MS }: { now?: Date; timeoutMs?: number } = {},
): Promise<ScanOutcome> {
  const deadline = AbortSignal.timeout(timeoutMs);
  // SPEC: the https version is analysed even when the address was typed with http://.
  const target = new URL(address);
  target.protocol = "https:";

  const [page, httpTrace, certificate] = await Promise.all([
    io.safeRequest(target, { signal: deadline }).catch(asError),
    traceHttpRedirects(target, io.safeRequest, deadline),
    io.inspectCertificate(target, { signal: deadline }).catch(asError),
  ]);

  // The certificate probe follows no redirects: its DNS answer is the site's own.
  if (certificate instanceof SafeRequestError && (certificate.code === "not_public" || certificate.code === "dns_failed")) {
    logFailure(target, "site", certificate);
    return { ok: false, reason: certificate.code };
  }
  for (const [check, error] of [
    ["https", page],
    ["httpRedirect", httpTrace.error],
    ["certificate", certificate],
  ] as const) {
    if (error instanceof SafeRequestError) logFailure(target, check, error);
  }

  const source = choosePage(page, httpTrace);
  const pageResults = PAGE_CHECKS.map(([id, evaluate]): CheckResult =>
    "reason" in source ? { id, outcome: "unverified", reason: source.reason, found: source.found } : evaluate(source),
  );

  // robots.txt and the sitemap of the host the page was read from, after its redirects (ADR-0002).
  const origin = "response" in source ? source.response.url.origin : target.origin;
  const robotsAt = new URL("/robots.txt", origin);
  const robots = await io.safeRequest(robotsAt, { signal: deadline }).catch(asError);
  const sitemap = sitemapUrl(robots, origin);
  const sitemapResponse = await io.safeRequest(sitemap.url, { signal: deadline }).catch(asError);

  return {
    ok: true,
    report: {
      url: target.href,
      scannedAt: now.toISOString(),
      ...("response" in source && source.overHttp && { readOverHttp: source.response.url.href }),
      results: [
        evaluateHttps(page, httpTrace),
        evaluateHttpRedirect(httpTrace),
        ...evaluateCertificate(certificate, now),
        ...pageResults,
        evaluateRobots(robots, robotsAt),
        evaluateSitemap(sitemapResponse, sitemap),
      ].sort((a, b) => CATALOG_ORDER.indexOf(a.id) - CATALOG_ORDER.indexOf(b.id)),
    },
  };
}

// Technical reasons stay in the server logs (ADR-0002): the scanned host, never who scanned it.
function logFailure(target: URL, check: string, error: SafeRequestError) {
  console.warn(`[scan] ${target.hostname} ${check}: ${error.code} (${error.message})`);
}
