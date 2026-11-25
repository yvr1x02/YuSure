import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SafeRequestError, type CertificateInfo, type SafeRequestOptions, type SafeResponse } from "@/lib/safe-request";

import { runScan, type ScanIO } from "./scan";

// Fake network: every answer is made up here, nothing leaves the process.

const now = new Date("2026-11-25T12:00:00Z");

const okPage = (url: URL, status = 200, headers: Record<string, string> = {}): SafeResponse => ({
  url,
  status,
  headers,
  body: Buffer.from("<html></html>"),
  address: "8.8.8.8",
  redirects: [],
});

const goodCertificate: CertificateInfo = {
  address: "8.8.8.8",
  authorized: true,
  authorizationError: undefined,
  validFrom: new Date("2026-09-01T00:00:00Z"),
  validTo: new Date("2027-03-12T10:00:00Z"),
  issuer: "Let's Encrypt",
  subjectAltNames: ["DNS:esempio.it"],
};

function healthySite(): ScanIO {
  return {
    safeRequest: vi.fn(async (url: URL) =>
      url.protocol === "http:" ? okPage(url, 301, { location: url.href.replace("http:", "https:") }) : okPage(url),
    ),
    inspectCertificate: vi.fn(async () => goodCertificate),
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runScan", () => {
  it("checks the https version even when the address was typed with http", async () => {
    const io = healthySite();
    const outcome = await runScan(new URL("http://esempio.it/menu"), io, { now });

    expect(outcome).toMatchObject({ ok: true, report: { url: "https://esempio.it/menu", scannedAt: now.toISOString() } });
    expect(io.inspectCertificate).toHaveBeenCalledWith(new URL("https://esempio.it/menu"), expect.anything());
    expect(io.safeRequest).toHaveBeenCalledWith(new URL("https://esempio.it/menu"), expect.anything());
    expect(io.safeRequest).toHaveBeenCalledWith(new URL("http://esempio.it/menu"), expect.objectContaining({ followRedirects: false }));
  });

  it("returns one result per check, in catalog order", async () => {
    const outcome = await runScan(new URL("https://esempio.it/"), healthySite(), { now });
    if (!outcome.ok) throw new Error("expected a report");
    expect(outcome.report.results.map((r) => [r.id, r.outcome])).toEqual([
      ["https", "ok"],
      ["httpRedirect", "ok"],
      ["certificateValid", "ok"],
      ["certificateExpiry", "ok"],
    ]);
  });

  it.each(["not_public", "dns_failed"] as const)("stops with no report when the site itself is %s", async (code) => {
    const fail = async () => {
      throw new SafeRequestError(code, "test");
    };
    const outcome = await runScan(new URL("https://esempio.it/"), { safeRequest: fail, inspectCertificate: fail }, { now });
    expect(outcome).toEqual({ ok: false, reason: code });
  });

  it("still reports when only a redirect leads somewhere private", async () => {
    const io = healthySite();
    io.safeRequest = vi.fn(async (url: URL) => {
      if (url.protocol === "https:") throw new SafeRequestError("not_public", "redirect to 10.0.0.1");
      return okPage(url, 200);
    });
    const outcome = await runScan(new URL("https://esempio.it/"), io, { now });
    if (!outcome.ok) throw new Error("expected a report");
    expect(outcome.report.results[0]).toMatchObject({ id: "https", outcome: "unverified", reason: "not_public" });
  });

  it("passes the scan deadline to every request, and reports what it stopped", async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const hang = (options?: SafeRequestOptions) =>
      new Promise<never>((_, reject) => {
        signals.push(options?.signal);
        options?.signal?.addEventListener("abort", () => reject(new SafeRequestError("scan_deadline", "test")));
      });
    const io: ScanIO = {
      safeRequest: (_url, options) => hang(options),
      inspectCertificate: (_url, options) => hang(options),
    };

    const outcome = await runScan(new URL("https://esempio.it/"), io, { now, timeoutMs: 50 });
    if (!outcome.ok) throw new Error("expected a report");
    expect(signals).toHaveLength(3);
    expect(new Set(signals).size).toBe(1);
    expect(outcome.report.results.every((r) => r.outcome === "unverified" && r.reason === "scan_deadline")).toBe(true);
  });

  it("logs the technical reason with the host only", async () => {
    const warn = vi.mocked(console.warn);
    const io = healthySite();
    io.inspectCertificate = async () => {
      throw new SafeRequestError("timeout", "no complete response in 10000 ms");
    };
    await runScan(new URL("https://esempio.it/"), io, { now });
    expect(warn).toHaveBeenCalledWith("[scan] esempio.it certificate: timeout (no complete response in 10000 ms)");
  });
});
