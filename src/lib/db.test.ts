import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CATALOG_VERSION } from "@/lib/checks/catalog";
import type { ScanReport } from "@/lib/checks/scan";
import { scoresOf } from "@/lib/checks/score";
import { pool } from "@/lib/db";
import { deleteExpiredRequests, limitFromEnv, reserveScan } from "@/lib/limits";
import { normalizeAddress } from "@/lib/safe-request";
import { findRecentScanId, findScan, saveScan } from "@/lib/scans";

import { migrate } from "../../scripts/migrate.mjs";

// One file for every database test: files run in parallel and would empty each other's tables.
const database = process.env.TEST_DATABASE_URL;

const report: ScanReport = {
  url: "https://esempio.it/menu",
  scannedAt: new Date().toISOString(),
  results: [
    { id: "https", outcome: "ok", found: ["https://esempio.it/menu (200)"] },
    { id: "httpRedirect", outcome: "problem", found: ["http://esempio.it/menu → 200"] },
  ],
};
const menu = normalizeAddress("esempio.it/menu");

const requestsOf = async (ipHash: string) =>
  (await pool.query("select count(*)::int as count from scan_requests where ip_hash = $1", [ipHash])).rows[0].count;

describe("limitFromEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the default when unset or empty", () => {
    vi.stubEnv("SCAN_LIMIT_TEST", undefined);
    expect(limitFromEnv("SCAN_LIMIT_TEST", 5)).toBe(5);
    vi.stubEnv("SCAN_LIMIT_TEST", "");
    expect(limitFromEnv("SCAN_LIMIT_TEST", 5)).toBe(5);
  });

  it("reads a positive integer", () => {
    vi.stubEnv("SCAN_LIMIT_TEST", "12");
    expect(limitFromEnv("SCAN_LIMIT_TEST", 5)).toBe(12);
  });

  it.each(["0", "-1", "2.5", "cinque", "1e9x"])("throws on %j instead of lifting the limit", (value) => {
    vi.stubEnv("SCAN_LIMIT_TEST", value);
    expect(() => limitFromEnv("SCAN_LIMIT_TEST", 5)).toThrow("SCAN_LIMIT_TEST must be a positive integer");
  });
});

describe.skipIf(!database)("database (TEST_DATABASE_URL)", () => {
  beforeEach(async () => {
    await pool.query("truncate scans, scan_requests");
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await pool.end();
  });

  it("applies each migration once", async () => {
    // The global setup already applied them: a second run finds nothing to do.
    const applied: string[] = [];
    await migrate(database!, { log: (line: string) => applied.push(line) });
    expect(applied).toEqual([]);
    const { rows } = await pool.query("select name from schema_migrations");
    expect(rows.map((row) => row.name)).toContain("001_scans.sql");
  });

  describe("scans", () => {
    it("saves a report and reads it back with its scores and catalog version", async () => {
      const id = await saveScan(menu, report);
      expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);

      const saved = await findScan(id);
      expect(saved).toEqual({ id, report, scores: scoresOf(report.results) });

      const { rows } = await pool.query("select cache_key, domain, status, checks from scans where id = $1", [id]);
      expect(rows[0]).toMatchObject({ cache_key: "esempio.it/menu", domain: "esempio.it", status: "done" });
      expect(rows[0].checks.catalogVersion).toBe(CATALOG_VERSION);
    });

    it("finds nothing for an unknown or malformed id", async () => {
      expect(await findScan("AAAAAAAAAAAAAAAAAAAAAA")).toBeUndefined();
      expect(await findScan("'; drop table scans; --")).toBeUndefined();
    });

    it("reuses a report of the same page from the last 24 hours, whatever the scheme or query", async () => {
      const id = await saveScan(menu, report);
      expect(await findRecentScanId(normalizeAddress("http://www.esempio.it/menu/?da=mail"))).toBe(id);
      expect(await findRecentScanId(normalizeAddress("esempio.it/contatti"))).toBeUndefined();

      await pool.query("update scans set created_at = now() - interval '25 hours'");
      expect(await findRecentScanId(menu)).toBeUndefined();
    });
  });

  describe("limits", () => {
    it("lets 5 scans an hour through for one IP, even when they arrive together", async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => reserveScan("ip-a")));
      expect(results.filter((r) => r === undefined)).toHaveLength(5);
      expect(results.filter((r) => r === "ip_limit")).toHaveLength(3);
      // A refused request is not recorded.
      expect(await requestsOf("ip-a")).toBe(5);
      // Another IP has its own count.
      expect(await reserveScan("ip-b")).toBeUndefined();
    });

    it("counts only the last hour", async () => {
      await pool.query(
        "insert into scan_requests (ip_hash, created_at) select 'ip-a', now() - interval '61 minutes' from generate_series(1, 5)",
      );
      expect(await reserveScan("ip-a")).toBeUndefined();
    });

    it("refuses over the daily cap, counted on the reports of the last 24 hours", async () => {
      vi.stubEnv("SCAN_LIMIT_DAILY", "2");
      await saveScan(menu, report);
      await saveScan(normalizeAddress("esempio.it/contatti"), report);
      expect(await reserveScan("ip-a")).toBe("daily_limit");
      expect(await requestsOf("ip-a")).toBe(0);

      await pool.query("update scans set created_at = now() - interval '25 hours'");
      expect(await reserveScan("ip-a")).toBeUndefined();
    });

    it("reads the per-IP limit from the environment", async () => {
      vi.stubEnv("SCAN_LIMIT_PER_IP_HOUR", "1");
      expect(await reserveScan("ip-a")).toBeUndefined();
      expect(await reserveScan("ip-a")).toBe("ip_limit");
    });

    it("deletes requests older than 2 hours, at every scan and from the cron", async () => {
      const old = "insert into scan_requests (ip_hash, created_at) values ('ip-old', now() - interval '121 minutes')";
      await pool.query(old);
      await pool.query("insert into scan_requests (ip_hash, created_at) values ('ip-recent', now() - interval '119 minutes')");
      await reserveScan("ip-a");
      expect(await requestsOf("ip-old")).toBe(0);
      expect(await requestsOf("ip-recent")).toBe(1);

      await pool.query(old);
      expect(await deleteExpiredRequests()).toBe(1);
      expect(await requestsOf("ip-recent")).toBe(1);
    });
  });
});
