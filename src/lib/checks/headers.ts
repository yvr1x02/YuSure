import { metaCsp } from "./html";
import { header, headerLine, readOverHttp, type Page } from "./page";
import type { CheckResult } from "./result";

// Six months, the minimum of the SPEC (182.5 days).
const HSTS_MIN_SECONDS = 15_768_000;
// "nginx/1.18.0", "PHP/8", "Apache 2.4": a slash before a number, or a dotted number.
const VERSION = /\/\s*v?\d|\d+\.\d+/i;

/** The first of repeated values, which is the one browsers apply. */
const first = (value?: string) => value?.split(",")[0].trim().toLowerCase();

export function evaluateHsts(page: Page): CheckResult {
  const id = "hsts";
  // Browsers ignore HSTS received over http.
  if (page.overHttp) return readOverHttp(id, page);
  const directives = first(header(page, "Strict-Transport-Security"))?.split(";") ?? [];
  const maxAge = directives.map((d) => d.trim().match(/^max-age\s*=\s*"?(\d+)"?$/)?.[1]).find(Boolean);
  const outcome = Number(maxAge) >= HSTS_MIN_SECONDS ? "ok" : "warning";
  return { id, outcome, found: [headerLine(page, "Strict-Transport-Security")] };
}

/** Deviation from the SPEC, approved in M2: a <meta http-equiv> policy counts too. */
export function evaluateCsp(page: Page): CheckResult {
  const id = "csp";
  if (header(page, "Content-Security-Policy")) {
    return { id, outcome: "ok", found: [headerLine(page, "Content-Security-Policy")] };
  }
  const meta = page.html ? metaCsp(page.html) : [];
  if (meta.length > 0) return { id, outcome: "ok", found: meta.map((policy) => `CSP via meta: ${policy}`) };
  return { id, outcome: "warning", found: [headerLine(page, "Content-Security-Policy")] };
}

export function evaluateClickjacking(page: Page): CheckResult {
  const id = "clickjacking";
  const frameOptions = first(header(page, "X-Frame-Options"));
  const frameAncestors = directive(header(page, "Content-Security-Policy"), "frame-ancestors");
  const found = [
    headerLine(page, "X-Frame-Options"),
    `frame-ancestors nell'header Content-Security-Policy: ${frameAncestors ?? "assente"}`,
  ];
  // Browsers ignore frame-ancestors in a <meta> policy: shown, never counted.
  const metaAncestors = page.html ? metaCsp(page.html).map((p) => directive(p, "frame-ancestors")).find(Boolean) : undefined;
  if (metaAncestors) found.push(`${metaAncestors} nel tag <meta>: ignorato dai browser`);

  const protectedByHeader = frameOptions === "deny" || frameOptions === "sameorigin" || frameAncestors !== undefined;
  return { id, outcome: protectedByHeader ? "ok" : "warning", found };
}

export function evaluateNosniff(page: Page): CheckResult {
  const outcome = first(header(page, "X-Content-Type-Options")) === "nosniff" ? "ok" : "warning";
  return { id: "nosniff", outcome, found: [headerLine(page, "X-Content-Type-Options")] };
}

export function evaluateReferrerPolicy(page: Page): CheckResult {
  const outcome = header(page, "Referrer-Policy") ? "ok" : "warning";
  return { id: "referrerPolicy", outcome, found: [headerLine(page, "Referrer-Policy")] };
}

export function evaluatePermissionsPolicy(page: Page): CheckResult {
  const outcome = header(page, "Permissions-Policy") ? "ok" : "warning";
  return { id: "permissionsPolicy", outcome, found: [headerLine(page, "Permissions-Policy")] };
}

export function evaluateExposedVersions(page: Page): CheckResult {
  const names = ["Server", "X-Powered-By"];
  const exposed = names.some((name) => VERSION.test(header(page, name) ?? ""));
  return { id: "exposedVersions", outcome: exposed ? "warning" : "ok", found: names.map((name) => headerLine(page, name)) };
}

/** A CSP directive with its value, from any of the policies Node joined with ", ". */
export function directive(policy: string | undefined, name: string): string | undefined {
  return policy
    ?.split(/[;,]/)
    .map((d) => d.trim())
    .find((d) => d.toLowerCase() === name || d.toLowerCase().startsWith(`${name} `));
}
