import type { CheerioAPI, Selection } from "./html";
import { htmlCheck, type Page } from "./page";
import type { CheckResult } from "./result";

/*
 * Accessibility from the HTML (SPEC, "Accessibilità"): content checks, so unverified when
 * the browser builds the page. Lighthouse adds contrast and the rest in M5.
 */

const MAX_LISTED = 10;
// Images and links: 1–2 missing is a warning, from 3 a problem (decided in M4).
const PROBLEM_FROM = 3;
const NOT_FIELDS = new Set(["hidden", "submit", "button", "reset", "image"]);

const clean = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

/** Hidden from assistive technology on purpose: nothing to name. */
function hidden(node: Selection): boolean {
  return node.closest('[aria-hidden="true"]').length > 0;
}

/** aria-label, or the text of the elements aria-labelledby points to. */
function ariaName($: CheerioAPI, node: Selection): string {
  const label = clean(node.attr("aria-label"));
  if (label) return label;
  const ids = clean(node.attr("aria-labelledby")).split(" ").filter(Boolean);
  return clean(ids.map((id) => $("[id]").filter((_, other) => $(other).attr("id") === id).text()).join(" "));
}

/** "<tag attr="…">" for the technical details: enough to find the element in the page. */
function describe(node: Selection, attributes: string[]): string {
  const tag = String(node.prop("tagName") ?? "").toLowerCase();
  const shown = attributes
    .map((name) => [name, node.attr(name)] as const)
    .filter(([, value]) => value)
    .map(([name, value]) => ` ${name}="${value!.length > 80 ? `${value!.slice(0, 77)}…` : value}"`);
  return `<${tag}${shown.join("")}>`;
}

function counted(id: "imageAlt" | "accessibleNames", missing: string[], total: number, allNamed: string): CheckResult {
  if (missing.length === 0) return { id, outcome: "ok", found: [allNamed] };
  const found = missing.slice(0, MAX_LISTED);
  if (missing.length > MAX_LISTED) found.push(`…e altri ${missing.length - MAX_LISTED}`);
  return { id, outcome: missing.length >= PROBLEM_FROM ? "problem" : "warning", found: [`${missing.length} su ${total}`, ...found] };
}

export function evaluateImageAlt(page: Page): CheckResult {
  return htmlCheck(
    "imageAlt",
    page,
    ($) => {
      // alt="" is right for decoration; role presentation/none says the same.
      const images = $("img").filter((_, el) => !hidden($(el)) && !["presentation", "none"].includes($(el).attr("role") ?? ""));
      const missing = images.filter((_, el) => $(el).attr("alt") === undefined).map((_, el) => describe($(el), ["src"])).get();
      return counted("imageAlt", missing, images.length, `Immagini: ${images.length}, tutte con alt`);
    },
    { content: true },
  );
}

export function evaluateFormLabels(page: Page): CheckResult {
  return htmlCheck(
    "formLabels",
    page,
    ($) => {
      const fields = $("input, select, textarea").filter(
        (_, el) => !hidden($(el)) && !NOT_FIELDS.has(($(el).attr("type") ?? "text").toLowerCase()),
      );
      const labelled = (field: Selection) => {
        const id = field.attr("id");
        const forLabel = id ? $("label[for]").filter((_, label) => $(label).attr("for") === id) : $([]);
        return !!(ariaName($, field) || clean(field.attr("title")) || clean(forLabel.text()) || clean(field.closest("label").text()));
      };
      const missing = fields
        .filter((_, el) => !labelled($(el)))
        .map((_, el) => describe($(el), ["type", "name", "id", "placeholder"]))
        .get();
      if (fields.length === 0) return { id: "formLabels", outcome: "ok", found: ["Nessun campo nella pagina"] };
      if (missing.length === 0) return { id: "formLabels", outcome: "ok", found: [`Campi: ${fields.length}, tutti con un'etichetta`] };
      // Even one field without a label is a problem: whoever cannot see it cannot fill in the form (decided in M4).
      const found = missing.slice(0, MAX_LISTED);
      if (missing.length > MAX_LISTED) found.push(`…e altri ${missing.length - MAX_LISTED}`);
      return { id: "formLabels", outcome: "problem", found: [`${missing.length} su ${fields.length}`, ...found] };
    },
    { content: true },
  );
}

export function evaluateAccessibleNames(page: Page): CheckResult {
  return htmlCheck(
    "accessibleNames",
    page,
    ($) => {
      const controls = $('a[href], button, [role="button"]').filter((_, el) => !hidden($(el)));
      const named = (control: Selection) =>
        !!(
          clean(control.text()) ||
          ariaName($, control) ||
          clean(control.attr("title")) ||
          control.find("img[alt]").filter((_, img) => !!clean($(img).attr("alt"))).length > 0 ||
          clean(control.find("svg title").text())
        );
      const missing = controls.filter((_, el) => !named($(el))).map((_, el) => describe($(el), ["href", "class"])).get();
      return counted("accessibleNames", missing, controls.length, `Link e pulsanti: ${controls.length}, tutti con un nome`);
    },
    { content: true },
  );
}
