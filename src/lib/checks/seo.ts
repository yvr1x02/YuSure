import type { CheerioAPI } from "./html";
import { htmlCheck, type Page } from "./page";
import type { CheckResult } from "./result";

/*
 * SEO checks on the page itself (SPEC, "SEO"). They hold for the http version too: unlike
 * HSTS, what Google reads does not depend on https. robots.txt and the sitemap are in robots.ts.
 */

const TITLE = { min: 10, max: 60 };
const DESCRIPTION = { min: 50, max: 160 };
const MAX_LISTED = 10;

const clean = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
// Code points, not UTF-16 units: an emoji is one character to whoever reads the title.
const length = (text: string) => [...text].length;

/** <meta name="…"> content, name in any case. */
function metaContent($: CheerioAPI, name: string): string | undefined {
  const meta = $("meta[name]").filter((_, el) => $(el).attr("name")?.trim().toLowerCase() === name);
  return meta.length > 0 ? clean(meta.first().attr("content")) : undefined;
}

/** "missing", "short" or "long" against a range, or undefined when it fits. */
function fit(text: string | undefined, range: { min: number; max: number }) {
  if (!text) return "missing";
  if (length(text) < range.min) return "short";
  return length(text) > range.max ? "long" : undefined;
}

export function evaluateTitle(page: Page): CheckResult {
  return htmlCheck("title", page, ($) => {
    const title = clean($("head > title").first().text());
    const variant = fit(title, TITLE);
    if (variant === "missing") return { id: "title", outcome: "problem", found: ["<title> assente o vuoto"] };
    const found = [`<title>: "${title}" (${length(title)} caratteri)`];
    const values = { length: String(length(title)) };
    return variant ? { id: "title", outcome: "warning", variant, values, found } : { id: "title", outcome: "ok", found };
  });
}

export function evaluateMetaDescription(page: Page): CheckResult {
  return htmlCheck("metaDescription", page, ($) => {
    const description = metaContent($, "description");
    const variant = fit(description, DESCRIPTION);
    if (variant === "missing") {
      return { id: "metaDescription", outcome: "warning", variant, found: ['<meta name="description"> assente o vuoto'] };
    }
    const found = [`description: "${description}" (${length(description!)} caratteri)`];
    const values = { length: String(length(description!)) };
    return variant
      ? { id: "metaDescription", outcome: "warning", variant, values, found }
      : { id: "metaDescription", outcome: "ok", found };
  });
}

export function evaluateViewport(page: Page): CheckResult {
  return htmlCheck("viewport", page, ($) => {
    const viewport = metaContent($, "viewport");
    return viewport
      ? { id: "viewport", outcome: "ok", found: [`viewport: ${viewport}`] }
      : { id: "viewport", outcome: "problem", found: ['<meta name="viewport"> assente'] };
  });
}

export function evaluateLang(page: Page): CheckResult {
  return htmlCheck("lang", page, ($) => {
    const lang = clean($("html").attr("lang"));
    return lang
      ? { id: "lang", outcome: "ok", found: [`<html lang="${lang}">`] }
      : { id: "lang", outcome: "warning", found: ["<html> senza lang"] };
  });
}

/** A content check: the headings of a page built in the browser are not in the HTML. */
export function evaluateH1(page: Page): CheckResult {
  return htmlCheck(
    "h1",
    page,
    ($) => {
      // A clone with <br> as spaces: "Autunno<br>2026" reads "Autunno 2026", and the page stays as it is.
      const text = (el: Parameters<typeof $>[0]) => clean($(el).clone().find("br").replaceWith(" ").end().text());
      const headings = $("h1").map((_, el) => `<h1>: "${text(el) || "(vuoto)"}"`).get();
      if (headings.length === 1) return { id: "h1", outcome: "ok", found: headings };
      if (headings.length === 0) return { id: "h1", outcome: "warning", variant: "none", found: ["Nessun <h1>"] };
      const values = { count: String(headings.length) };
      return { id: "h1", outcome: "warning", variant: "many", values, found: listed(headings) };
    },
    { content: true },
  );
}

const OPEN_GRAPH = ["og:title", "og:description", "og:image"];

