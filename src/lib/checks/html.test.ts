import { describe, expect, it } from "vitest";

import { metaCsp, parseHtml } from "./html";
import { testPage } from "./test-page";

const response = (contentType: string | undefined, body: Buffer) => ({
  ...testPage().response,
  headers: contentType ? { "content-type": contentType } : {},
  body,
});

describe("parseHtml", () => {
  it.each(["text/html", "text/html; charset=utf-8", "application/xhtml+xml", undefined])("parses %s", (type) => {
    expect(parseHtml(response(type, Buffer.from("<title>Menù</title>")))?.("title").text()).toBe("Menù");
  });

  it.each(["application/json", "image/png", "text/plain"])("skips %s", (type) => {
    expect(parseHtml(response(type, Buffer.from("<title>x</title>")))).toBeUndefined();
  });

  it("decodes with the charset the server declares", () => {
    const latin1 = Buffer.from("<title>Caffè</title>", "latin1");
    expect(parseHtml(response("text/html; charset=ISO-8859-1", latin1))?.("title").text()).toBe("Caffè");
  });

  it("decodes with the charset of a <meta> when the server declares none", () => {
    const latin1 = Buffer.from('<meta charset="windows-1252"><title>Caffè</title>', "latin1");
    expect(parseHtml(response("text/html", latin1))?.("title").text()).toBe("Caffè");
  });
});

describe("metaCsp", () => {
  it("reads every policy in a <meta http-equiv>, in any case", () => {
    const $ = parseHtml(
      response(
        "text/html",
        Buffer.from(
          '<meta http-equiv="content-security-policy" content="default-src \'self\'"><meta http-equiv="Content-Security-Policy" content=" img-src *">',
        ),
      ),
    );
    expect($ && metaCsp($)).toEqual(["default-src 'self'", "img-src *"]);
  });

  it("ignores other http-equiv tags and empty policies", () => {
    const $ = parseHtml(
      response("text/html", Buffer.from('<meta http-equiv="refresh" content="5"><meta http-equiv="Content-Security-Policy" content="">')),
    );
    expect($ && metaCsp($)).toEqual([]);
  });
});
