import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HowItWorks from "./page";

const text = renderToStaticMarkup(createElement(HowItWorks)).replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

describe("Come funziona", () => {
  it("marks the checks that do not exist yet as coming", () => {
    expect(text).toContain("Sicurezza:");
    for (const item of ["Velocità", "Visibilità su Google", "Accessibilità"]) expect(text).toContain(`${item} (in arrivo):`);
  });

  it("no longer says scans are coming", () => {
    expect(text).not.toContain("in costruzione");
  });
});
