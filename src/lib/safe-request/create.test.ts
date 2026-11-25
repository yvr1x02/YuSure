import { once } from "node:events";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net, { type AddressInfo } from "node:net";
import zlib from "node:zlib";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createSafeRequest, USER_AGENT, type SafeRequestDeps } from "./create";
import { SafeRequestError } from "./errors";
import type { ResolvedAddress } from "./resolve";

/*
 * No request leaves this machine: the fake resolver answers with public IPs that are
 * only values, and mapAddress sends every connection to a local server on 127.0.0.1.
 */

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const cert = fixture("test-only-cert.pem");
const key = fixture("test-only-key.pem");

const MB = 1024 * 1024;

const DNS: Record<string, ResolvedAddress[]> = {
  "esempio.test": [{ address: "8.8.8.8", family: 4 }],
  "www.esempio.test": [{ address: "8.8.4.4", family: 4 }],
  "interno.test": [{ address: "192.168.1.1", family: 4 }],
};

let handler: http.RequestListener;
const httpServer = http.createServer((req, res) => handler(req, res));
const httpsServer = https.createServer({ key, cert }, (req, res) => handler(req, res));
let httpPort: number;
let httpsPort: number;
let closedPort: number;

beforeAll(async () => {
  httpServer.listen(0, "127.0.0.1");
  httpsServer.listen(0, "127.0.0.1");
  await Promise.all([once(httpServer, "listening"), once(httpsServer, "listening")]);
  httpPort = (httpServer.address() as AddressInfo).port;
  httpsPort = (httpsServer.address() as AddressInfo).port;

  const probe = http.createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  closedPort = (probe.address() as AddressInfo).port;
  probe.close();
});

afterAll(() => {
  for (const server of [httpServer, httpsServer]) {
    server.closeAllConnections();
    server.close();
  }
});

beforeEach(() => {
  handler = (_req, res) => res.end("ok");
});

function setup(overrides: Partial<SafeRequestDeps> = {}) {
  const resolve = vi.fn(async (hostname: string) => {
    const answers = DNS[hostname];
    if (!answers) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return answers;
  });
  const mapAddress = vi.fn((_ip: string, port: number) => ({
    host: "127.0.0.1",
    port: port === 443 ? httpsPort : httpPort,
  }));
  const deps: SafeRequestDeps = { resolve, mapAddress, timeoutMs: 2_000, maxBytes: 2 * MB, ca: cert, ...overrides };
  return { ...createSafeRequest(deps), resolve: deps.resolve, mapAddress: deps.mapAddress };
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SafeRequestError) return error.code;
    throw error;
  }
  return "ok";
}

