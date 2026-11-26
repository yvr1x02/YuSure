import { describe, expect, it } from "vitest";

import {
  evaluateCanonical,
  evaluateH1,
  evaluateLang,
  evaluateMetaDescription,
  evaluateNoindex,
  evaluateOpenGraph,
  evaluateStructuredData,
  evaluateTitle,
  evaluateViewport,
} from "./seo";
import { testPage } from "./test-page";

const html = (head: string, body = "<p>Benvenuti</p>", htmlAttributes = ' lang="it"') =>
  testPage({}, `<!doctype html><html${htmlAttributes}><head>${head}</head><body>${body}</body></html>`);
const csr = (head: string) => testPage({}, `<!doctype html><html><head>${head}</head><body><div id="root"></div><script src="/app.js"></script></body></html>`);

describe("evaluateTitle", () => {
  it.each([
    ["<title>Trattoria da Mario – Roma</title>", "ok", undefined],
    ["<title>  Trattoria\n da Mario </title>", "ok", undefined],
    ["<title>Mario</title>", "warning", "short"],
    [`<title>${"a".repeat(61)}</title>`, "warning", "long"],
    [`<title>${"a".repeat(60)}</title>`, "ok", undefined],
    ["<title>   </title>", "problem", undefined],
    ["", "problem", undefined],
  ])("%s → %s %s", (head, outcome, variant) => {
    const result = evaluateTitle(html(head));
    expect(result).toMatchObject({ id: "title", outcome });
    expect(result.variant).toBe(variant);
  });

  it("counts characters, not UTF-16 units, and says how many", () => {
    const result = evaluateTitle(html(`<title>${"🍕".repeat(9)}</title>`));
    expect(result).toMatchObject({ variant: "short", values: { length: "9" } });
    expect(result.found).toEqual([`<title>: "${"🍕".repeat(9)}" (9 caratteri)`]);
  });

  it("ignores the <title> of an SVG in the body", () => {
    expect(evaluateTitle(html("", "<svg><title>Icona</title></svg>")).outcome).toBe("problem");
  });

  it("still reads the head of a page built in the browser", () => {
    expect(evaluateTitle(csr("<title>Trattoria da Mario – Roma</title>")).outcome).toBe("ok");
  });

  it("is unverified when the address is not a web page", () => {
    const pdf = testPage({ "content-type": "application/pdf" }, "%PDF-1.7");
    expect(evaluateTitle(pdf)).toMatchObject({ outcome: "unverified", reason: "not_html" });
  });
});

describe("evaluateMetaDescription", () => {
  const description = (text: string) => html(`<meta name="Description" content="${text}">`);

  it.each([
    [description("a".repeat(50)), "ok", undefined],
    [description("a".repeat(160)), "ok", undefined],
    [description("a".repeat(49)), "warning", "short"],
    [description("a".repeat(161)), "warning", "long"],
    [description("  "), "warning", "missing"],
    [html(""), "warning", "missing"],
  ])("case %# → %s %s", (page, outcome, variant) => {
    expect(evaluateMetaDescription(page)).toMatchObject({ outcome, ...(variant && { variant }) });
  });
});

describe("evaluateViewport", () => {
  it("passes with a viewport, whatever its spelling", () => {
    expect(evaluateViewport(html('<meta name="VIEWPORT" content="width=device-width, initial-scale=1">'))).toMatchObject({
      outcome: "ok",
      found: ["viewport: width=device-width, initial-scale=1"],
    });
  });

  it("is a problem without one", () => {
    expect(evaluateViewport(html("")).outcome).toBe("problem");
  });
});

describe("evaluateLang", () => {
  it.each([
    [' lang="it"', "ok"],
    [' lang="it-IT"', "ok"],
    [' lang=" "', "warning"],
    ["", "warning"],
  ])("<html%s> → %s", (attributes, outcome) => {
    expect(evaluateLang(html("", undefined, attributes)).outcome).toBe(outcome);
  });
});

describe("evaluateH1", () => {
  it.each([
    ["<h1>Trattoria da Mario</h1>", "ok", undefined],
    ["<p>Niente titoli</p>", "warning", "none"],
    ["<h1>Uno</h1><h1>Due</h1><h1>Tre</h1>", "warning", "many"],
  ])("%s → %s %s", (body, outcome, variant) => {
    const result = evaluateH1(html("", body));
    expect(result.outcome).toBe(outcome);
    expect(result.variant).toBe(variant);
  });

  it("reads a line break as a space in the details", () => {
    expect(evaluateH1(html("", "<h1>Autunno<br/>2026</h1>")).found).toEqual(['<h1>: "Autunno 2026"']);
  });

  it("says how many headings there are", () => {
    expect(evaluateH1(html("", "<h1>Uno</h1><h1>Due</h1>")).values).toEqual({ count: "2" });
  });

  it("is unverified on a page built in the browser", () => {
    expect(evaluateH1(csr(""))).toMatchObject({ outcome: "unverified", reason: "client_rendered" });
  });
});

