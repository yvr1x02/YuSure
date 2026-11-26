import { defineConfig, devices } from "@playwright/test";

// Not 3000: another local server may already be listening there.
const port = 3100;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  forbidOnly: !!process.env.CI,
  use: { baseURL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Always test a fresh production build, so axe never sees the dev overlay; fail if the port is taken.
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    // The e2e tests drive the scan form: scans on for this build, against the test database (never .env.local's).
    env: {
      SCAN_ENABLED: "true",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      IP_HASH_SECRET: "e2e-only",
    },
    timeout: 120_000,
  },
});
