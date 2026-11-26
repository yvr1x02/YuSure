import { describe, expect, it } from "vitest";

import { CLIENT_RENDERED_MAX_TEXT, isClientRendered, metaCsp, parseHtml, visibleText } from "./html";
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

const html = (body: string) => response("text/html; charset=utf-8", Buffer.from(body));

describe("isClientRendered", () => {
  const page = (body: string, head = "<title>Trattoria da Mario</title>") =>
    parseHtml(html(`<!doctype html><html lang="it"><head>${head}</head><body>${body}</body></html>`))!;
  const words = (n: number) => Array.from({ length: n }, (_, i) => `parola${i}`).join(" ");

  it.each([
    ["React CSR (Vite)", '<div id="root"></div><script type="module" src="/assets/index-3f2a.js"></script>'],
    [
      "React CSR (Create React App, with <noscript>)",
      '<noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div><script src="/static/js/main.js"></script>',
    ],
    ["Vue CSR with a spinner without text", '<div id="app"><div class="spinner"></div></div><script src="/js/app.js"></script>'],
    ["Angular", "<app-root></app-root><script src=\"main.js\" type=\"module\"></script>"],
    [
      "CSR with a short footer of its own",
      '<div id="root"></div><footer>© 2026 Trattoria da Mario, via Roma 1, Milano</footer><script src="/app.js"></script>',
    ],
  ])("recognises %s", (_name, body) => {
    expect(isClientRendered(page(body))).toBe(true);
  });

  it.each([
    [
      "Next.js with SSR",
      `<div id="__next"><header><h1>Trattoria da Mario</h1></header><main><p>${words(80)}</p></main></div><script id="__NEXT_DATA__" type="application/json">{}</script><script src="/_next/static/chunks/main.js"></script>`,
    ],
    ["a static page", `<h1>Trattoria da Mario</h1><p>${words(80)}</p>`],
    ["a short static page with no app container", "<h1>Chiuso per ferie</h1><p>Torniamo a settembre.</p>"],
    ["an empty #root without scripts", '<div id="root"></div><p>Pagina in allestimento.</p>'],
    [
      "a server page with an empty widget container",
      `<h1>Trattoria da Mario</h1><p>${words(60)}</p><div id="app"></div><script src="/widget.js"></script>`,
    ],
  ])("does not flag %s", (_name, body) => {
    expect(isClientRendered(page(body))).toBe(false);
  });

  it("puts the threshold at CLIENT_RENDERED_MAX_TEXT characters of visible text", () => {
    const withText = (length: number) =>
      page(`<div id="root"></div><p>${"a".repeat(length)}</p><script src="/app.js"></script>`);
    expect(isClientRendered(withText(CLIENT_RENDERED_MAX_TEXT - 1))).toBe(true);
    expect(isClientRendered(withText(CLIENT_RENDERED_MAX_TEXT))).toBe(false);
  });
});

describe("visibleText", () => {
  it("leaves out scripts, styles, <noscript> and <template>, and collapses spaces", () => {
    const $ = parseHtml(
      html(
        "<html><body><p>Menu\n\n del  giorno</p><script>var a = 1</script><style>p{}</style><noscript>Attiva JavaScript</noscript><template><p>nascosto</p></template></body></html>",
      ),
    )!;
    expect(visibleText($)).toBe("Menu del giorno");
  });
});
