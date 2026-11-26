import { expect, test, type Page } from "@playwright/test";

import { FRESH_REPORT_ID, OLD_REPORT_ID } from "./fixtures";

// Reports saved by global-setup.ts: no test here scans a real site.

// Next adds its own on a 404, so there can be more than one.
const noindexMeta = (page: Page) => page.locator('meta[name="robots"][content*="noindex"]').first();

test("a saved report shows its results and is not indexed", async ({ page }) => {
  const response = await page.goto(`/report/${FRESH_REPORT_ID}`);
  expect(response?.headers()["x-robots-tag"]).toBe("noindex");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Risultati per esempio.it");
  await expect(page.getByRole("heading", { name: "Il sito non passa da http a https" })).toBeVisible();
  await expect(noindexMeta(page)).toBeAttached();
});

test("a report younger than 24 hours says when it can be scanned again", async ({ page }) => {
  await page.goto(`/report/${FRESH_REPORT_ID}`);
  await expect(page.getByText(/potrai rifare la scansione dal/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Rifai la scansione" })).toHaveCount(0);
});

test("Copia link copies the report's address", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/report/${FRESH_REPORT_ID}`);
  await page.getByRole("button", { name: "Copia link" }).click();
  await expect(page.getByText("Link copiato.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

test("the Home opens the report of the last 24 hours for the same page", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Indirizzo del sito").fill("http://www.esempio.it/menu/?da=mail");
  await page.getByRole("button", { name: "Analizza" }).click();
  await expect(page).toHaveURL(`/report/${FRESH_REPORT_ID}`);
});

test("Rifai la scansione on an old report lands on the newer one", async ({ page }) => {
  await page.goto(`/report/${OLD_REPORT_ID}`);
  await page.getByRole("button", { name: "Rifai la scansione" }).click();
  await expect(page).toHaveURL(`/report/${FRESH_REPORT_ID}`);
});

for (const id of ["AAAAAAAAAAAAAAAAAAAAAA", "sconosciuto"]) {
  test(`an unknown report (${id}) says so`, async ({ page }) => {
    await page.goto(`/report/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Report non trovato");
    await expect(noindexMeta(page)).toBeAttached();
  });
}
