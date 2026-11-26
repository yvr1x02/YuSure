// Empties the test database and applies every migration: Vitest and Playwright start from here.
import pg from "pg";

import { migrate } from "./migrate.mjs";

/** @param {string} connectionString must point to this machine: it drops the whole schema. */
export async function resetTestDatabase(connectionString) {
  const { hostname } = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
    throw new Error(`TEST_DATABASE_URL must point to localhost, not ${hostname}`);
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("drop schema public cascade; create schema public");
  } finally {
    await client.end();
  }
  await migrate(connectionString, { log: () => {} });
}
