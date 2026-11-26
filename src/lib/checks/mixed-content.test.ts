import { describe, expect, it } from "vitest";

import { evaluateMixedContent } from "./mixed-content";
import { testPage } from "./test-page";

const html = (body: string, head = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const evaluate = (body: string, head = "", headers = {}) => evaluateMixedContent(testPage(headers, html(body, head)));

describe("evaluateMixedContent", () => {
  it("is ok when every resource is https, relative or protocol-relative", () => {
    const result = evaluate(
      '<img src="/logo.png"><img src="//cdn.esempio.it/a.png"><script src="https://cdn.esempio.it/a.js"></script>',
      '<link rel="stylesheet" href="style.css">',
    );
    expect(result).toEqual({ id: "mixedContent", outcome: "ok", found: ["Nessuna risorsa da http://"] });
  });

  it("ignores links: following a link loads nothing into the page", () => {
    expect(evaluate('<a href="http://altro.it/">altro</a>').outcome).toBe("ok");
  });

  it.each([
    ['<script src="http://cdn.esempio.it/a.js"></script>', "<script> http://cdn.esempio.it/a.js"],
    ['<link rel="Stylesheet" href="http://cdn.esempio.it/a.css">', "<link> http://cdn.esempio.it/a.css"],
    ['<iframe src="http://mappe.esempio.it/"></iframe>', "<iframe> http://mappe.esempio.it/"],
  ])("is a problem for a blockable resource: %s", (tag, line) => {
    expect(evaluate(tag)).toMatchObject({ outcome: "problem", found: [line] });
  });

  it.each([
    ['<img src="http://esempio.it/foto.jpg">', "<img> http://esempio.it/foto.jpg"],
    ['<img srcset="https://esempio.it/a.jpg 1x, http://esempio.it/b.jpg 2x">', "<img> http://esempio.it/b.jpg"],
    ['<video src="http://esempio.it/v.mp4"></video>', "<video> http://esempio.it/v.mp4"],
    ['<link rel="icon" href="http://esempio.it/favicon.ico">', "<link> http://esempio.it/favicon.ico"],
  ])("is a warning for an image, video or icon only: %s", (tag, line) => {
    expect(evaluate(tag)).toMatchObject({ outcome: "warning", found: [line] });
  });

  it("is a problem when blockable and upgradable resources are both there, listing the blockable first", () => {
    const result = evaluate('<img src="http://esempio.it/a.jpg"><script src="http://esempio.it/a.js"></script>');
    expect(result).toMatchObject({ outcome: "problem", found: ["<script> http://esempio.it/a.js", "<img> http://esempio.it/a.jpg"] });
  });

  it("resolves relative addresses against an http <base>", () => {
    expect(evaluate('<script src="a.js"></script>', '<base href="http://esempio.it/">')).toMatchObject({
      outcome: "problem",
      found: ["<script> http://esempio.it/a.js"],
    });
  });

  it("ignores what is inside <noscript>, which browsers with scripts do not load", () => {
    expect(evaluate('<noscript><img src="http://esempio.it/pixel.gif"></noscript>').outcome).toBe("ok");
  });

  it("lists 10 resources at most, counting the rest", () => {
    const images = Array.from({ length: 12 }, (_, i) => `<img src="http://esempio.it/${i}.jpg">`).join("");
    const result = evaluate(images);
    expect(result.found).toHaveLength(11);
    expect(result.found.at(-1)).toBe("…e altre 2");
  });

  it.each([
    ["header", "", { "content-security-policy": "upgrade-insecure-requests" }],
    ["meta", '<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">', {}],
  ])("is ok with upgrade-insecure-requests in the %s, still listing the resources", (_where, head, headers) => {
    const result = evaluate('<script src="http://esempio.it/a.js"></script>', head, headers);
    expect(result).toMatchObject({
      outcome: "ok",
      found: ["upgrade-insecure-requests: il browser le chiede in https", "<script> http://esempio.it/a.js"],
    });
  });

  it("is unverified on a page that is not HTML", () => {
    const result = evaluateMixedContent(testPage({ "content-type": "application/pdf" }, "%PDF-1.7"));
    expect(result).toEqual({
      id: "mixedContent",
      outcome: "unverified",
      reason: "not_html",
      found: ["Content-Type: application/pdf"],
    });
  });

  it("is unverified on a page read over http", () => {
    const page = testPage({}, html('<script src="http://esempio.it/a.js"></script>'), "http://esempio.it/");
    expect(evaluateMixedContent(page)).toMatchObject({ outcome: "unverified", reason: "read_over_http" });
  });
});
