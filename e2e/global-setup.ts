import pg from "pg";

import { FRESH_REPORT_ID, OLD_REPORT_ID } from "./fixtures";

// A clean database with two saved reports: the e2e tests never scan a real site.
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set: start the test Postgres (README) before the e2e tests.");
  // Dynamic import: Playwright compiles this file to CommonJS, where a static import of an .mjs fails.
  const { resetTestDatabase } = await import("../scripts/reset-test-db.mjs");
  await resetTestDatabase(url);

  const security = [
    { id: "https", outcome: "ok", found: ["https://esempio.it/menu (200)"] },
    { id: "httpRedirect", outcome: "problem", found: ["http://esempio.it/menu → 200"] },
    { id: "certificateValid", outcome: "unverified", reason: "timeout", found: ["timeout: test"] },
  ];
  // The fresh report is of catalog v2, with SEO and accessibility; the old one of v1, security only.
  const fresh = {
    checks: {
      catalogVersion: 2,
      results: [
        ...security,
        { id: "noindex", outcome: "ok", found: ["Nessun noindex"] },
        { id: "title", outcome: "warning", variant: "short", values: { length: "5" }, found: ['<title>: "Mario" (5 caratteri)'] },
        { id: "h1", outcome: "unverified", reason: "client_rendered", found: ["Testo visibile nell'HTML: 0 caratteri"] },
        { id: "imageAlt", outcome: "problem", found: ["3 su 4", '<img src="/foto.jpg">'] },
      ],
    },
    scores: {
      security: { unverified: 1, checks: 3 },
      seo: { value: 76, partial: true },
      accessibility: { value: 0, partial: false },
    },
  };
  const old = { checks: { catalogVersion: 1, results: security }, scores: { security: { unverified: 1, checks: 3 } } };
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const [id, age, { checks, scores }] of [
      [FRESH_REPORT_ID, "1 hour", fresh],
      [OLD_REPORT_ID, "2 days", old],
    ] as const) {
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
