import { expect, test } from "@playwright/test";

import { FRESH_REPORT_ID } from "./fixtures";

// YuSure sends the headers it checks on other sites.

for (const path of ["/", "/come-funziona", `/report/${FRESH_REPORT_ID}`]) {
  test(`${path} sends the security headers`, async ({ request }) => {
    const headers = (await request.get(path)).headers();
    expect(headers).toMatchObject({
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "x-frame-options": "DENY",
    });
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    // The Vercel Toolbar is allowed on previews only.
    expect(headers["content-security-policy"]).not.toContain("vercel.live");
  });

  test(`${path} runs without CSP violations`, async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
    });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });
}
