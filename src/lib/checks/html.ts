import { loadBuffer, type CheerioAPI } from "cheerio";

import type { SafeResponse } from "@/lib/safe-request";

/*
 * The only module that imports cheerio (eslint.config.mjs): it parses bodies already
 * downloaded by @/lib/safe-request and never fetches anything itself.
 */

export type { CheerioAPI };

/** The document of an HTML response, decoded like a browser would; undefined for anything else. */
export function parseHtml(response: SafeResponse): CheerioAPI | undefined {
  const contentType = response.headers["content-type"]?.toLowerCase();
  // No Content-Type: browsers sniff, and a page is what a site serves at its address.
  if (contentType && !/\b(text\/html|application\/xhtml\+xml)\b/.test(contentType)) return undefined;
  const charset = contentType?.match(/charset\s*=\s*"?([\w.:-]+)/)?.[1];
  // Undeclared charset: browsers detect UTF-8, cheerio would assume windows-1252.
  return loadBuffer(response.body, { encoding: { transportLayerEncodingLabel: charset, defaultEncoding: "utf-8" } });
}

/** Policies set with <meta http-equiv="Content-Security-Policy">. */
export function metaCsp($: CheerioAPI): string[] {
  return $("meta[http-equiv]")
    .filter((_, el) => $(el).attr("http-equiv")?.trim().toLowerCase() === "content-security-policy")
    .map((_, el) => $(el).attr("content")?.trim() ?? "")
    .get()
    .filter(Boolean);
}

// Containers that client-side frameworks fill in the browser (React, Vue, Next, Nuxt, Gatsby, SvelteKit, Angular).
const APP_ROOTS = "#root, #app, #__next, #__nuxt, #___gatsby, #svelte, app-root";
/** Below this, a page with an empty app container has no content of its own (tests in html.test.ts). */
export const CLIENT_RENDERED_MAX_TEXT = 200;

/** The text a visitor reads in the body, without scripts, styles, <noscript> and <template>. */
export function visibleText($: CheerioAPI): string {
  const body = $("body").clone();
  body.find("script, style, noscript, template").remove();
  return body.text().replace(/\s+/g, " ").trim();
}

/**
 * A page built in the browser: an empty app container, scripts to fill it and almost no
 * text of its own. Its content cannot be checked from the HTML; its <head> still can.
 */
export function isClientRendered($: CheerioAPI): boolean {
  const emptyRoot = $(APP_ROOTS).filter((_, el) => $(el).text().trim() === "").length > 0;
  return emptyRoot && $("script").length > 0 && visibleText($).length < CLIENT_RENDERED_MAX_TEXT;
}
