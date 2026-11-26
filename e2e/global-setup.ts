import pg from "pg";

import { FRESH_REPORT_ID, OLD_REPORT_ID } from "./fixtures";

// A clean database with two saved reports: the e2e tests never scan a real site.
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set: start the test Postgres (README) before the e2e tests.");
  // Dynamic import: Playwright compiles this file to CommonJS, where a static import of an .mjs fails.
  const { resetTestDatabase } = await import("../scripts/reset-test-db.mjs");
  await resetTestDatabase(url);

  const checks = {
    catalogVersion: 1,
    results: [
      { id: "https", outcome: "ok", found: ["https://esempio.it/menu (200)"] },
      { id: "httpRedirect", outcome: "problem", found: ["http://esempio.it/menu → 200"] },
      { id: "certificateValid", outcome: "unverified", reason: "timeout", found: ["timeout: test"] },
    ],
  };
  const scores = { security: { unverified: 1, checks: 3 } };
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const [id, age] of [
      [FRESH_REPORT_ID, "1 hour"],
      [OLD_REPORT_ID, "2 days"],
    ]) {
      await client.query(
        `insert into scans (id, cache_key, domain, url, created_at, status, checks, scores)
         values ($1, 'esempio.it/menu', 'esempio.it', 'https://esempio.it/menu', now() - $2::interval, 'done', $3, $4)`,
        [id, age, checks, scores],
      );
    }
  } finally {
    await client.end();
  }
}