export function evaluateOpenGraph(page: Page): CheckResult {
  return htmlCheck("openGraph", page, ($) => {
    // The standard is property=; some sites write name=, and the social networks read it anyway.
    const present = (tag: string) =>
      $("meta").filter((_, el) => ($(el).attr("property") ?? $(el).attr("name"))?.trim() === tag && !!clean($(el).attr("content")))
        .length > 0;
    const found = OPEN_GRAPH.map((tag) => `${tag}: ${present(tag) ? "presente" : "assente"}`);
    return { id: "openGraph", outcome: OPEN_GRAPH.every(present) ? "ok" : "warning", found };
  });
}

export function evaluateCanonical(page: Page): CheckResult {
  return htmlCheck("canonical", page, ($) => {
    const canonical = $("link[rel][href]").filter((_, el) =>
      ($(el).attr("rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"),
    );
    const href = clean(canonical.first().attr("href"));
    return href
      ? { id: "canonical", outcome: "ok", found: [`canonical: ${href}`] }
      : { id: "canonical", outcome: "warning", found: ['<link rel="canonical"> assente'] };
  });
}

export function evaluateStructuredData(page: Page): CheckResult {
  return htmlCheck("structuredData", page, ($) => {
    const blocks = $('script[type="application/ld+json"]').map((_, el) => $(el).text()).get();
    if (blocks.length === 0) {
      return { id: "structuredData", outcome: "warning", variant: "missing", found: ["Nessuno script application/ld+json"] };
    }
    const types = blocks.flatMap((block) => {
      try {
        return [schemaTypes(JSON.parse(block))];
      } catch {
        return [];
      }
    });
    if (types.length === 0) {
      return { id: "structuredData", outcome: "warning", variant: "invalid", found: [`${blocks.length} blocchi JSON-LD, nessuno leggibile`] };
    }
    return { id: "structuredData", outcome: "ok", found: types.map((t) => `JSON-LD: ${t || "senza @type"}`) };
  });
}

/** The @type values of a JSON-LD block, also inside an array or a @graph. */
function schemaTypes(data: unknown): string {
  const items = Array.isArray(data) ? data : [data];
  return items
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const { "@type": type, "@graph": graph } = item as Record<string, unknown>;
      return [...[type].flat().filter((t): t is string => typeof t === "string"), ...(graph ? [schemaTypes(graph)] : [])];
    })
    .filter(Boolean)
    .join(", ");
}

// Directives with a colon of their own: anything else before a colon names a crawler.
const COLON_DIRECTIVES = new Set(["unavailable_after", "max-snippet", "max-image-preview", "max-video-preview"]);
const FOR_GOOGLE = new Set(["googlebot", "robots"]);

/** noindex or none for Google, in <meta name="robots|googlebot"> or in X-Robots-Tag. */
export function evaluateNoindex(page: Page): CheckResult {
  const id = "noindex";
  const header = page.response.headers["x-robots-tag"];
  const headerValues = (Array.isArray(header) ? header : header ? [header] : []).filter((v) => blocksIndexing(v));
  const $ = page.html;
  const metas = $
    ? $("meta[name]")
        .filter((_, el) => FOR_GOOGLE.has($(el).attr("name")?.trim().toLowerCase() ?? ""))
        .map((_, el) => ({ name: $(el).attr("name")!.trim(), content: clean($(el).attr("content")) }))
        .get()
        .filter(({ content }) => blocksIndexing(content))
    : [];

  const found = [
    ...headerValues.map((v) => `X-Robots-Tag: ${v}`),
    ...metas.map(({ name, content }) => `<meta name="${name}" content="${content}">`),
  ];
  if (found.length > 0) return { id, outcome: "problem", found };
  return { id, outcome: "ok", found: [$ ? "Nessun noindex nei meta robots né in X-Robots-Tag" : "Nessun noindex in X-Robots-Tag"] };
}

function blocksIndexing(value: string): boolean {
  let crawler: string | undefined;
  for (const part of value.split(",")) {
    const named = part.match(/^\s*([\w-]+)\s*:\s*(.*)$/);
    let directive = part;
    if (named && !COLON_DIRECTIVES.has(named[1].toLowerCase())) {
      crawler = named[1].toLowerCase();
      directive = named[2];
    }
    const forGoogle = crawler === undefined || FOR_GOOGLE.has(crawler);
    if (forGoogle && ["noindex", "none"].includes(directive.trim().toLowerCase())) return true;
  }
  return false;
}

function listed(lines: string[]): string[] {
  const found = lines.slice(0, MAX_LISTED);
  if (lines.length > MAX_LISTED) found.push(`…e altri ${lines.length - MAX_LISTED}`);
  return found;
}