describe("connection to the verified IP", () => {
  it("resolves once, connects to the verified IP and sends the original host name", async () => {
    let seen: http.IncomingHttpHeaders = {};
    handler = (req, res) => {
      seen = req.headers;
      res.end("<html>ciao</html>");
    };
    const { safeRequest, resolve, mapAddress } = setup();

    const response = await safeRequest(new URL("http://esempio.test/menu?x=1"));

    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe("<html>ciao</html>");
    expect(response.address).toBe("8.8.8.8");
    expect(resolve).toHaveBeenCalledOnce();
    expect(mapAddress).toHaveBeenCalledWith("8.8.8.8", 80);
    expect(seen.host).toBe("esempio.test");
    expect(seen["user-agent"]).toBe(USER_AGENT);
  });

  it("ignores a DNS answer that changes after the check (rebinding)", async () => {
    const answers = [[{ address: "8.8.8.8", family: 4 }], [{ address: "127.0.0.1", family: 4 }]];
    const resolve = vi.fn(async () => answers.shift() ?? []);
    const { safeRequest, mapAddress } = setup({ resolve });

    await expect(safeRequest(new URL("http://esempio.test/"))).resolves.toMatchObject({ status: 200 });
    expect(resolve).toHaveBeenCalledOnce();
    expect(mapAddress).toHaveBeenCalledWith("8.8.8.8", 80);
  });

  it("never lets Node resolve a name a second time", async () => {
    const { safeRequest } = setup({ mapAddress: () => ({ host: "localhost", port: httpPort }) });
    await expect(codeOf(safeRequest(new URL("http://esempio.test/")))).resolves.toBe("connection_failed");
  });

  it("uses the domain for SNI and certificate check while connecting to the IP", async () => {
    let servername: string | false | null | undefined;
    handler = (req, res) => {
      servername = (req.socket as import("node:tls").TLSSocket).servername;
      res.end("ok");
    };
    const { safeRequest, mapAddress } = setup();

    await expect(safeRequest(new URL("https://esempio.test/"))).resolves.toMatchObject({ status: 200 });
    expect(mapAddress).toHaveBeenCalledWith("8.8.8.8", 443);
    expect(servername).toBe("esempio.test");
  });

  it("rejects a certificate issued for another name", async () => {
    const { safeRequest } = setup();
    await expect(codeOf(safeRequest(new URL("https://www.esempio.test/")))).resolves.toBe("tls_error");
  });

  it("rejects a certificate the system does not trust", async () => {
    const { safeRequest } = setup({ ca: undefined });
    await expect(codeOf(safeRequest(new URL("https://esempio.test/")))).resolves.toBe("tls_error");
  });

  it("re-checks the URL rules before connecting", async () => {
    const { safeRequest, resolve } = setup();
    for (const url of ["http://127.0.0.1/", "http://esempio.test:8080/", "http://u:p@esempio.test/"]) {
      await expect(codeOf(safeRequest(new URL(url)))).resolves.not.toBe("ok");
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it("refuses a name that resolves to a private IP", async () => {
    const { safeRequest, mapAddress } = setup();
    await expect(codeOf(safeRequest(new URL("http://interno.test/")))).resolves.toBe("not_public");
    expect(mapAddress).not.toHaveBeenCalled();
  });

  it("reports a refused connection", async () => {
    const { safeRequest } = setup({ mapAddress: () => ({ host: "127.0.0.1", port: closedPort }) });
    await expect(codeOf(safeRequest(new URL("http://esempio.test/")))).resolves.toBe("connection_refused");
  });
});

describe("redirects", () => {
  function redirectingTo(location: string, status = 302) {
    handler = (req, res) => {
      if (req.url === "/") {
        res.writeHead(status, { location });
        res.end();
      } else {
        res.end(`final ${req.url}`);
      }
    };
  }

  it("follows a relative Location and records the chain", async () => {
    redirectingTo("/fine");
    const { safeRequest } = setup();
    const response = await safeRequest(new URL("http://esempio.test/"));
    expect(response.url.href).toBe("http://esempio.test/fine");
    expect(response.redirects.map(String)).toEqual(["http://esempio.test/"]);
    expect(response.body.toString()).toBe("final /fine");
  });

  it("returns the 3xx untouched when asked not to follow", async () => {
    redirectingTo("https://esempio.test/", 301);
    const { safeRequest } = setup();
    const response = await safeRequest(new URL("http://esempio.test/"), { followRedirects: false });
    expect(response.status).toBe(301);
    expect(response.headers.location).toBe("https://esempio.test/");
    expect(response.redirects).toEqual([]);
  });

  it("returns a 3xx without Location as it is", async () => {
    handler = (_req, res) => {
      res.writeHead(302);
      res.end();
    };
    const { safeRequest } = setup();
    await expect(safeRequest(new URL("http://esempio.test/"))).resolves.toMatchObject({ status: 302 });
  });

  it.each([
    ["http://10.0.0.1/", "not_public"],
    ["http://[::1]/", "not_public"],
    ["http://2130706433/", "not_public"],
    ["http://interno.test/", "not_public"],
    ["http://esempio.test:8080/", "not_allowed"],
    ["http://user:pw@esempio.test/", "not_allowed"],
    ["file:///etc/passwd", "not_allowed"],
    ["ftp://esempio.test/", "not_allowed"],
  ])("blocks a redirect to %s", async (location, code) => {
    redirectingTo(location);
    const { safeRequest } = setup();
    await expect(codeOf(safeRequest(new URL("http://esempio.test/")))).resolves.toBe(code);
  });

  it("re-resolves a new host and blocks it when it now points inside", async () => {
    redirectingTo("http://www.esempio.test/");
    const resolve = vi.fn(async (hostname: string) =>
      hostname === "esempio.test" ? [{ address: "8.8.8.8", family: 4 }] : [{ address: "10.0.0.5", family: 4 }],
    );
    const { safeRequest } = setup({ resolve });
    await expect(codeOf(safeRequest(new URL("http://esempio.test/")))).resolves.toBe("not_public");
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("follows 5 redirects and stops at the 6th", async () => {
    let redirectCount = 5;
    handler = (req, res) => {
      const step = Number(req.url?.slice(1) || 0);
      if (step < redirectCount) {
        res.writeHead(302, { location: `/${step + 1}` });
        res.end();
      } else {
        res.end(`step ${step}`);
      }
    };
    await expect(setup().safeRequest(new URL("http://esempio.test/"))).resolves.toMatchObject({ status: 200 });
    redirectCount = 6;
    await expect(codeOf(setup().safeRequest(new URL("http://esempio.test/")))).resolves.toBe("too_many_redirects");
  });

  it("stops a redirect loop", async () => {
    handler = (req, res) => {
      res.writeHead(302, { location: req.url === "/a" ? "/b" : "/a" });
      res.end();
    };
    await expect(codeOf(setup().safeRequest(new URL("http://esempio.test/a")))).resolves.toBe("too_many_redirects");
  });
});

describe("timeouts", () => {
  it("gives up on a server that never answers", async () => {
    handler = () => {};
    const { safeRequest } = setup({ timeoutMs: 200 });
    await expect(codeOf(safeRequest(new URL("http://esempio.test/")))).resolves.toBe("timeout");
  });

  it("gives up on a body that never ends", async () => {
    handler = (_req, res) => {
      res.writeHead(200);
      res.write("a");
    };
    const { safeRequest } = setup({ timeoutMs: 200 });
    await expect(codeOf(safeRequest(new URL("http://esempio.test/")))).resolves.toBe("timeout");
  });

  it("counts the whole response, not the pause between bytes", async () => {
    handler = (_req, res) => {
      const timer = setInterval(() => res.write("a"), 50);
      res.on("close", () => clearInterval(timer));
    };
    const { safeRequest } = setup({ timeoutMs: 300 });
    await expect(codeOf(safeRequest(new URL("http://esempio.test/")))).resolves.toBe("timeout");
  });

  it("stops at the scan deadline", async () => {
    handler = () => {};
    const { safeRequest } = setup({ timeoutMs: 10_000 });
    const error = await safeRequest(new URL("http://esempio.test/"), { signal: AbortSignal.timeout(150) }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(SafeRequestError);
    expect(error).toMatchObject({ code: "timeout", message: "scan deadline reached" });
  });
});

describe("size limit", () => {
  it("accepts a body of exactly 2 MB", async () => {
    handler = (_req, res) => res.end(Buffer.alloc(2 * MB));
    const response = await setup().safeRequest(new URL("http://esempio.test/"));
    expect(response.body.length).toBe(2 * MB);
  });

  it("refuses a declared length over 2 MB without reading it", async () => {
    const closed = new Promise<void>((resolve) => {
      handler = (_req, res) => {
        res.on("close", () => resolve());
        res.writeHead(200, { "content-length": 3 * MB });
        res.write(Buffer.alloc(64 * 1024));
      };
    });
    await expect(codeOf(setup().safeRequest(new URL("http://esempio.test/")))).resolves.toBe("too_large");
    await closed;
  });

  it("stops reading an undeclared body past 2 MB", async () => {
    const TOTAL = 50 * MB;
    let sent = 0;
    const closed = new Promise<void>((resolve) => {
      handler = (_req, res) => {
        res.on("close", () => resolve());
        const chunk = Buffer.alloc(64 * 1024);
        const write = () => {
          while (sent < TOTAL && !res.destroyed) {
            sent += chunk.length;
            if (!res.write(chunk)) return void res.once("drain", write);
          }
          res.end();
        };
        write();
      };
    });
    await expect(codeOf(setup().safeRequest(new URL("http://esempio.test/")))).resolves.toBe("too_large");
    await closed;
    expect(sent).toBeLessThan(TOTAL);
  });

  it.each([
    ["gzip", zlib.gzipSync],
    ["deflate", zlib.deflateSync],
    ["br", zlib.brotliCompressSync],
  ] as const)("counts the decompressed size of a %s body", async (encoding, compress) => {
    const bomb = compress(Buffer.alloc(3 * MB));
    expect(bomb.length).toBeLessThan(10 * 1024);
    handler = (_req, res) => {
      res.writeHead(200, { "content-encoding": encoding, "content-length": bomb.length });
      res.end(bomb);
    };
    await expect(codeOf(setup().safeRequest(new URL("http://esempio.test/")))).resolves.toBe("too_large");
  });

  it("decompresses a body under the limit", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-encoding": "gzip" });
      res.end(zlib.gzipSync("<html>ciao</html>"));
    };
    const response = await setup().safeRequest(new URL("http://esempio.test/"));
    expect(response.body.toString()).toBe("<html>ciao</html>");
  });

  it("reports a corrupt compressed body", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-encoding": "gzip" });
      res.end("not gzip at all");
    };
    await expect(codeOf(setup().safeRequest(new URL("http://esempio.test/")))).resolves.toBe("bad_response");
  });

  it("reports an encoding it did not ask for", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-encoding": "zstd" });
      res.end("x");
    };
    await expect(codeOf(setup().safeRequest(new URL("http://esempio.test/")))).resolves.toBe("bad_response");
  });
});

