import { describe, expect, it } from "vitest";

import { normalizeAddress } from "@/lib/safe-request";

import { cacheKey } from "./cache-key";

const keyOf = (address: string) => cacheKey(normalizeAddress(address));

describe("cacheKey", () => {
  it.each([
    ["x.it", "x.it"],
    ["http://x.it", "x.it"],
    ["https://x.it/", "x.it"],
    ["HTTPS://WWW.X.IT", "x.it"],
    ["www.x.it.", "x.it"],
    ["x.it:443", "x.it"],
    ["x.it/?utm_source=mail#menu", "x.it"],
    ["x.it/menu", "x.it/menu"],
    ["http://www.x.it/menu/?giorno=lunedi#pranzo", "x.it/menu"],
    ["x.it/menu//", "x.it/menu"],
  ])("%s → %s", (address, key) => {
    expect(keyOf(address)).toBe(key);
  });

  it("keeps different pages and the path's case apart", () => {
    expect(keyOf("x.it/menu")).not.toBe(keyOf("x.it/contatti"));
    expect(keyOf("x.it/Menu")).not.toBe(keyOf("x.it/menu"));
    expect(keyOf("negozio.x.it")).not.toBe(keyOf("x.it"));
  });
});
