import { describe, expect, it, vi } from "vitest";

import { SafeRequestError, type SafeResponse } from "@/lib/safe-request";

import { evaluateHttpRedirect, evaluateHttps, traceHttpRedirects } from "./https";

function response(url: string, status = 200, headers: Record<string, string> = {}, redirects: string[] = []): SafeResponse {
  return {
    url: new URL(url),
    status,
    headers,
    body: Buffer.alloc(0),
    address: "8.8.8.8",
    redirects: redirects.map((r) => new URL(r)),
  };
}

const fail = (code: SafeRequestError["code"], message = "test") => new SafeRequestError(code, message);

describe("evaluateHttps", () => {
  it("is ok when https answers", () => {
    expect(evaluateHttps(response("https://esempio.it/"))).toMatchObject({ id: "https", outcome: "ok" });
  });

  it.each(["tls_error", "too_large", "bad_response"] as const)(
    "is ok when https answered but the request stopped with %s",
    (code) => {
      expect(evaluateHttps(fail(code)).outcome).toBe("ok");
    },
  );

  it("is a problem when https redirects to http", () => {
    const result = evaluateHttps(response("http://esempio.it/", 200, {}, ["https://esempio.it/"]));
    expect(result).toMatchObject({ outcome: "problem", found: ["https://esempio.it/ → http://esempio.it/ (200)"] });
  });

  it("is a problem when port 443 refuses the connection", () => {
    expect(evaluateHttps(fail("connection_refused")).outcome).toBe("problem");
  });

  it("is unverified on a timeout, with the reason", () => {
    expect(evaluateHttps(fail("timeout"))).toMatchObject({ outcome: "unverified", reason: "timeout" });
  });

  it("says when the scan deadline stopped it", () => {
    expect(evaluateHttps(fail("scan_deadline"))).toMatchObject({ outcome: "unverified", reason: "scan_deadline" });
  });
});

describe("traceHttpRedirects", () => {
  function site(routes: Record<string, SafeResponse | SafeRequestError>) {
    return vi.fn(async (url: URL) => {
      const route = routes[url.href];
      if (!route) throw new Error(`unexpected request to ${url.href}`);
      if (route instanceof SafeRequestError) throw route;
      return route;
    });
  }

  it("starts from http and stops at the first https Location, without requesting it", async () => {
    const request = site({ "http://esempio.it/menu": response("http://esempio.it/menu", 301, { location: "https://esempio.it/menu" }) });
    const trace = await traceHttpRedirects(new URL("https://esempio.it/menu"), request);
    expect(trace).toEqual({
      hops: [{ url: "http://esempio.it/menu", status: 301, location: "https://esempio.it/menu" }],
    });
    expect(request).toHaveBeenCalledWith(new URL("http://esempio.it/menu"), { followRedirects: false, signal: undefined });
  });

  it("follows a chain that stays on http", async () => {
    const request = site({
      "http://esempio.it/": response("http://esempio.it/", 301, { location: "http://www.esempio.it/" }),
      "http://www.esempio.it/": response("http://www.esempio.it/", 302, { location: "https://www.esempio.it/" }),
    });
    const trace = await traceHttpRedirects(new URL("https://esempio.it/"), request);
    expect(trace.hops.map((hop) => hop.status)).toEqual([301, 302]);
    expect(trace.error).toBeUndefined();
    expect(trace.page).toBeUndefined();
  });

  it("keeps the page when the chain ends on http", async () => {
    const page = response("http://www.esempio.it/", 200);
    const request = site({
      "http://esempio.it/": response("http://esempio.it/", 301, { location: "http://www.esempio.it/" }),
      "http://www.esempio.it/": page,
    });
    const trace = await traceHttpRedirects(new URL("https://esempio.it/"), request);
    expect(trace.page).toBe(page);
  });

  it("gives up after 5 redirects on http", async () => {
    const routes: Record<string, SafeResponse> = {};
    for (let i = 0; i <= 6; i++) {
      routes[`http://esempio.it/${i}`] = response(`http://esempio.it/${i}`, 302, { location: `/${i + 1}` });
    }
    const trace = await traceHttpRedirects(new URL("https://esempio.it/0"), site(routes));
    expect(trace.hops).toHaveLength(6);
    expect(trace.error?.code).toBe("too_many_redirects");
  });

  it("keeps the hops read before an error", async () => {
    const request = site({
      "http://esempio.it/": response("http://esempio.it/", 301, { location: "http://interno.esempio.it/" }),
      "http://interno.esempio.it/": fail("not_public"),
    });
    const trace = await traceHttpRedirects(new URL("https://esempio.it/"), request);
    expect(trace.hops).toHaveLength(1);
    expect(trace.error?.code).toBe("not_public");
  });

  it("lets a bug through instead of hiding it as a result", async () => {
    const request = vi.fn(async () => {
      throw new TypeError("bug");
    });
    await expect(traceHttpRedirects(new URL("https://esempio.it/"), request)).rejects.toThrow(TypeError);
  });
});

describe("evaluateHttpRedirect", () => {
  const hop = (url: string, status: number, location?: string) => ({ url, status, location });

  it.each([301, 302, 307, 308])("is ok when a %i leads to https", (status) => {
    const result = evaluateHttpRedirect({ hops: [hop("http://esempio.it/", status, "https://esempio.it/")] });
    expect(result).toMatchObject({ id: "httpRedirect", outcome: "ok", found: [`http://esempio.it/ → ${status} → https://esempio.it/`] });
  });

  it("is ok when a chain on http ends on https", () => {
    const trace = {
      hops: [hop("http://esempio.it/", 301, "http://www.esempio.it/"), hop("http://www.esempio.it/", 301, "https://www.esempio.it/")],
    };
    expect(evaluateHttpRedirect(trace).outcome).toBe("ok");
  });

  it("is a warning when port 80 refuses the connection", () => {
    expect(evaluateHttpRedirect({ hops: [], error: fail("connection_refused") }).outcome).toBe("warning");
  });

  it("is a problem when http serves the page", () => {
    expect(evaluateHttpRedirect({ hops: [hop("http://esempio.it/", 200)] }).outcome).toBe("problem");
  });

  it("is a problem when the chain ends on http", () => {
    const trace = { hops: [hop("http://esempio.it/", 301, "http://www.esempio.it/"), hop("http://www.esempio.it/", 200)] };
    expect(evaluateHttpRedirect(trace).outcome).toBe("problem");
  });

  it.each(["timeout", "too_many_redirects", "not_public", "connection_failed"] as const)(
    "is unverified on %s, with the reason and the hops read",
    (code) => {
      const result = evaluateHttpRedirect({ hops: [hop("http://esempio.it/", 301, "http://altro.it/")], error: fail(code) });
      expect(result).toMatchObject({ outcome: "unverified", reason: code });
      expect(result.found).toHaveLength(2);
    },
  );

  it("is unverified, not a warning, when a later hop refuses the connection", () => {
    const trace = { hops: [hop("http://esempio.it/", 301, "http://www.esempio.it/")], error: fail("connection_refused") };
    expect(evaluateHttpRedirect(trace).outcome).toBe("unverified");
  });
});
