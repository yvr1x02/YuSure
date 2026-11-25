import { describe, expect, it } from "vitest";

import { metadata } from "@/app/layout";

describe("metadata", () => {
  it("names the site", () => {
    expect(metadata.title).toBe("YuSure");
  });
});
