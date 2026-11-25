import { afterEach, describe, expect, it, vi } from "vitest";

import { runScan } from "@/lib/checks/scan";
import { inspectCertificate, safeRequest } from "@/lib/safe-request";

import { scan, type ScanState } from "./actions";

// No network here: the scan and the bound request functions are replaced.
vi.mock("@/lib/checks/scan", () => ({ runScan: vi.fn() }));
vi.mock("@/lib/safe-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/safe-request")>()),
  safeRequest: vi.fn(),
  inspectCertificate: vi.fn(),
}));

const idle: ScanState = { status: "idle", address: "" };
const form = (url: string) => {
  const data = new FormData();
  data.set("url", url);
  return data;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("scan action", () => {
  it.each([undefined, "", "false", "1", "TRUE"])("refuses before any network when SCAN_ENABLED is %j", async (value) => {
    vi.stubEnv("SCAN_ENABLED", value);
    const state = await scan(idle, form("esempio.it"));
    expect(state).toEqual({
      status: "error",
      address: "",
      message: "YuSure è in costruzione: le scansioni arrivano a breve.",
    });
    expect(runScan).not.toHaveBeenCalled();
    expect(safeRequest).not.toHaveBeenCalled();
    expect(inspectCertificate).not.toHaveBeenCalled();
  });

  it("scans when SCAN_ENABLED is true", async () => {
    vi.stubEnv("SCAN_ENABLED", "true");
    const report = { url: "https://esempio.it/", scannedAt: "2026-11-25T12:00:00.000Z", results: [] };
    vi.mocked(runScan).mockResolvedValue({ ok: true, report });

    const state = await scan(idle, form("esempio.it"));

    expect(state).toEqual({ status: "done", address: "esempio.it", report });
    expect(runScan).toHaveBeenCalledWith(new URL("https://esempio.it/"), { safeRequest, inspectCertificate });
  });

  it("still refuses a non-public address without scanning", async () => {
    vi.stubEnv("SCAN_ENABLED", "true");
    const state = await scan(idle, form("localhost"));
    expect(state).toMatchObject({ status: "error", message: "Questo indirizzo non è un sito pubblico." });
    expect(runScan).not.toHaveBeenCalled();
  });

  it("turns a site-level failure into a message", async () => {
    vi.stubEnv("SCAN_ENABLED", "true");
    vi.mocked(runScan).mockResolvedValue({ ok: false, reason: "dns_failed" });
    const state = await scan(idle, form("nonesiste.it"));
    expect(state).toMatchObject({ status: "error", message: expect.stringContaining("Controlla che sia scritto bene") });
  });
});
