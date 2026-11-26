import { describe, expect, it } from "vitest";

import {
  directive,
  evaluateClickjacking,
  evaluateCsp,
  evaluateExposedVersions,
  evaluateHsts,
  evaluateNosniff,
  evaluatePermissionsPolicy,
  evaluateReferrerPolicy,
} from "./headers";
import { testPage } from "./test-page";

const metaCsp = (policy: string) =>
  `<html><head><meta http-equiv="Content-Security-Policy" content="${policy}"></head><body></body></html>`;

describe("evaluateHsts", () => {
  it.each([
    ["max-age=15768000", "ok"],
    ["max-age=63072000; includeSubDomains; preload", "ok"],
    ['max-age="31536000"', "ok"],
    ["includeSubDomains; MAX-AGE=31536000", "ok"],
    ["max-age=15767999", "warning"],
    ["max-age=0", "warning"],
    ["includeSubDomains", "warning"],
    // Repeated headers: browsers use the first.
    ["max-age=300, max-age=31536000", "warning"],
  ])("%s is %s", (value, outcome) => {
    const result = evaluateHsts(testPage({ "strict-transport-security": value }));
    expect(result).toMatchObject({ id: "hsts", outcome, found: [`Strict-Transport-Security: ${value}`] });
  });

  it("is a warning when missing", () => {
    expect(evaluateHsts(testPage())).toMatchObject({ outcome: "warning", found: ["Strict-Transport-Security: assente"] });
  });

  it("is unverified on a page read over http", () => {
    const result = evaluateHsts(testPage({ "strict-transport-security": "max-age=31536000" }, undefined, "http://esempio.it/"));
    expect(result).toMatchObject({ outcome: "unverified", reason: "read_over_http" });
  });
});

describe("evaluateCsp", () => {
  it("is ok with the header", () => {
    expect(evaluateCsp(testPage({ "content-security-policy": "default-src 'self'" }))).toMatchObject({
      id: "csp",
      outcome: "ok",
      found: ["Content-Security-Policy: default-src 'self'"],
    });
  });

  it("is ok with a <meta http-equiv> policy, and says so (deviation from the SPEC)", () => {
    const result = evaluateCsp(testPage({}, metaCsp("default-src 'self'")));
    expect(result).toMatchObject({ outcome: "ok", found: ["CSP via meta: default-src 'self'"] });
  });

  it("ignores Report-Only, which enforces nothing", () => {
    expect(evaluateCsp(testPage({ "content-security-policy-report-only": "default-src 'self'" })).outcome).toBe("warning");
  });

  it("is a warning when missing, and on a page that is not HTML", () => {
    expect(evaluateCsp(testPage()).outcome).toBe("warning");
    expect(evaluateCsp(testPage({ "content-type": "application/json" }, metaCsp("default-src 'self'"))).outcome).toBe("warning");
  });
});

describe("evaluateClickjacking", () => {
  it.each(["DENY", "sameorigin", " SAMEORIGIN ", "DENY, DENY"])("is ok with X-Frame-Options %s", (value) => {
    expect(evaluateClickjacking(testPage({ "x-frame-options": value })).outcome).toBe("ok");
  });

  it.each(["ALLOW-FROM https://altro.it/", "allowall", ""])("is a warning with X-Frame-Options %j", (value) => {
    expect(evaluateClickjacking(testPage({ "x-frame-options": value })).outcome).toBe("warning");
  });

  it("is ok with frame-ancestors in the CSP header", () => {
    const result = evaluateClickjacking(testPage({ "content-security-policy": "default-src 'self'; frame-ancestors 'none'" }));
    expect(result).toMatchObject({ outcome: "ok" });
    expect(result.found).toContain("frame-ancestors nell'header Content-Security-Policy: frame-ancestors 'none'");
  });

  it("does not count frame-ancestors in a <meta> policy, which browsers ignore", () => {
    const result = evaluateClickjacking(testPage({}, metaCsp("frame-ancestors 'none'")));
    expect(result.outcome).toBe("warning");
    expect(result.found).toContain("frame-ancestors 'none' nel tag <meta>: ignorato dai browser");
  });

  it("is a warning when nothing protects the page", () => {
    expect(evaluateClickjacking(testPage())).toMatchObject({
      id: "clickjacking",
      outcome: "warning",
      found: ["X-Frame-Options: assente", "frame-ancestors nell'header Content-Security-Policy: assente"],
    });
  });
});

describe("evaluateNosniff", () => {
  it.each([
    ["nosniff", "ok"],
    ["NoSniff ", "ok"],
    ["sniff", "warning"],
  ])("%j is %s", (value, outcome) => {
    expect(evaluateNosniff(testPage({ "x-content-type-options": value })).outcome).toBe(outcome);
  });

  it("is a warning when missing", () => {
    expect(evaluateNosniff(testPage())).toMatchObject({ outcome: "warning", found: ["X-Content-Type-Options: assente"] });
  });
});

describe("evaluateReferrerPolicy and evaluatePermissionsPolicy", () => {
  it("are ok when the header is there", () => {
    expect(evaluateReferrerPolicy(testPage({ "referrer-policy": "strict-origin-when-cross-origin" })).outcome).toBe("ok");
    expect(evaluatePermissionsPolicy(testPage({ "permissions-policy": "camera=()" })).outcome).toBe("ok");
  });

  it("are warnings when the header is missing or empty", () => {
    expect(evaluateReferrerPolicy(testPage({ "referrer-policy": " " })).outcome).toBe("warning");
    expect(evaluatePermissionsPolicy(testPage())).toMatchObject({ outcome: "warning", found: ["Permissions-Policy: assente"] });
  });
});

describe("evaluateExposedVersions", () => {
  it.each(["nginx/1.18.0 (Ubuntu)", "Apache/2.4.41", "Microsoft-IIS/10.0", "Apache 2.4"])("is a warning for Server: %s", (server) => {
    expect(evaluateExposedVersions(testPage({ server })).outcome).toBe("warning");
  });

  it.each(["PHP/8.1.2", "PHP/8"])("is a warning for X-Powered-By: %s", (poweredBy) => {
    expect(evaluateExposedVersions(testPage({ "x-powered-by": poweredBy })).outcome).toBe("warning");
  });

  it.each([{ server: "nginx" }, { server: "cloudflare" }, { "x-powered-by": "ASP.NET" }, { "x-powered-by": "Next.js" }, {}])(
    "is ok for %j",
    (headers) => {
      expect(evaluateExposedVersions(testPage(headers)).outcome).toBe("ok");
    },
  );

  it("shows both headers", () => {
    expect(evaluateExposedVersions(testPage({ server: "nginx/1.18.0" })).found).toEqual([
      "Server: nginx/1.18.0",
      "X-Powered-By: assente",
    ]);
  });
});

describe("directive", () => {
  it("finds a directive across policies joined by Node", () => {
    expect(directive("default-src 'self', frame-ancestors 'none'", "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("default-src 'self'; upgrade-insecure-requests", "upgrade-insecure-requests")).toBe(
      "upgrade-insecure-requests",
    );
    expect(directive("default-src 'self'", "frame-ancestors")).toBeUndefined();
    expect(directive(undefined, "frame-ancestors")).toBeUndefined();
  });
});
