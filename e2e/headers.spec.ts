import { expect, test } from "@playwright/test";

// YuSure sends the headers it checks on other sites (CSP still to be decided).
for (const path of ["/", "/come-funziona"]) {
  test(`${path} sends the security headers`, async ({ request }) => {
    const headers = (await request.get(path)).headers();
    expect(headers).toMatchObject({
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "x-frame-options": "DENY",
    });
  });
}
