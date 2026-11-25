import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ScanReport as Report } from "@/lib/checks/scan";

import { ScanReport } from "./scan-report";

const report: Report = {
  url: "https://esempio.it/menu",
  scannedAt: "2026-11-25T12:00:00.000Z",
  results: [
    { id: "https", outcome: "ok", found: ["https://esempio.it/menu (200)"] },
    { id: "httpRedirect", outcome: "problem", found: ["http://esempio.it/menu → 200"] },
    { id: "certificateValid", outcome: "unverified", reason: "timeout", found: ["timeout: test"] },
    { id: "certificateExpiry", outcome: "ok", values: { date: "12 marzo 2027" }, found: ["Scadenza: …"] },
  ],
};

const html = renderToStaticMarkup(createElement(ScanReport, { report }));
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("ScanReport", () => {
  it("names the site and the scan time in Italian", () => {
    expect(text).toContain("Risultati per esempio.it");
    expect(text).toContain("25 novembre 2026");
  });

  it("shows each outcome as a word, not only a colour", () => {
    for (const word of ["Ok", "Problema", "Non verificato"]) expect(text).toContain(word);
  });

  it("fills placeholders from the values found", () => {
    expect(text).toContain("Il certificato scade il 12 marzo 2027");
  });

  it("gives the reason when a check could not run", () => {
    expect(text).toContain("Certificato di sicurezza");
    expect(text).toContain("Il sito non ha risposto entro 10 secondi.");
  });

  it("keeps technical details in a native disclosure", () => {
    expect(html.match(/<details/g)).toHaveLength(4);
    expect(text).toContain("http://esempio.it/menu → 200");
  });
});
