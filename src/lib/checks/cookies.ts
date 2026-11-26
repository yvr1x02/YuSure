import type { Page } from "./page";
import type { CheckResult } from "./result";

const FLAGS = ["Secure", "HttpOnly", "SameSite"] as const;

/** Every Set-Cookie of the page needs Secure, HttpOnly and SameSite. Names only: values are never shown. */
export function evaluateCookies(page: Page): CheckResult {
  const id = "cookies";
  const cookies = (page.response.headers["set-cookie"] ?? []).map(readCookie);
  if (cookies.length === 0) return { id, outcome: "ok", found: ["Nessun Set-Cookie nella risposta"] };

  const found = cookies.map(({ name, missing }) =>
    missing.length > 0 ? `${name}: manca ${missing.join(", ")}` : `${name}: ${FLAGS.join(", ")}`,
  );
  return { id, outcome: cookies.some((c) => c.missing.length > 0) ? "warning" : "ok", found };
}

function readCookie(setCookie: string) {
  const [pair, ...attributes] = setCookie.split(";");
  const name = pair.split("=")[0].trim() || "(senza nome)";
  const present = new Set(attributes.map((a) => a.split("=")[0].trim().toLowerCase()));
  return { name, missing: FLAGS.filter((flag) => !present.has(flag.toLowerCase())) };
}
