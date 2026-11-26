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
