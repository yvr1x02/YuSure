import { SafeRequestError, type SafeResponse } from "@/lib/safe-request";

import type { CheckId } from "./catalog";
import { unverified, type CheckResult } from "./result";

/*
 * robots.txt and the sitemap: the two extra requests of ADR-0002, on the host of the page
 * read (after its redirects). The rules Google applies, simplified (RFC 9309).
 */

type Rule = { allow: boolean; path: string };
export type Robots = { agent: "googlebot" | "*" | undefined; rules: Rule[]; sitemaps: string[] };

/** Google's group (its own, otherwise *), with the rules of every group naming it, and the Sitemap lines. */
export function parseRobots(text: string): Robots {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  const sitemaps: string[] = [];
  let agentRun = false;
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n|\r/)) {
    const line = raw.replace(/#.*/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      // Consecutive User-agent lines share the rules that follow them.
      if (!agentRun) groups.push({ agents: [], rules: [] });
      groups.at(-1)!.agents.push(value.toLowerCase());
      agentRun = true;
      continue;
    }
    agentRun = false;
    if ((key === "allow" || key === "disallow") && groups.length > 0) groups.at(-1)!.rules.push({ allow: key === "allow", path: value });
    else if (key === "sitemap" && value) sitemaps.push(value);
  }

  for (const agent of ["googlebot", "*"] as const) {
    const matching = groups.filter((g) => g.agents.includes(agent));
    if (matching.length > 0) return { agent, rules: matching.flatMap((g) => g.rules), sitemaps };
  }
  return { agent: undefined, rules: [], sitemaps };
}

/** Disallow: / (or /*) with no Allow to open anything back up (decided in M4). */
export function blocksAll({ rules }: Robots): boolean {
  return rules.some((r) => !r.allow && (r.path === "/" || r.path === "/*")) && !rules.some((r) => r.allow && r.path);
}

export function evaluateRobots(result: SafeResponse | SafeRequestError, url: URL): CheckResult {
  const id = "robotsTxt";
  if (result instanceof SafeRequestError) return unverified(id, result);
  const status = `${url.href}: ${result.status}`;
  // Google stops crawling while robots.txt answers 5xx; 4xx means "no rules", like a missing file.
  if (result.status >= 500) return { id, outcome: "problem", variant: "serverError", found: [status] };
  if (result.status >= 400) return { id, outcome: "warning", variant: "missing", found: [status] };

  const robots = parseRobots(result.body.toString("utf8"));
  const group = robots.agent ? `regole per User-agent: ${robots.agent === "*" ? "*" : "Googlebot"}` : "nessuna regola per Googlebot";
  const found = [status, group, ...robots.rules.slice(0, 5).map((r) => `${r.allow ? "Allow" : "Disallow"}: ${r.path}`)];
  return blocksAll(robots) ? { id, outcome: "warning", variant: "blocksAll", found } : { id, outcome: "ok", found };
}

/** The first Sitemap line of robots.txt that is an http(s) address, otherwise /sitemap.xml. */
export function sitemapUrl(robots: SafeResponse | SafeRequestError, origin: string): { url: URL; declared: boolean } {
  if (!(robots instanceof SafeRequestError) && robots.status < 300) {
    for (const line of parseRobots(robots.body.toString("utf8")).sitemaps) {
      try {
        const url = new URL(line);
        if (url.protocol === "https:" || url.protocol === "http:") return { url, declared: true };
      } catch {
        // Not an address: the next line, or the default.
      }
    }
  }
  return { url: new URL("/sitemap.xml", origin), declared: false };
}

const GZIP = [0x1f, 0x8b];

export function evaluateSitemap(result: SafeResponse | SafeRequestError, { url, declared }: { url: URL; declared: boolean }): CheckResult {
  const id: CheckId = "sitemap";
  if (result instanceof SafeRequestError) return unverified(id, result);
  const found = [`${url.href}${declared ? " (indicata in robots.txt)" : ""}: ${result.status}`];
  if (result.status !== 200) return { id, outcome: "warning", variant: "missing", found };
  // A sitemap, a sitemap index, or a gzipped one (served as a file, not decompressed by HTTP).
  const gzipped = GZIP.every((byte, i) => result.body[i] === byte);
  const start = result.body.subarray(0, 16_384).toString("utf8");
  if (gzipped || /<(urlset|sitemapindex)[\s>]/.test(start)) return { id, outcome: "ok", found };
  return { id, outcome: "warning", variant: "invalid", found: [...found, `Content-Type: ${result.headers["content-type"] ?? "assente"}`] };
}
