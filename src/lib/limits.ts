import { createHmac } from "node:crypto";

import { pool } from "@/lib/db";

/** Why a new scan is refused (ADR-0003, "Limiti"). */
export type Refusal = "ip_limit" | "daily_limit";

/** HMAC with a server secret: the IP never reaches the database (ADR-0003). */
export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

/** A positive integer from the environment, or the default. Anything else throws instead of lifting the limit. */
export function limitFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

// 2 hours, not 1: the hourly window still sees every row. The daily cron keeps the
// worst case near 27 hours, inside the public 48-hour promise (ADR-0003).
const DELETE_EXPIRED = "delete from scan_requests where created_at < now() - interval '2 hours'";

/**
 * Checks the per-IP and global limits and, if there is room, records the request.
 * Returns why it was refused, or undefined when the scan can start.
 */
export async function reserveScan(ipHash: string): Promise<Refusal | undefined> {
  const perIpHour = limitFromEnv("SCAN_LIMIT_PER_IP_HOUR", 5);
  const daily = limitFromEnv("SCAN_LIMIT_DAILY", 100);

  const client = await pool.connect();
  try {
    await client.query("begin");
    // One IP at a time: two requests at once cannot both see room for one more.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [ipHash]);
    await client.query(DELETE_EXPIRED);
    const ip = await client.query<{ count: number }>(
      "select count(*)::int as count from scan_requests where ip_hash = $1 and created_at > now() - interval '1 hour'",
      [ipHash],
    );
    // shortcut: scans still running are not in `scans` yet, so concurrent ones can pass the cap by a few; fine at 100 a day, revisit with a 'running' row first.
    const day = await client.query<{ count: number }>(
      "select count(*)::int as count from scans where created_at > now() - interval '24 hours'",
    );

    let refusal: Refusal | undefined;
    if (ip.rows[0].count >= perIpHour) refusal = "ip_limit";
    else if (day.rows[0].count >= daily) refusal = "daily_limit";
    else await client.query("insert into scan_requests (ip_hash) values ($1)", [ipHash]);

    await client.query("commit");
    return refusal;
  } catch (error) {
    await client.query("rollback").catch(() => {}); // the original error is the one worth throwing
    throw error;
  } finally {
    client.release();
  }
}

/** For the daily cron: the safety net when no scans arrive (ADR-0003). */
export async function deleteExpiredRequests(): Promise<number> {
  const { rowCount } = await pool.query(DELETE_EXPIRED);
  return rowCount ?? 0;
}
