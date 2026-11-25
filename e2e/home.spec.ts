import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("an address gets the not-yet-available message without leaving the page", async ({ page }) => {
  await page.getByLabel("Indirizzo del sito").fill("trattoriadamario.it");
  await page.getByRole("button", { name: "Analizza" }).click();
  await expect(page.getByRole("status")).toHaveText(/arriva a breve/);
  await expect(page).toHaveURL("/");
});

test("an empty address asks for one", async ({ page }) => {
  await page.getByLabel("Indirizzo del sito").press("Enter");
  await expect(page.getByRole("status")).toHaveText(/Scrivi l'indirizzo/);
});
