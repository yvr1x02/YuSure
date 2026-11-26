import { describe, expect, it } from "vitest";

import { evaluateAccessibleNames, evaluateFormLabels, evaluateImageAlt } from "./accessibility";
import { testPage } from "./test-page";

const body = (content: string) => testPage({}, `<!doctype html><html lang="it"><head></head><body><h1>Trattoria</h1>${content}</body></html>`);
const csr = testPage({}, '<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>');
const times = (n: number, html: string) => html.repeat(n);

describe("evaluateImageAlt", () => {
  it.each([
    [0, "ok"],
    [1, "warning"],
    [2, "warning"],
    [3, "problem"],
  ])("%i images without alt → %s", (missing, outcome) => {
    const page = body(times(missing, '<img src="/foto.jpg">') + '<img src="/logo.png" alt="Logo">');
    expect(evaluateImageAlt(page).outcome).toBe(outcome);
  });

  it("accepts alt=\"\" and hidden or presentational images as decoration", () => {
    const page = body('<img src="/a.png" alt=""><img src="/b.png" role="presentation"><img src="/c.png" role="none"><div aria-hidden="true"><img src="/d.png"></div>');
    expect(evaluateImageAlt(page)).toMatchObject({ outcome: "ok", found: ["Immagini: 1, tutte con alt"] });
  });

  it("says so when the page has no images, or no links and buttons", () => {
    expect(evaluateImageAlt(body("<p>Solo testo</p>")).found).toEqual(["Nessuna immagine nella pagina"]);
    expect(evaluateAccessibleNames(body("<p>Solo testo</p>")).found).toEqual(["Nessun link o pulsante nella pagina"]);
  });

  it("lists the images, at most 10, with a count", () => {
    const result = evaluateImageAlt(body(times(12, '<img src="/foto.jpg">')));
    expect(result.found[0]).toBe("12 su 12");
    expect(result.found).toHaveLength(12);
    expect(result.found[1]).toBe('<img src="/foto.jpg">');
    expect(result.found.at(-1)).toBe("…e altri 2");
  });

  it("is unverified on a page built in the browser", () => {
    expect(evaluateImageAlt(csr)).toMatchObject({ outcome: "unverified", reason: "client_rendered" });
  });
});

describe("evaluateFormLabels", () => {
  it.each([
    ['<label for="email">Email</label><input id="email" type="email">'],
    ['<label>Nome <input name="nome"></label>'],
    ['<input aria-label="Cerca" type="search">'],
    ['<span id="l">Data</span><input aria-labelledby="l" type="date">'],
    ['<input title="Telefono" type="tel">'],
    ['<label for="msg">Messaggio</label><textarea id="msg"></textarea>'],
    ['<label>Coperti <select><option>2</option></select></label>'],
  ])("passes a labelled field: %s", (field) => {
    expect(evaluateFormLabels(body(`<form>${field}</form>`)).outcome).toBe("ok");
  });

  it("is a problem with even one field without a label, placeholder or not", () => {
    const result = evaluateFormLabels(body('<form><label for="a">Nome</label><input id="a"><input type="email" name="email" placeholder="La tua email"></form>'));
    expect(result).toMatchObject({ outcome: "problem", found: ["1 su 2", '<input type="email" name="email" placeholder="La tua email">'] });
  });

  it("does not count buttons, hidden fields or fields hidden from assistive technology", () => {
    const page = body('<form><input type="hidden" name="t"><input type="submit"><input type="button" value="x"><input type="image" src="/go.png" alt="Vai"><div aria-hidden="true"><input></div></form>');
    expect(evaluateFormLabels(page)).toMatchObject({ outcome: "ok", found: ["Nessun campo nella pagina"] });
  });

  it("does not take an empty label or a label for another field", () => {
    const page = body('<label for="altro">Nome</label><label for="x"> </label><input id="x">');
    expect(evaluateFormLabels(page).outcome).toBe("problem");
  });

  it("is unverified on a page built in the browser", () => {
    expect(evaluateFormLabels(csr)).toMatchObject({ outcome: "unverified", reason: "client_rendered" });
  });
});

describe("evaluateAccessibleNames", () => {
  it.each([
    ['<a href="/menu">Menu</a>'],
    ['<a href="https://instagram.com/x" aria-label="Instagram"><svg></svg></a>'],
    ['<a href="/"><img src="/logo.png" alt="Trattoria da Mario"></a>'],
    ['<button title="Chiudi">×</button>'],
    ['<button><svg><title>Apri il menu</title></svg></button>'],
    ['<span id="n">Prenota</span><div role="button" aria-labelledby="n"></div>'],
  ])("passes a named control: %s", (control) => {
    expect(evaluateAccessibleNames(body(control)).outcome).toBe("ok");
  });

  it.each([
    [0, "ok"],
    [2, "warning"],
    [3, "problem"],
  ])("%i controls without a name → %s", (missing, outcome) => {
    const page = body(times(missing, '<a href="https://facebook.com/x" class="icon-fb"><i></i></a>') + '<a href="/menu">Menu</a>');
    expect(evaluateAccessibleNames(page).outcome).toBe(outcome);
  });

  it("ignores links without href, controls hidden from assistive technology and images with an empty alt", () => {
    const page = body('<a name="top"></a><div aria-hidden="true"><a href="/x"></a></div><a href="/y"><img src="/i.png" alt=""></a>');
    expect(evaluateAccessibleNames(page)).toMatchObject({ outcome: "warning", found: ["1 su 1", '<a href="/y">'] });
  });

  it("is unverified on a page built in the browser", () => {
    expect(evaluateAccessibleNames(csr)).toMatchObject({ outcome: "unverified", reason: "client_rendered" });
  });
});
