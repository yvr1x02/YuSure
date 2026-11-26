import { randomBytes } from "node:crypto";

import { cacheKey, normalizedDomain } from "@/lib/cache-key";
import { CATALOG_VERSION } from "@/lib/checks/catalog";
import type { CheckResult } from "@/lib/checks/result";
import type { ScanReport } from "@/lib/checks/scan";
import { scoresOf, type Scores } from "@/lib/checks/score";
import { pool } from "@/lib/db";

/** 16 random bytes in base64url: the report's link, not guessable (ADR-0003). */
const REPORT_ID = /^[A-Za-z0-9_-]{22}$/;

export type SavedScan = { id: string; report: ScanReport; scores: Scores; catalogVersion: number };

type ChecksColumn = { catalogVersion: number; readOverHttp?: string; results: CheckResult[] };

/** A report of the same address from the last 24 hours, if any (ADR-0003, "Cache di 24 ore"). */
export async function findRecentScanId(address: URL): Promise<string | undefined> {
  const { rows } = await pool.query<{ id: string }>(
    "select id from scans where cache_key = $1 and created_at > now() - interval '24 hours' order by created_at desc limit 1",
    [cacheKey(address)],
  );
  return rows[0]?.id;
}

/** Saves a finished scan with its scores and returns the new report id. */
export async function saveScan(address: URL, report: ScanReport): Promise<string> {
  const id = randomBytes(16).toString("base64url");
  const checks: ChecksColumn = {
    catalogVersion: CATALOG_VERSION,
    readOverHttp: report.readOverHttp,
    results: report.results,
  };
  await pool.query(
    `insert into scans (id, cache_key, domain, url, created_at, status, checks, scores)
     values ($1, $2, $3, $4, $5, 'done', $6, $7)`,
    [id, cacheKey(address), normalizedDomain(address), report.url, report.scannedAt, checks, scoresOf(report.results)],
  );
  return id;
}

export async function findScan(id: string): Promise<SavedScan | undefined> {
  // Anything else cannot be a report: no query for it.
  if (!REPORT_ID.test(id)) return undefined;
  const { rows } = await pool.query<{ url: string; created_at: Date; checks: ChecksColumn; scores: Scores }>(
    "select url, created_at, checks, scores from scans where id = $1",
    [id],
  );
  const row = rows[0];
  if (!row) return undefined;
  return {
    id,
    report: {
      url: row.url,
      scannedAt: row.created_at.toISOString(),
      ...(row.checks.readOverHttp && { readOverHttp: row.checks.readOverHttp }),
      results: row.checks.results,
    },
    scores: row.scores,
    catalogVersion: row.checks.catalogVersion,
  };
}
