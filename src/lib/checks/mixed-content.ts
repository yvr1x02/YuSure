import { directive } from "./headers";
import { metaCsp, type CheerioAPI } from "./html";
import { header, headerLine, readOverHttp, type Page } from "./page";
import type { CheckResult } from "./result";

type Source = [selector: string, attribute: string];

// Blocked by browsers: the page breaks. A problem.
const BLOCKABLE: Source[] = [
  ["script[src]", "src"],
  ["link[rel~=stylesheet i][href]", "href"],
  ["iframe[src]", "src"],
  ["frame[src]", "src"],
  ["object[data]", "data"],
  ["embed[src]", "src"],
];
// Upgraded to https by browsers, or not shown if that fails. A warning.
const UPGRADABLE: Source[] = [
  ["img[src]", "src"],
  ["img[srcset]", "srcset"],
  ["source[src]", "src"],
  ["source[srcset]", "srcset"],
  ["video[src]", "src"],
  ["video[poster]", "poster"],
  ["audio[src]", "src"],
  ["link[rel~=icon i][href]", "href"],
];
const MAX_LISTED = 10;

/**
 * http:// resources in the HTML of an https page. shortcut: url(http://…) inside CSS
 * is not read; it would need a CSS parser and fetching the stylesheets.
 */
export function evaluateMixedContent(page: Page): CheckResult {
  const id = "mixedContent";
  if (page.overHttp) return readOverHttp(id, page);
  const $ = page.html;
  if (!$) return { id, outcome: "unverified", reason: "not_html", found: [headerLine(page, "Content-Type")] };

  const base = baseUrl($, page.response.url);
  const blockable = insecure($, BLOCKABLE, base);
  const upgradable = insecure($, UPGRADABLE, base);
  const all = [...blockable, ...upgradable];
  if (all.length === 0) return { id, outcome: "ok", found: ["Nessuna risorsa da http://"] };

  const found = all.slice(0, MAX_LISTED);
  if (all.length > MAX_LISTED) found.push(`…e altre ${all.length - MAX_LISTED}`);
  // With upgrade-insecure-requests the browser asks for every resource over https.
  const policies = [header(page, "Content-Security-Policy"), ...metaCsp($)];
  if (policies.some((policy) => directive(policy, "upgrade-insecure-requests"))) {
    return { id, outcome: "ok", found: ["upgrade-insecure-requests: il browser le chiede in https", ...found] };
  }
  return { id, outcome: blockable.length > 0 ? "problem" : "warning", found };
}

/** "<tag> url" for each distinct resource that resolves to http://. */
function insecure($: CheerioAPI, sources: Source[], base: URL): string[] {
  const lines = new Set<string>();
  for (const [selector, attribute] of sources) {
    const tag = selector.split("[")[0];
    $(selector).each((_, element) => {
      const value = $(element).attr(attribute) ?? "";
      const urls = attribute === "srcset" ? value.split(",").map((candidate) => candidate.trim().split(/\s+/)[0]) : [value];
      for (const url of urls) {
        const resolved = resolve(url, base);
        if (resolved?.protocol === "http:") lines.add(`<${tag}> ${resolved.href}`);
      }
    });
  }
  return [...lines];
}

// A <base href="http://…"> turns every relative address into an http one.
function baseUrl($: CheerioAPI, pageUrl: URL): URL {
  return resolve($("base[href]").first().attr("href") ?? "", pageUrl) ?? pageUrl;
}

function resolve(url: string, base: URL): URL | undefined {
  try {
    return new URL(url.trim(), base);
  } catch {
    return undefined;
  }
}
