import { defineConfig } from "vitest/config";

// Postgres in a container (README): without it, the database tests are skipped and say so.
const testDatabase = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["./vitest.global-setup.ts"],
    // Never .env.local: tests must not reach Neon.
    env: { DATABASE_URL: testDatabase ?? "" },
  },
});
