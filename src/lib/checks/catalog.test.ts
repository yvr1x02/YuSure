import { describe, expect, it } from "vitest";

import { CHECKS, fillText, type CheckDefinition } from "./catalog";

describe("fillText", () => {
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(fillText("Il certificato scade il {date}", { date: "12 marzo 2027" })).toBe(
      "Il certificato scade il 12 marzo 2027",
    );
    expect(fillText("Scade il {date}")).toBe("Scade il {date}");
  });
});

describe("check catalog", () => {
  it.each(["security", "seo", "accessibility"] as const)("%s weights add up to 100", (section) => {
    const weights = (Object.values(CHECKS) as CheckDefinition[]).filter((c) => c.section === section).map((c) => c.weight);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it.each(Object.entries(CHECKS) as [string, CheckDefinition][])(
    "%s has texts for passing and for its default severity",
    (_id, check) => {
      expect(check.texts.ok?.headline && check.texts.ok.explanation).toBeTruthy();
      // The failing outcome has its own texts, or one per cause (variants).
      const failing = [check.texts[check.severity], ...Object.values(check.variants ?? {})].filter(Boolean);
      expect(failing.length).toBeGreaterThan(0);
      for (const texts of failing) expect(texts!.headline && texts!.explanation).toBeTruthy();
      expect(check.label && check.expected).toBeTruthy();
      // MDN and web.dev; for crawling and structured data, Google's own docs; Open Graph has only its own site.
      expect(check.docs).toMatch(/^https:\/\/(developer\.mozilla\.org\/|web\.dev\/|developers\.google\.com\/search\/|ogp\.me\/)/);
    },
  );
});
