import { describe, expect, it } from "vitest";

import { CHECKS, type CheckId, type Outcome } from "./catalog";
import type { CheckResult } from "./result";
import { isRecommended, lossWeight, SECTION_WEIGHTS, sectionScore, totalScore, verdict } from "./score";

const SECURITY_IDS = (Object.keys(CHECKS) as CheckId[]).filter((id) => CHECKS[id].section === "security");

/** Every security check ok, except the outcomes given. */
function security(outcomes: Partial<Record<CheckId, Outcome>> = {}): CheckResult[] {
  return SECURITY_IDS.map((id) => ({ id, outcome: outcomes[id] ?? "ok", found: [] }));
}

// The example of the M2 plan: a site with https in order and these defects.
const example: Partial<Record<CheckId, Outcome>> = {
  mixedContent: "warning", // an image over http: −5
  hsts: "warning", // −3.5
  clickjacking: "warning", // −3
  cookies: "warning", // PHPSESSID without Secure: −3
  exposedVersions: "warning", // Server: Apache/2.4.41: −2
  csp: "warning", // −1
  nosniff: "warning", // −1
  permissionsPolicy: "warning", // −0.5
};

describe("sectionScore", () => {
  it("uses weights that add up to 100 for security", () => {
    expect(SECURITY_IDS.reduce((sum, id) => sum + CHECKS[id].weight, 0)).toBe(100);
  });

  it("is 100 when every check is ok, and 0 when every check is a problem", () => {
    expect(sectionScore(security(), "security")).toEqual({ value: 100, partial: false });
    const allProblems = Object.fromEntries(SECURITY_IDS.map((id) => [id, "problem"]));
    expect(sectionScore(security(allProblems), "security")).toEqual({ value: 0, partial: false });
  });

  it("takes the whole weight for a problem and half for a warning", () => {
    expect(sectionScore(security({ https: "problem" }), "security")).toMatchObject({ value: 75 });
    expect(sectionScore(security({ hsts: "warning" }), "security")).toMatchObject({ value: 97 }); // 96.5, rounded up
  });

  it("takes a variant's own weight when it has one: several h1 lose as a recommendation", () => {
    const seo = (h1: CheckResult) =>
      (Object.keys(CHECKS) as CheckId[])
        .filter((id) => CHECKS[id].section === "seo")
        .map((id): CheckResult => (id === "h1" ? h1 : { id, outcome: "ok", found: [] }));
    // h1 weighs 6: missing loses 3 (half of 6), several lose 1.5 (half of 3).
    expect(sectionScore(seo({ id: "h1", outcome: "warning", variant: "none", found: [] }), "seo")).toMatchObject({ value: 97 });
    expect(sectionScore(seo({ id: "h1", outcome: "warning", variant: "many", found: [] }), "seo")).toMatchObject({ value: 99 }); // 98.5, rounded up
  });

  it("gives 81 for the example: 19 points lost out of 100", () => {
    expect(sectionScore(security(example), "security")).toEqual({ value: 81, partial: false });
  });

  it("gives 78, partial, when http times out in the example: 19 out of 88", () => {
    const results = security({ ...example, httpRedirect: "unverified" });
    expect(sectionScore(results, "security")).toEqual({ value: 78, partial: true });
  });

  it("gives 19 to a site without https: unverified checks do not raise the score", () => {
    const results = security({
      https: "problem",
      httpRedirect: "problem",
      certificateValid: "unverified",
      certificateExpiry: "unverified",
      mixedContent: "unverified",
      hsts: "unverified",
      clickjacking: "warning",
      cookies: "warning",
      exposedVersions: "warning",
      csp: "warning",
      nosniff: "warning",
      referrerPolicy: "warning",
      permissionsPolicy: "warning",
    });
    // 48 points lost out of 59.
    expect(sectionScore(results, "security")).toEqual({ value: 19, partial: true });
  });

  it("has no score when no check of the section could run, saying how many did not", () => {
    const allUnverified = Object.fromEntries(SECURITY_IDS.map((id) => [id, "unverified"]));
    expect(sectionScore(security(allUnverified), "security")).toEqual({ unverified: 13, checks: 13 });
    expect(sectionScore(security(), "seo")).toEqual({ unverified: 0, checks: 0 });
  });

  // neverssl.com on 2026-11-26: https closed the connection, http timed out, so only
  // the certificate could be read. It scored 100, Buono, before the minimum coverage.
  it("has no score for neverssl.com of 2026-11-26: only the certificate ran, 24 out of 100", () => {
    const unverified = SECURITY_IDS.filter((id) => !id.startsWith("certificate"));
    const results = security(Object.fromEntries(unverified.map((id) => [id, "unverified"])));
    expect(sectionScore(results, "security")).toEqual({ unverified: 11, checks: 13 });
  });

  it("still scores when the checks that ran weigh exactly half of the section", () => {
    // https 25 + certificateValid 20 + certificateExpiry 4 + permissionsPolicy 1 = 50 unverified.
    const half = { https: "unverified", certificateValid: "unverified", certificateExpiry: "unverified", permissionsPolicy: "unverified" } as const;
    expect(sectionScore(security(half), "security")).toEqual({ value: 100, partial: true });
    // One more point unverified (referrerPolicy 1): 49 out of 100 ran.
    expect(sectionScore(security({ ...half, referrerPolicy: "unverified" }), "security")).toEqual({ unverified: 5, checks: 13 });
  });
});

