import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CATALOG_VERSION } from "@/lib/checks/catalog";
import type { ScanReport as Report } from "@/lib/checks/scan";
import { scoresOf } from "@/lib/checks/score";

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

// Scores as saveScan stores them.
const render = (r: Report) => renderToStaticMarkup(createElement(ScanReport, { report: r, scores: scoresOf(r.results) }));
const html = render(report);
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

  it("shows the security score and its verdict, partial when a check could not run", () => {
    // https 25 ok, httpRedirect 12 problem, expiry 4 ok: 29 out of 41.
    expect(text).toContain("71 su 100, Da migliorare");
    expect(text).toContain("Punteggio parziale");
  });

  it("lists the problems first, by weight, linking to each result", () => {
    const withProblems = render({
      ...report,
      results: [
        { id: "httpRedirect", outcome: "problem", found: [] },
        { id: "mixedContent", outcome: "warning", found: [] },
        { id: "https", outcome: "problem", found: [] },
      ],
    });
    const summary = withProblems.slice(withProblems.indexOf("Da sistemare subito"), withProblems.indexOf("Sicurezza"));
    expect([...summary.matchAll(/href="#check-(\w+)"/g)].map((m) => m[1])).toEqual(["https", "httpRedirect"]);
    expect(withProblems).toContain('id="check-https"');
  });

  it("has no summary without problems, and no score without checks that ran", () => {
    const empty = render({ ...report, results: [{ id: "https", outcome: "unverified", reason: "timeout", found: [] }] });
    expect(empty).not.toContain("Da sistemare subito");
    expect(empty).toContain("Punteggio non disponibile: troppi controlli non si sono potuti eseguire (1 su 1)");
    expect(empty).not.toContain("Buono");
  });

  it("says when the page checks read the http version", () => {
    const overHttp = render({ ...report, readOverHttp: "http://esempio.it/menu" });
    expect(overHttp).toContain("usano la versione http");
    expect(text).not.toContain("usano la versione http");
  });

  it("shows the saved score, not one computed again", () => {
    const saved = renderToStaticMarkup(
      createElement(ScanReport, { report, scores: { security: { value: 42, partial: false } } }),
    );
    expect(saved).toContain("42");
    expect(saved).not.toContain("71");
  });

  it("says when the report was made with an older catalog of checks", () => {
    const older = renderToStaticMarkup(
      createElement(ScanReport, { report, scores: scoresOf(report.results), catalogVersion: CATALOG_VERSION - 1 }),
    );
    expect(older).toContain("versione precedente dei controlli");
    expect(text).not.toContain("versione precedente dei controlli");
  });

  it("shows SEO and accessibility as sections of their own, each with its score", () => {
    const full = render({
      ...report,
      results: [
        ...report.results,
        { id: "title", outcome: "ok", found: [] },
        { id: "viewport", outcome: "problem", found: [] },
        { id: "imageAlt", outcome: "warning", found: [] },
      ],
    });
    const sections = [...full.matchAll(/<h2 id="section-(\w+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]);
    expect(sections).toEqual([
      ["security", "Sicurezza"],
      ["seo", "SEO"],
      ["accessibility", "Accessibilità"],
    ]);
    const seo = full.slice(full.indexOf('id="section-seo"'), full.indexOf('id="section-accessibility"'));
    expect(seo).toContain('id="check-viewport"');
    // Of the SEO checks in the report, title 18 ok and viewport 18 a problem: 18 out of 36.
    expect(seo).toContain('font-extrabold">50</span>');
  });

  it("shows only the sections a report has: one of catalog v1 has security alone", () => {
    expect(html).not.toContain('id="section-seo"');
    expect(html).not.toContain('id="section-accessibility"');
  });

  it("orders the urgent problems by their weight in the whole report", () => {
    // noindex: 20 × SEO 25 = 500; httpRedirect: 12 × security 35 = 420; formLabels: 35 × accessibility 15 = 525.
    const urgent = render({
      ...report,
      results: [
        { id: "httpRedirect", outcome: "problem", found: [] },
        { id: "noindex", outcome: "problem", found: [] },
        { id: "formLabels", outcome: "problem", found: [] },
      ],
    });
    const summary = urgent.slice(urgent.indexOf("Da sistemare subito"), urgent.indexOf('id="section-'));
    expect([...summary.matchAll(/href="#check-(\w+)"/g)].map((m) => m[1])).toEqual(["formLabels", "noindex", "httpRedirect"]);
  });

  it("explains a variant with its own texts", () => {
    const short = render({ ...report, results: [{ id: "title", outcome: "warning", variant: "short", values: { length: "5" }, found: [] }] });
    expect(short).toContain("Il titolo della pagina è molto corto (5 caratteri)");
  });

  it("labels low-weight warnings as Consigliato, in every section, and nothing else", () => {
    const labelled = render({
      ...report,
      results: [
        { id: "csp", outcome: "warning", found: [] },
        { id: "sitemap", outcome: "warning", variant: "missing", found: [] },
        { id: "h1", outcome: "warning", variant: "many", values: { count: "3" }, found: [] },
        { id: "h1", outcome: "warning", variant: "none", found: [] },
        { id: "canonical", outcome: "ok", found: [] },
        { id: "hsts", outcome: "warning", found: [] },
      ],
    });
    const items = [...labelled.matchAll(/<li id="check-(\w+)"[\s\S]*?<\/li>/g)].map((m) => [m[1], m[0].includes(">Consigliato<")]);
    expect(items).toEqual([
      ["csp", true],
      ["hsts", false],
      ["sitemap", true],
      ["h1", true],
      ["h1", false],
      ["canonical", false],
    ]);
  });

  it("keeps technical details in a native disclosure", () => {
    expect(html.match(/<details/g)).toHaveLength(4);
    expect(text).toContain("http://esempio.it/menu → 200");
  });
});
