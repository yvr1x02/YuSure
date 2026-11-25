import { once } from "node:events";
import http, { type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import tls from "node:tls";
import zlib from "node:zlib";

import { SafeRequestError } from "./errors";
import { resolvePublic, type Resolver } from "./resolve";
import { checkUrl } from "./url";

export const USER_AGENT = "YuSureBot/1.0 (+https://yusure.vercel.app/come-funziona)";
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type SafeRequestDeps = {
  resolve: Resolver;
  /** Where the TCP connection for a verified IP goes: identity in production, local servers in tests. */
  mapAddress: (ip: string, port: number) => { host: string; port: number };
  timeoutMs: number;
  maxBytes: number;
  /** Tests only: trust the fixture certificate instead of the system CAs. */
  ca?: string;
};

export type SafeResponse = {
  /** The URL that produced this response, after any redirects. */
  url: URL;
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  /** The verified IP the connection went to. */
  address: string;
  /** URLs left behind by redirects, in order. */
  redirects: URL[];
};

export type SafeRequestOptions = {
  /** false returns a 3xx as it is: the HTTP-to-HTTPS check reads it hop by hop. */
  followRedirects?: boolean;
  /** The scan-wide deadline: aborting it ends with "scan_deadline". */
  signal?: AbortSignal;
};

// The IP is already verified: a second resolution is exactly what DNS rebinding needs.
const refuseLookup: LookupFunction = (hostname, _options, callback) => {
  callback(new Error(`refused DNS lookup of ${hostname}: connection must use the verified IP`), "", 0);
};

/** Internal to src/lib/safe-request: the rest of the code uses the bound functions in index.ts. */
export function createSafeRequest(deps: SafeRequestDeps) {
  async function safeRequest(input: URL, options: SafeRequestOptions = {}): Promise<SafeResponse> {
    const { followRedirects = true, signal } = options;
    let url = new URL(input);
    url.hash = "";
    const redirects: URL[] = [];

    for (;;) {
      const timeout = AbortSignal.timeout(deps.timeoutMs);
      const hopSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let response: Omit<SafeResponse, "url" | "redirects">;
      try {
        response = await hop(url, hopSignal);
      } catch (error) {
        throw classify(error, signal, timeout);
      }

      const location = response.headers.location;
      if (!followRedirects || !REDIRECT_STATUSES.has(response.status) || !location) {
        return { ...response, url, redirects };
      }
      if (redirects.length === MAX_REDIRECTS) {
        throw new SafeRequestError("too_many_redirects", `more than ${MAX_REDIRECTS} redirects`);
      }
      redirects.push(url);
      try {
        url = new URL(location, url);
      } catch {
        throw new SafeRequestError("invalid_url", "unparsable Location header");
      }
      url.hash = "";
    }
  }

  async function hop(url: URL, signal: AbortSignal) {
    checkUrl(url);
    const address = await abortable(resolvePublic(url.hostname, deps.resolve), signal);
    const isHttps = url.protocol === "https:";
    const target = deps.mapAddress(address, isHttps ? 443 : 80);

    const request = (isHttps ? https : http).request({
      host: target.host,
      port: target.port,
      method: "GET",
      path: url.pathname + url.search,
      headers: {
        host: url.host,
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-encoding": "gzip, deflate, br",
      },
      lookup: refuseLookup,
      agent: false,
      signal,
      // Connecting to an IP: SNI and certificate check need the name, set explicitly.
      ...(isHttps && { servername: url.hostname, ca: deps.ca }),
    });

    try {
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        request.once("response", resolve);
        request.once("error", reject);
        request.end();
      });
      const body = await readBody(response);
      return { status: response.statusCode ?? 0, headers: response.headers, body, address };
    } finally {
      request.destroy();
    }
  }

  async function readBody(response: IncomingMessage): Promise<Buffer> {
    const declared = Number(response.headers["content-length"]);
    if (declared > deps.maxBytes) {
      throw new SafeRequestError("too_large", `content-length ${declared}`);
    }

    const encoding = (response.headers["content-encoding"] ?? "identity").trim().toLowerCase();
    const decoder = createDecoder(encoding);
    if (decoder === undefined) {
      throw new SafeRequestError("bad_response", `unsupported content-encoding ${encoding}`);
    }
    let decoderFailed = false;
    decoder?.once("error", () => (decoderFailed = true));

    const chunks: Buffer[] = [];
    const collect = async (source: AsyncIterable<Buffer>) => {
      for await (const chunk of source) chunks.push(chunk);
    };
    try {
      await (decoder
        ? pipeline(response, sizeLimit("compressed"), decoder, sizeLimit("decompressed"), collect)
        : pipeline(response, sizeLimit("raw"), collect));
    } catch (error) {
      if (decoderFailed && !(error instanceof SafeRequestError)) {
        throw new SafeRequestError("bad_response", `${encoding} decoding failed`);
      }
      throw error;
    }
    return Buffer.concat(chunks);
  }

  // Counts bytes as they pass and stops the stream over the limit, so nothing bigger is buffered.
  function sizeLimit(what: string) {
    let total = 0;
    return new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        total += chunk.length;
        if (total > deps.maxBytes) {
          callback(new SafeRequestError("too_large", `${what} body over ${deps.maxBytes} bytes`));
        } else {
          callback(null, chunk);
        }
      },
    });
  }

  function classify(error: unknown, scanSignal: AbortSignal | undefined, timeout: AbortSignal) {
    if (error instanceof SafeRequestError) return error;
    if (scanSignal?.aborted) return new SafeRequestError("scan_deadline", "scan deadline reached");
    if (timeout.aborted) return new SafeRequestError("timeout", `no complete response in ${deps.timeoutMs} ms`);
    const code = (error as NodeJS.ErrnoException).code ?? "";
    if (code === "ECONNREFUSED") return new SafeRequestError("connection_refused", code);
    if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO/.test(code)) return new SafeRequestError("tls_error", code);
    return new SafeRequestError("connection_failed", code || String(error));
  }

  /**
   * Opens a TLS connection to the verified IP on 443 just to read the certificate,
   * with the same checks as safeRequest. An invalid certificate is a result, not an error.
   */
  async function inspectCertificate(input: URL, options: Pick<SafeRequestOptions, "signal"> = {}) {
    const url = new URL(`https://${input.hostname}/`);
    const timeout = AbortSignal.timeout(deps.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let socket: tls.TLSSocket | undefined;
    try {
      checkUrl(url);
      const address = await abortable(resolvePublic(url.hostname, deps.resolve), signal);
      const target = deps.mapAddress(address, 443);
      socket = tls.connect({
        host: target.host,
        port: target.port,
        servername: url.hostname,
        ca: deps.ca,
        rejectUnauthorized: false,
        lookup: refuseLookup,
      });
      await once(socket, "secureConnect", { signal });

      const certificate = socket.getPeerCertificate();
      if (!certificate.valid_to) throw new SafeRequestError("bad_response", "no certificate presented");
      return {
        address,
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ? String(socket.authorizationError) : undefined,
        validFrom: new Date(certificate.valid_from),
        validTo: new Date(certificate.valid_to),
        issuer: certificate.issuer?.O ?? certificate.issuer?.CN,
        subjectAltNames: certificate.subjectaltname?.split(", ") ?? [],
      };
    } catch (error) {
      throw classify(error, options.signal, timeout);
    } finally {
      socket?.destroy();
    }
  }

  return { safeRequest, inspectCertificate };
}

export type CertificateInfo = Awaited<ReturnType<ReturnType<typeof createSafeRequest>["inspectCertificate"]>>;

/** null: no decoding needed; undefined: an encoding we did not ask for. */
function createDecoder(encoding: string) {
  if (encoding === "identity") return null;
  if (encoding === "gzip" || encoding === "x-gzip") return zlib.createGunzip();
  if (encoding === "deflate") return zlib.createInflate();
  if (encoding === "br") return zlib.createBrotliDecompress();
  return undefined;
}

// dns.lookup takes no AbortSignal: stop waiting on it when the request times out.
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
