import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { SafeRequestError, type SafeResponse } from "@/lib/safe-request";

import { blocksAll, evaluateRobots, evaluateSitemap, parseRobots, sitemapUrl } from "./robots";

const robotsAt = new URL("https://esempio.it/robots.txt");
const answer = (status: number, body: string | Buffer = "", headers: Record<string, string> = {}): SafeResponse => ({
  url: robotsAt,
  status,
  headers,
  body: Buffer.isBuffer(body) ? body : Buffer.from(body),
  address: "8.8.8.8",
  redirects: [],
});

describe("parseRobots", () => {
  it("prefers Googlebot's own group over *", () => {
    const robots = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nDisallow: /admin\n");
    expect(robots).toMatchObject({ agent: "googlebot", rules: [{ allow: false, path: "/admin" }] });
  });

  it("shares rules among consecutive User-agent lines and merges groups naming the same agent", () => {
    const robots = parseRobots("User-agent: bingbot\nUser-agent: *\nDisallow: /tmp\n\nUser-agent: *\nAllow: /tmp/ok\n");
    expect(robots.rules).toEqual([
      { allow: false, path: "/tmp" },
      { allow: true, path: "/tmp/ok" },
    ]);
  });

  it("ignores comments, a BOM, CRLF and case, and collects Sitemap lines anywhere", () => {
    const robots = parseRobots("﻿Sitemap: https://esempio.it/a.xml\r\nUSER-AGENT: * # tutti\r\nDISALLOW: /privato\r\nsitemap: https://esempio.it/b.xml\r\n");
    expect(robots).toMatchObject({ agent: "*", rules: [{ allow: false, path: "/privato" }] });
    expect(robots.sitemaps).toEqual(["https://esempio.it/a.xml", "https://esempio.it/b.xml"]);
  });

  it("finds no group for Google when only others are named", () => {
    expect(parseRobots("User-agent: bingbot\nDisallow: /\n")).toMatchObject({ agent: undefined, rules: [] });
  });
});

describe("blocksAll", () => {
  it.each([
    ["User-agent: *\nDisallow: /", true],
    ["User-agent: *\nDisallow: /*", true],
    ["User-agent: *\nDisallow: /\nAllow: /menu", false],
    ["User-agent: *\nDisallow: /\nAllow:", true],
    ["User-agent: *\nDisallow:", false],
    ["User-agent: *\nDisallow: /admin", false],
    ["User-agent: Googlebot\nDisallow:\n\nUser-agent: *\nDisallow: /", false],
    ["", false],
  ])("%j → %s", (text, expected) => {
    expect(blocksAll(parseRobots(text))).toBe(expected);
  });
});

describe("evaluateRobots", () => {
  it("passes when Google may visit", () => {
    expect(evaluateRobots(answer(200, "User-agent: *\nDisallow: /admin\n"), robotsAt)).toMatchObject({
      outcome: "ok",
      found: ["https://esempio.it/robots.txt: 200", "regole per User-agent: *", "Disallow: /admin"],
    });
  });

  it("warns when it blocks everything", () => {
    expect(evaluateRobots(answer(200, "User-agent: *\nDisallow: /\n"), robotsAt)).toMatchObject({ outcome: "warning", variant: "blocksAll" });
  });

  it.each([404, 403, 410])("warns that it is missing on %i", (status) => {
    expect(evaluateRobots(answer(status), robotsAt)).toMatchObject({ outcome: "warning", variant: "missing" });
  });

  it.each([500, 503])("is a problem on %i: Google stops crawling", (status) => {
    expect(evaluateRobots(answer(status), robotsAt)).toMatchObject({ outcome: "problem", variant: "serverError" });
  });

  it("is unverified when the request fails", () => {
    expect(evaluateRobots(new SafeRequestError("timeout", "test"), robotsAt)).toMatchObject({ outcome: "unverified", reason: "timeout" });
  });
});

describe("sitemapUrl", () => {
  const origin = "https://esempio.it";

  it("takes the first http(s) Sitemap line of robots.txt", () => {
    const robots = answer(200, "Sitemap: /relativa.xml\nSitemap: ftp://esempio.it/s.xml\nSitemap: https://cdn.esempio.it/sitemap_index.xml\n");
    expect(sitemapUrl(robots, origin)).toEqual({ url: new URL("https://cdn.esempio.it/sitemap_index.xml"), declared: true });
  });

  it.each([
    ["no Sitemap line", answer(200, "User-agent: *\nDisallow:")],
    ["a missing robots.txt", answer(404, "Sitemap: https://esempio.it/x.xml")],
    ["a failed request", new SafeRequestError("timeout", "test")],
  ])("falls back to /sitemap.xml with %s", (_case, robots) => {
    expect(sitemapUrl(robots, origin)).toEqual({ url: new URL("https://esempio.it/sitemap.xml"), declared: false });
  });
});

describe("evaluateSitemap", () => {
  const at = { url: new URL("https://esempio.it/sitemap.xml"), declared: false };

  it.each([
    ['<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://esempio.it/</loc></url></urlset>'],
    ['<?xml version="1.0"?>\n<?xml-stylesheet href="/s.xsl"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>'],
    [gzipSync("<urlset></urlset>")],
  ])("passes with a sitemap (case %#)", (body) => {
    expect(evaluateSitemap(answer(200, body), at).outcome).toBe("ok");
  });

  it("says when the sitemap was declared in robots.txt", () => {
    const declared = { url: new URL("https://esempio.it/s.xml"), declared: true };
    expect(evaluateSitemap(answer(200, "<urlset></urlset>"), declared).found).toEqual(["https://esempio.it/s.xml (indicata in robots.txt): 200"]);
  });

  it("warns when it is not there", () => {
    expect(evaluateSitemap(answer(404), at)).toMatchObject({ outcome: "warning", variant: "missing" });
  });

  it("warns when a page answers instead of a sitemap", () => {
    const page = answer(200, "<!doctype html><html><body>Pagina non trovata</body></html>", { "content-type": "text/html" });
    expect(evaluateSitemap(page, at)).toMatchObject({ outcome: "warning", variant: "invalid", found: expect.arrayContaining(["Content-Type: text/html"]) });
  });

  it("is unverified when the request fails", () => {
    expect(evaluateSitemap(new SafeRequestError("too_large", "test"), at)).toMatchObject({ outcome: "unverified", reason: "too_large" });
  });
});
