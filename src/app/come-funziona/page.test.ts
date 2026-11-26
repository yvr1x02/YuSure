import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HowItWorks from "./page";

const text = renderToStaticMarkup(createElement(HowItWorks)).replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

describe("Come funziona", () => {
  it("marks the checks that do not exist yet as coming: speed and contrast arrive in M5", () => {
    for (const item of ["Sicurezza:", "Visibilità su Google:", "Accessibilità:", "Velocità (in arrivo):"]) expect(text).toContain(item);
    expect(text).toContain("il contrasto dei colori (in arrivo).");
  });

  it("no longer says scans are coming", () => {
    expect(text).not.toContain("in costruzione");
  });
});
