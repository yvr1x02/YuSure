import { expect, test } from "@playwright/test";

// Only addresses refused before any network request: e2e never scans a real site.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

async function analyze(page: import("@playwright/test").Page, address: string) {
  await page.getByLabel("Indirizzo del sito").fill(address);
  await page.getByRole("button", { name: "Analizza" }).click();
}

test("an empty address asks for one", async ({ page }) => {
  await page.getByLabel("Indirizzo del sito").press("Enter");
  await expect(page.getByRole("status")).toHaveText(/Scrivi l'indirizzo/);
});

for (const address of ["localhost", "127.0.0.1", "http://2130706433/", "[::1]"]) {
  test(`${address} is refused as not public, without leaving the page`, async ({ page }) => {
    await analyze(page, address);
    await expect(page.getByRole("status")).toHaveText("Questo indirizzo non è un sito pubblico.");
    await expect(page).toHaveURL("/");
    await expect(page.getByLabel("Indirizzo del sito")).toHaveValue(address);
  });
}

test("a port other than 80 and 443 is refused", async ({ page }) => {
  await analyze(page, "trattoriadamario.it:8080");
  await expect(page.getByRole("status")).toHaveText(/non si può analizzare/);
});
