import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { FRESH_REPORT_ID, OLD_REPORT_ID } from "./fixtures";

// Every page joins this list in the commit that adds it (docs/MILESTONES.md).
const pages = ["/", "/come-funziona", `/report/${FRESH_REPORT_ID}`, `/report/${OLD_REPORT_ID}`, "/report/sconosciuto"];

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const path of pages) {
  test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect(violations).toEqual([]);
  });
}

test("/ with an error message has no WCAG 2.2 AA violations", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Indirizzo del sito").fill("localhost");
  await page.getByRole("button", { name: "Analizza" }).click();
  await expect(page.getByRole("status")).not.toBeEmpty();
  const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(violations).toEqual([]);
});
