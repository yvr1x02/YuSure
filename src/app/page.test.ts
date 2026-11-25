import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Home", () => {
  it("shows the under-construction line and no form while scans are off", () => {
    vi.stubEnv("SCAN_ENABLED", "");
    const html = renderToStaticMarkup(createElement(Home));
    expect(html).toContain("YuSure è in costruzione: le scansioni arrivano a breve.");
    expect(html).not.toContain("<form");
  });

  it("shows the form when scans are on", () => {
    vi.stubEnv("SCAN_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(Home));
    expect(html).toContain("<form");
    expect(html).not.toContain("in costruzione");
  });
});
