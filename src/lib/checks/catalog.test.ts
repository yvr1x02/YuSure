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
  it.each(Object.entries(CHECKS) as [string, CheckDefinition][])(
    "%s has texts for passing and for its default severity",
    (_id, check) => {
      for (const outcome of ["ok", check.severity] as const) {
        expect(check.texts[outcome]?.headline).toBeTruthy();
        expect(check.texts[outcome]?.explanation).toBeTruthy();
      }
      expect(check.label && check.expected).toBeTruthy();
      expect(check.docs).toMatch(/^https:\/\/(developer\.mozilla\.org|web\.dev)\//);
    },
  );
});
