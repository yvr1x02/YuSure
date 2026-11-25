import { describe, expect, it, vi } from "vitest";

import { metadata } from "@/app/layout";

// next/font is a compile-time transform of Next: outside the build it has nothing to load.
vi.mock("next/font/local", () => ({ default: () => ({ variable: "" }) }));

describe("metadata", () => {
  it("names the site", () => {
    expect(metadata.title).toBe("YuSure");
  });
});