describe("evaluateOpenGraph", () => {
  const og = (tags: string[]) => html(tags.map((t) => `<meta property="${t}" content="x">`).join(""));

  it("passes with title, description and image", () => {
    expect(evaluateOpenGraph(og(["og:title", "og:description", "og:image"])).outcome).toBe("ok");
  });

  it("accepts name= as well as property=", () => {
    const page = html('<meta name="og:title" content="x"><meta name="og:description" content="x"><meta name="og:image" content="x">');
    expect(evaluateOpenGraph(page).outcome).toBe("ok");
  });

  it("lists what is missing", () => {
    expect(evaluateOpenGraph(og(["og:title"]))).toMatchObject({
      outcome: "warning",
      found: ["og:title: presente", "og:description: assente", "og:image: assente"],
    });
  });
});

describe("evaluateCanonical", () => {
  it.each([
    ['<link rel="canonical" href="https://esempio.it/">', "ok"],
    ['<link rel="Canonical alternate" href="/menu">', "ok"],
    ['<link rel="canonical" href="">', "warning"],
    ['<link rel="alternate" href="/en">', "warning"],
  ])("%s → %s", (head, outcome) => {
    expect(evaluateCanonical(html(head)).outcome).toBe(outcome);
  });
});

describe("evaluateStructuredData", () => {
  const ld = (json: string) => html(`<script type="application/ld+json">${json}</script>`);

  it("reads the types, also inside @graph and arrays", () => {
    const result = evaluateStructuredData(ld('{"@context":"https://schema.org","@graph":[{"@type":"Restaurant"},{"@type":["WebSite","Thing"]}]}'));
    expect(result).toMatchObject({ outcome: "ok", found: ["JSON-LD: Restaurant, WebSite, Thing"] });
  });

  it("passes when at least one block is readable", () => {
    const page = html('<script type="application/ld+json">{oops</script><script type="application/ld+json">{"@type":"Restaurant"}</script>');
    expect(evaluateStructuredData(page).outcome).toBe("ok");
  });

  it("warns when the blocks cannot be read", () => {
    expect(evaluateStructuredData(ld("{oops"))).toMatchObject({ outcome: "warning", variant: "invalid" });
  });

  it("warns when there are none", () => {
    expect(evaluateStructuredData(html(""))).toMatchObject({ outcome: "warning", variant: "missing" });
  });
});

describe("evaluateNoindex", () => {
  const meta = (name: string, content: string) => html(`<meta name="${name}" content="${content}">`);

  it.each([
    [meta("robots", "noindex, follow")],
    [meta("ROBOTS", "NoIndex")],
    [meta("googlebot", "none")],
    [testPage({ "x-robots-tag": "noindex" })],
    [testPage({ "x-robots-tag": "googlebot: noindex, nofollow" })],
    [testPage({ "x-robots-tag": ["otherbot: nofollow", "none"] })],
  ])("case %# blocks indexing", (page) => {
    expect(evaluateNoindex(page).outcome).toBe("problem");
  });

  it.each([
    [html("")],
    [meta("robots", "index, follow")],
    [meta("bingbot", "noindex")],
    [testPage({ "x-robots-tag": "otherbot: noindex" })],
    [testPage({ "x-robots-tag": "unavailable_after: 25 Jun 2030 15:00:00 PST" })],
    [testPage({ "x-robots-tag": "max-snippet: 20, nofollow" })],
  ])("case %# lets Google index", (page) => {
    expect(evaluateNoindex(page).outcome).toBe("ok");
  });

  it("lists where noindex was found", () => {
    const page = testPage({ "x-robots-tag": "noindex" }, '<html><head><meta name="robots" content="noindex"></head></html>');
    expect(evaluateNoindex(page).found).toEqual(["X-Robots-Tag: noindex", '<meta name="robots" content="noindex">']);
  });

  it("still reads the header when the address is not a web page", () => {
    expect(evaluateNoindex(testPage({ "content-type": "application/pdf", "x-robots-tag": "noindex" }, "%PDF")).outcome).toBe("problem");
  });
});
