import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SafeRequestError, type CertificateInfo, type SafeRequestOptions, type SafeResponse } from "@/lib/safe-request";

import { CHECKS } from "./catalog";
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
    expect(outcome.report.results.map((r) => r.id)).toEqual(Object.keys(CHECKS));
    expect(outcome.report.results.slice(0, 4).every((r) => r.outcome === "ok")).toBe(true);
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

describe("page checks: which version is read (SPEC, regole comuni)", () => {
  type Answer = SafeResponse | SafeRequestError;
  const PAGE_CHECK_IDS = Object.keys(CHECKS).slice(4);

  // The Server header tells which response the page checks read.
  const page = (url: string, server: string, status = 200, redirects: string[] = []): SafeResponse => ({
    ...okPage(new URL(url), status, { server }),
    redirects: redirects.map((r) => new URL(r)),
  });
  const redirect = (url: string, location: string) => okPage(new URL(url), 301, { location });
  const fail = (code: SafeRequestError["code"]) => new SafeRequestError(code, "test");

  function site(https: Answer, http: Record<string, Answer>): ScanIO {
    return {
      safeRequest: vi.fn(async (url: URL) => {
        const answer = url.protocol === "https:" ? https : http[url.href];
        if (!answer) throw new Error(`unexpected request to ${url.href}`);
        if (answer instanceof SafeRequestError) throw answer;
        return answer;
      }),
      inspectCertificate: vi.fn(async () => goodCertificate),
    };
  }

  async function scan(io: ScanIO, address = "https://esempio.it/") {
    const outcome = await runScan(new URL(address), io, { now });
    if (!outcome.ok) throw new Error("expected a report");
    const byId = Object.fromEntries(outcome.report.results.map((r) => [r.id, r]));
    return { report: outcome.report, byId, pageResults: outcome.report.results.slice(4) };
  }

  const httpsPage = page("https://esempio.it/", "via-https");
  const httpPage = page("http://esempio.it/", "via-http");
  const toHttps = redirect("http://esempio.it/", "https://esempio.it/");

  it("1. reads https when it answers, without a note", async () => {
    const { report, byId } = await scan(site(httpsPage, { "http://esempio.it/": toHttps }));
    expect(report.readOverHttp).toBeUndefined();
    expect(byId.exposedVersions.found[0]).toBe("Server: via-https");
    expect(byId.hsts.outcome).toBe("warning");
  });

  it.each(["tls_error", "connection_refused", "timeout"] as const)(
    "2-4. falls back to http when https fails with %s, with a note",
    async (code) => {
      const { report, byId } = await scan(site(fail(code), { "http://esempio.it/": httpPage }));
      expect(report.readOverHttp).toBe("http://esempio.it/");
      expect(byId.exposedVersions.found[0]).toBe("Server: via-http");
      expect(byId.csp.outcome).toBe("warning");
      for (const id of ["hsts", "mixedContent"]) {
        expect(byId[id]).toMatchObject({ outcome: "unverified", reason: "read_over_http" });
      }
    },
  );

  it("5. reads no page when http only redirects to the failing https", async () => {
    const { report, pageResults } = await scan(site(fail("tls_error"), { "http://esempio.it/": toHttps }));
    expect(report.readOverHttp).toBeUndefined();
    expect(pageResults.map((r) => r.id)).toEqual(PAGE_CHECK_IDS);
    for (const result of pageResults) {
      expect(result).toMatchObject({ outcome: "unverified", reason: "page_unreachable" });
      expect(result.found).toEqual(["https: tls_error (test)", "http: rimanda a https://esempio.it/"]);
    }
  });

  it("6. reads no page when both refuse the connection, keeping the M1 outcomes", async () => {
    const { byId, pageResults } = await scan(
      site(fail("connection_refused"), { "http://esempio.it/": fail("connection_refused") }),
    );
    expect(byId.https.outcome).toBe("problem");
    expect(byId.httpRedirect.outcome).toBe("warning");
    expect(pageResults.every((r) => r.outcome === "unverified" && r.reason === "page_unreachable")).toBe(true);
  });

  it("7. reads the end of an http chain", async () => {
    const io = site(fail("tls_error"), {
      "http://esempio.it/": redirect("http://esempio.it/", "http://www.esempio.it/"),
      "http://www.esempio.it/": page("http://www.esempio.it/", "via-http-www"),
    });
    const { report, byId } = await scan(io);
    expect(report.readOverHttp).toBe("http://www.esempio.it/");
    expect(byId.exposedVersions.found[0]).toBe("Server: via-http-www");
  });

  it("8. reads no page when a later http hop times out", async () => {
    const io = site(fail("tls_error"), {
      "http://esempio.it/": redirect("http://esempio.it/", "http://www.esempio.it/"),
      "http://www.esempio.it/": fail("timeout"),
    });
    const { pageResults } = await scan(io);
    expect(pageResults.every((r) => r.outcome === "unverified" && r.reason === "page_unreachable")).toBe(true);
    expect(pageResults[0].found).toEqual(["https: tls_error (test)", "http: timeout (test)"]);
  });

  it.each(["too_large", "bad_response"] as const)("9. does not fall back when https answered with %s", async (code) => {
    const { report, pageResults } = await scan(site(fail(code), { "http://esempio.it/": httpPage }));
    expect(report.readOverHttp).toBeUndefined();
    expect(pageResults.every((r) => r.outcome === "unverified" && r.reason === code)).toBe(true);
  });

  it("10. reads the http page that https redirects to, with a note", async () => {
    const downgraded = page("http://esempio.it/", "via-downgrade", 200, ["https://esempio.it/"]);
    const { report, byId } = await scan(site(downgraded, { "http://esempio.it/": httpPage }));
    expect(byId.https.outcome).toBe("problem");
    expect(report.readOverHttp).toBe("http://esempio.it/");
    expect(byId.exposedVersions.found[0]).toBe("Server: via-downgrade");
    expect(byId.hsts).toMatchObject({ outcome: "unverified", reason: "read_over_http" });
  });

  it("11. reads an https error page: it is what visitors get", async () => {
    const { report, byId } = await scan(site(page("https://esempio.it/", "via-https-500", 500), { "http://esempio.it/": toHttps }));
    expect(report.readOverHttp).toBeUndefined();
    expect(byId.https.found[0]).toContain("(500)");
    expect(byId.exposedVersions.found[0]).toBe("Server: via-https-500");
  });

  it("12. reads https when the address was typed with http://", async () => {
    const { report, byId } = await scan(site(httpsPage, { "http://esempio.it/": toHttps }), "http://esempio.it/");
    expect(report.readOverHttp).toBeUndefined();
    expect(byId.exposedVersions.found[0]).toBe("Server: via-https");
  });

  it("13. says the scan deadline stopped it when http is still running", async () => {
    const io: ScanIO = {
      safeRequest: (url, options) =>
        url.protocol === "https:"
          ? Promise.reject(fail("tls_error"))
          : new Promise<never>((_, reject) => {
              options?.signal?.addEventListener("abort", () => reject(fail("scan_deadline")));
            }),
      inspectCertificate: async () => goodCertificate,
    };
    const outcome = await runScan(new URL("https://esempio.it/"), io, { now, timeoutMs: 50 });
    if (!outcome.ok) throw new Error("expected a report");
    const pageResults = outcome.report.results.slice(4);
    expect(pageResults.every((r) => r.outcome === "unverified" && r.reason === "scan_deadline")).toBe(true);
  });
});
