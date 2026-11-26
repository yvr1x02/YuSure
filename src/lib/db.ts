import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

/**
 * The only connection to Neon, server side (ADR-0001, ADR-0003). DATABASE_URL is the pooled
 * string; no query runs until one is needed, so the build does not need it.
 */
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Releases idle clients before Fluid compute suspends the function.
attachDatabasePool(pool);