describe("inspectCertificate", () => {
  it("reads the certificate from the verified IP, with the domain as SNI", async () => {
    const { inspectCertificate, mapAddress } = setup();
    const info = await inspectCertificate(new URL("http://esempio.test/menu"));
    expect(mapAddress).toHaveBeenCalledWith("8.8.8.8", 443);
    expect(info).toMatchObject({ address: "8.8.8.8", authorized: true, authorizationError: undefined });
    expect(info.validTo.getUTCFullYear()).toBe(2126);
    expect(info.subjectAltNames).toEqual(["DNS:esempio.test"]);
  });

  it("still reads a certificate the system does not trust", async () => {
    const info = await setup({ ca: undefined }).inspectCertificate(new URL("https://esempio.test/"));
    expect(info).toMatchObject({ authorized: false, authorizationError: "DEPTH_ZERO_SELF_SIGNED_CERT" });
    expect(info.validTo.getUTCFullYear()).toBe(2126);
  });

  it("still reads a certificate issued for another name", async () => {
    const info = await setup().inspectCertificate(new URL("https://www.esempio.test/"));
    expect(info).toMatchObject({ authorized: false, authorizationError: "ERR_TLS_CERT_ALTNAME_INVALID" });
  });

  it("applies the same address checks as a request", async () => {
    const { inspectCertificate, mapAddress } = setup();
    await expect(codeOf(inspectCertificate(new URL("https://interno.test/")))).resolves.toBe("not_public");
    await expect(codeOf(inspectCertificate(new URL("https://localhost/")))).resolves.toBe("not_public");
    expect(mapAddress).not.toHaveBeenCalled();
  });

  it("never lets Node resolve a name a second time", async () => {
    const { inspectCertificate } = setup({ mapAddress: () => ({ host: "localhost", port: httpsPort }) });
    await expect(codeOf(inspectCertificate(new URL("https://esempio.test/")))).resolves.toBe("connection_failed");
  });

  it("gives up on a server that never completes the handshake", async () => {
    const silent = net.createServer(() => {}).listen(0, "127.0.0.1");
    await once(silent, "listening");
    const port = (silent.address() as AddressInfo).port;
    const { inspectCertificate } = setup({ timeoutMs: 200, mapAddress: () => ({ host: "127.0.0.1", port }) });
    await expect(codeOf(inspectCertificate(new URL("https://esempio.test/")))).resolves.toBe("timeout");
    silent.close();
  });

  it("reports a refused connection", async () => {
    const { inspectCertificate } = setup({ mapAddress: () => ({ host: "127.0.0.1", port: closedPort }) });
    await expect(codeOf(inspectCertificate(new URL("https://esempio.test/")))).resolves.toBe("connection_refused");
  });
});
