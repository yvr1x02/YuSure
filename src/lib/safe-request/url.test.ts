import { describe, expect, it } from "vitest";

import { SafeRequestError } from "./errors";
import { checkUrl, normalizeAddress } from "./url";

function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    if (error instanceof SafeRequestError) return error.code;
    throw error;
  }
  return "ok";
}

describe("normalizeAddress", () => {
  it.each([
    ["trattoriadamario.it", "https://trattoriadamario.it/"],
    ["  ESEMPIO.it/Menu?x=1#orari  ", "https://esempio.it/Menu?x=1"],
    ["http://esempio.it", "http://esempio.it/"],
    ["http://esempio.it:80/", "http://esempio.it/"],
    ["https://esempio.it:443/", "https://esempio.it/"],
    ["esempio.it.", "https://esempio.it/"],
    ["pizzería.it", "https://xn--pizzera-dza.it/"],
  ])("normalizes %j", (input, expected) => {
    expect(normalizeAddress(input).href).toBe(expected);
  });

  it.each(["", "   ", "https://", "http://esem pio.it", "javascript:alert(1)"])(
    "rejects an unparsable address %j",
    (input) => {
      expect(codeOf(() => normalizeAddress(input))).toBe("invalid_url");
    },
  );

  it.each(["ftp://esempio.it", "file:///etc/passwd", "gopher://esempio.it"])(
    "rejects scheme %s",
    (input) => {
      expect(codeOf(() => normalizeAddress(input))).toBe("not_allowed");
    },
  );

  it.each(["esempio.it:8080", "esempio.it:22", "https://esempio.it:80", "http://esempio.it:443"])(
    "rejects a port that is not the scheme default: %s",
    (input) => {
      expect(codeOf(() => normalizeAddress(input))).toBe("not_allowed");
    },
  );

  it.each(["https://user:pass@esempio.it", "https://user@esempio.it", "https://:pass@esempio.it"])(
    "rejects credentials in %s",
    (input) => {
      expect(codeOf(() => normalizeAddress(input))).toBe("not_allowed");
    },
  );

  it.each([
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0x7f.1/",
    "http://0177.0.0.1/",
    "http://127.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "8.8.8.8",
  ])("rejects an IP written as host, in any notation: %s", (input) => {
    expect(codeOf(() => normalizeAddress(input))).toBe("not_public");
  });

  it.each(["localhost", "localhost.", "intranet", "http://router/"])(
    "rejects a name without a top-level domain: %s",
    (input) => {
      expect(codeOf(() => normalizeAddress(input))).toBe("not_public");
    },
  );
});

describe("checkUrl", () => {
  it("applies the same rules to a redirect target", () => {
    expect(codeOf(() => checkUrl(new URL("http://10.0.0.1/")))).toBe("not_public");
    expect(codeOf(() => checkUrl(new URL("https://esempio.it:8443/")))).toBe("not_allowed");
    expect(codeOf(() => checkUrl(new URL("https://esempio.it./")))).toBe("not_public");
    expect(codeOf(() => checkUrl(new URL("https://www.esempio.it/pagina")))).toBe("ok");
  });
});
