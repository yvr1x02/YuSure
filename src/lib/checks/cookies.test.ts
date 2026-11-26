import { describe, expect, it } from "vitest";

import { evaluateCookies } from "./cookies";
import { testPage } from "./test-page";

const withCookies = (...cookies: string[]) => testPage({ "set-cookie": cookies });

describe("evaluateCookies", () => {
  it("is ok when the page sets no cookie", () => {
    expect(evaluateCookies(testPage())).toEqual({ id: "cookies", outcome: "ok", found: ["Nessun Set-Cookie nella risposta"] });
  });

  it("is ok when every cookie has Secure, HttpOnly and SameSite, in any case and order", () => {
    const result = evaluateCookies(
      withCookies("sessione=abc; Path=/; Secure; HttpOnly; SameSite=Lax", "lang=it; samesite=strict; httponly; secure"),
    );
    expect(result).toEqual({
      id: "cookies",
      outcome: "ok",
      found: ["sessione: Secure, HttpOnly, SameSite", "lang: Secure, HttpOnly, SameSite"],
    });
  });

  it("is a warning when a cookie misses a flag, naming the cookie and the flags", () => {
    const result = evaluateCookies(withCookies("PHPSESSID=s3gr3t0; path=/", "ok=1; Secure; HttpOnly; SameSite=None"));
    expect(result.outcome).toBe("warning");
    expect(result.found).toEqual(["PHPSESSID: manca Secure, HttpOnly, SameSite", "ok: Secure, HttpOnly, SameSite"]);
  });

  it("never shows a cookie value", () => {
    const result = evaluateCookies(withCookies("token=s3gr3t0; Secure; HttpOnly"));
    expect(result.found.join(" ")).not.toContain("s3gr3t0");
    expect(result.found).toEqual(["token: manca SameSite"]);
  });

  it("does not take a value for a flag", () => {
    expect(evaluateCookies(withCookies("a=Secure; HttpOnly; SameSite=Lax")).found).toEqual(["a: manca Secure"]);
  });
});
