import { resetTestDatabase } from "./scripts/reset-test-db.mjs";

export default async function setup() {
  if (process.env.TEST_DATABASE_URL) await resetTestDatabase(process.env.TEST_DATABASE_URL);
}
