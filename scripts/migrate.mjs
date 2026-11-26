// Applies migrations/*.sql in name order, each in its own transaction (ADR-0001).
// .mjs, not .ts: engines.node 22.x does not guarantee 22.18, the first 22 that strips types by default.
import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import pg from "pg";

const MIGRATIONS = new URL("../migrations/", import.meta.url);
// Any fixed number: two runners at once wait for each other instead of applying a file twice.
const LOCK_ID = 727_001;

/** @param {string} connectionString a direct (unpooled) connection: the session lock needs it. */
export async function migrate(connectionString, { log = console.log } = {}) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const { rows } = await client.query("select name from schema_migrations");
    const applied = new Set(rows.map((row) => row.name));
    const files = (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort();

    for (const name of files.filter((file) => !applied.has(file))) {
      const sql = await readFile(new URL(name, MIGRATIONS), "utf8");
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [name]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(`migration ${name} failed: ${error.message}`, { cause: error });
      }
      log(`applied ${name}`);
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error("DATABASE_URL_UNPOOLED is not set.");
    process.exit(1);
  }
  await migrate(url);
}
