import type { IncomingHttpHeaders } from "node:http";

import { parseHtml } from "./html";
import type { Page } from "./page";

/** A page as runScan would hand it to the checks, for tests only. */
export function testPage(
  headers: IncomingHttpHeaders = {},
  body = "<!doctype html><html><head></head><body></body></html>",
  url = "https://esempio.it/",
): Page {
  const response = {
    url: new URL(url),
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
    body: Buffer.from(body),
    address: "8.8.8.8",
    redirects: [],
  };
  return { response, overHttp: response.url.protocol === "http:", html: parseHtml(response) };
}
