import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runScan } from "@/lib/checks/scan";
import { hashIp, reserveScan } from "@/lib/limits";
import { inspectCertificate, safeRequest } from "@/lib/safe-request";
import { findRecentScanId, saveScan } from "@/lib/scans";

import { scan, type ScanState } from "./actions";

// No network and no database here: the scan, the bound request functions and the queries are replaced.
vi.mock("@/lib/checks/scan", () => ({ runScan: vi.fn() }));
vi.mock("@/lib/safe-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/safe-request")>()),
  safeRequest: vi.fn(),
  inspectCertificate: vi.fn(),
}));
vi.mock("@/lib/scans", () => ({ findRecentScanId: vi.fn(), saveScan: vi.fn() }));
vi.mock("@/lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/limits")>()),
  reserveScan: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
// The real redirect() throws to stop rendering; here it only records where it was sent.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const idle: ScanState = { status: "idle", address: "" };
const form = (url: string) => {
  const data = new FormData();
  data.set("url", url);
  return data;
};
const report = { url: "https://esempio.it/", scannedAt: "2026-11-25T12:00:00.000Z", results: [] };

beforeEach(() => {
  vi.stubEnv("SCAN_ENABLED", "true");
  vi.stubEnv("IP_HASH_SECRET", "segreto-di-prova");
  vi.stubEnv("VERCEL", "1");
  vi.mocked(headers).mockResolvedValue(new Headers({ "x-real-ip": "203.0.113.7" }) as never);
  vi.mocked(runScan).mockResolvedValue({ ok: true, report });
  vi.mocked(saveScan).mockResolvedValue("nuovoReport");
});

afterEach(() => {
  vi.unstubAllEnvs();
  // Reset, not clear: a mocked answer must not leak into the next test.
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

const nothingTouched = () => {
  expect(findRecentScanId).not.toHaveBeenCalled();
  expect(reserveScan).not.toHaveBeenCalled();
  expect(runScan).not.toHaveBeenCalled();
  expect(safeRequest).not.toHaveBeenCalled();
  expect(inspectCertificate).not.toHaveBeenCalled();
};

describe("scan action", () => {
  it.each([undefined, "", "false", "1", "TRUE"])("refuses before any network when SCAN_ENABLED is %j", async (value) => {
    vi.stubEnv("SCAN_ENABLED", value);
    const state = await scan(idle, form("esempio.it"));
    expect(state).toEqual({
      status: "error",
      address: "",
      message: "YuSure è in costruzione: le scansioni arrivano a breve.",
    });
    nothingTouched();
  });

  it("scans, saves and opens the new report", async () => {
    await scan(idle, form("esempio.it"));

    expect(findRecentScanId).toHaveBeenCalledWith(new URL("https://esempio.it/"));
    // The limit sees the HMAC of the IP, never the IP.
    expect(reserveScan).toHaveBeenCalledWith(hashIp("203.0.113.7", "segreto-di-prova"));
    expect(runScan).toHaveBeenCalledWith(new URL("https://esempio.it/"), { safeRequest, inspectCertificate });
    expect(saveScan).toHaveBeenCalledWith(new URL("https://esempio.it/"), report);
    expect(redirect).toHaveBeenCalledWith("/report/nuovoReport");
  });

  it("opens the report of the last 24 hours without scanning or counting", async () => {
    vi.mocked(findRecentScanId).mockResolvedValue("reportDiIeri");
    await scan(idle, form("http://esempio.it"));
    expect(redirect).toHaveBeenCalledWith("/report/reportDiIeri");
    expect(reserveScan).not.toHaveBeenCalled();
    expect(runScan).not.toHaveBeenCalled();
  });

  it.each([
    ["ip_limit", "Hai raggiunto il numero massimo di analisi per un'ora"],
    ["daily_limit", "numero massimo di analisi per oggi"],
  ] as const)("refuses over the %s without scanning", async (refusal, message) => {
    vi.mocked(reserveScan).mockResolvedValue(refusal);
    const state = await scan(idle, form("esempio.it"));
    expect(state).toMatchObject({ status: "error", address: "esempio.it", message: expect.stringContaining(message) });
    expect(runScan).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([undefined, ""])("refuses when IP_HASH_SECRET is %j", async (value) => {
    vi.stubEnv("IP_HASH_SECRET", value);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await scan(idle, form("esempio.it"));
    expect(state).toMatchObject({ status: "error", message: expect.stringContaining("non riesce ad analizzare") });
    expect(error).toHaveBeenCalledWith("[scan] refused: IP_HASH_SECRET is not set");
    nothingTouched();
  });

  it("refuses on Vercel when the client IP is missing", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers() as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await scan(idle, form("esempio.it"));
    expect(state).toMatchObject({ status: "error", message: expect.stringContaining("non riesce ad analizzare") });
    nothingTouched();
  });

  it("counts every local request as one client outside Vercel", async () => {
    vi.stubEnv("VERCEL", "");
    vi.mocked(headers).mockResolvedValue(new Headers() as never);
    await scan(idle, form("esempio.it"));
    expect(reserveScan).toHaveBeenCalledWith(hashIp("local", "segreto-di-prova"));
  });

  it("logs a database failure and says scans are unavailable", async () => {
    const failure = new Error("connection terminated");
    vi.mocked(findRecentScanId).mockRejectedValue(failure);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await scan(idle, form("esempio.it"));
    expect(state).toMatchObject({ status: "error", message: expect.stringContaining("non riesce ad analizzare") });
    expect(error).toHaveBeenCalledWith("[scan] failed:", failure);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("still refuses a non-public address without scanning", async () => {
    const state = await scan(idle, form("localhost"));
    expect(state).toMatchObject({ status: "error", message: "Questo indirizzo non è un sito pubblico." });
    nothingTouched();
  });

  it("turns a site-level failure into a message and saves nothing", async () => {
    vi.mocked(runScan).mockResolvedValue({ ok: false, reason: "dns_failed" });
    const state = await scan(idle, form("nonesiste.it"));
    expect(state).toMatchObject({ status: "error", message: expect.stringContaining("Controlla che sia scritto bene") });
    expect(saveScan).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