describe("totalScore", () => {
  it("weights the sections 35/25/25/15", () => {
    expect(Object.values(SECTION_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const full = { value: 100, partial: false };
    const zero = { value: 0, partial: false };
    expect(totalScore({ security: full, performance: zero, seo: zero, accessibility: zero })).toEqual({ value: 35, partial: false });
    expect(totalScore({ security: zero, performance: full, seo: full, accessibility: full })).toEqual({ value: 65, partial: false });
  });

  it("averages the sections that have a score, and says it is partial", () => {
    // (81 × 35 + 60 × 25) / 60 = 72.25
    expect(totalScore({ security: { value: 81, partial: false }, seo: { value: 60, partial: false } })).toEqual({
      value: 72,
      partial: true,
    });
  });

  it("has no total when the sections with a score weigh less than half", () => {
    const score = { value: 80, partial: false };
    expect(totalScore({ security: score })).toBeUndefined(); // 35
    expect(totalScore({ performance: score, accessibility: score })).toBeUndefined(); // 40
    expect(totalScore({ security: score, accessibility: score })).toEqual({ value: 80, partial: true }); // exactly 50
  });

  it("is partial when a section is", () => {
    const ok = { value: 90, partial: false };
    expect(totalScore({ security: { value: 90, partial: true }, performance: ok, seo: ok, accessibility: ok })?.partial).toBe(true);
  });

  it("has no score without sections", () => {
    expect(totalScore({})).toBeUndefined();
  });
});

describe("verdict", () => {
  it.each([
    [100, "good"],
    [90, "good"],
    [89, "improve"],
    [60, "improve"],
    [59, "critical"],
    [0, "critical"],
  ] as const)("%i is %s", (score, expected) => {
    expect(verdict(score)).toBe(expected);
  });
});

describe("isRecommended", () => {
  it.each([
    [{ id: "csp", outcome: "warning" }, true],
    [{ id: "sitemap", outcome: "warning", variant: "missing" }, true],
    [{ id: "h1", outcome: "warning", variant: "many" }, true],
    [{ id: "h1", outcome: "warning", variant: "none" }, false],
    [{ id: "exposedVersions", outcome: "warning" }, false],
    [{ id: "csp", outcome: "ok" }, false],
  ] as const)("%o → %s", (result, expected) => {
    expect(isRecommended({ ...result, found: [] })).toBe(expected);
  });

  it("uses the check's weight when the variant has none", () => {
    expect(lossWeight({ id: "sitemap", outcome: "warning", variant: "missing", found: [] })).toBe(CHECKS.sitemap.weight);
  });
});
