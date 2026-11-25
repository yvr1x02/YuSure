import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Every page joins this list in the commit that adds it (docs/MILESTONES.md).
const pages = ["/"];

for (const path of pages) {
  test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(violations).toEqual([]);
  });
}
