import type { ReactNode } from "react";

import {
  CHECKS,
  ERROR_MESSAGES,
  fillText,
  OUTCOME_LABELS,
  CATALOG_VERSION,
  READ_OVER_HTTP_NOTE,
  RECOMMENDED_LABEL,
  REPORT_TEXTS,
  SCORE_TEXTS,
  SECTION_LABELS,
  VERDICT_LABELS,
  type CheckDefinition,
  type Outcome,
  type Section,
} from "@/lib/checks/catalog";
import type { CheckResult } from "@/lib/checks/result";
import type { ScanReport as Report } from "@/lib/checks/scan";
import { isRecommended, SECTION_WEIGHTS, verdict, type Score, type Scores, type Unscored } from "@/lib/checks/score";

// Outcome is never colour alone: icon and word too (docs/DESIGN.md, WCAG 1.4.1).
const OUTCOME_STYLE: Record<Outcome, { icon: string; className: string }> = {
  ok: { icon: "✓", className: "text-status-ok border-solid" },
  warning: { icon: "!", className: "text-status-warn border-solid" },
  problem: { icon: "✕", className: "text-status-bad border-solid" },
  unverified: { icon: "?", className: "text-status-unknown border-dashed" },
};

const scannedAtFormat = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

/** The report page's content. Scores come saved with the report; texts from the catalog (ADR-0003). */
export function ScanReport({
  report,
  scores,
  catalogVersion = CATALOG_VERSION,
  actions,
}: {
  report: Report;
  scores: Scores;
  /** Of the saved report: an older one lacks checks added since (ADR-0003). */
  catalogVersion?: number;
  actions?: ReactNode;
}) {
  const url = new URL(report.url);
  // Weights add up to 100 inside each section: across sections, the section's own weight counts too.
  const importance = (r: CheckResult) => CHECKS[r.id].weight * SECTION_WEIGHTS[CHECKS[r.id].section];
  const urgent = report.results.filter((r) => r.outcome === "problem").sort((a, b) => importance(b) - importance(a));
  // Sections with a saved score, in report order; performance and the total score arrive in M5.
  const sections = (["security", "seo", "accessibility"] as const).flatMap((section) => {
    const score = scores[section];
    const results = report.results.filter((r) => CHECKS[r.id].section === section);
    return score && results.length > 0 ? [{ section, score, results }] : [];
  });

  return (
    <section aria-labelledby="report-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 id="report-title" className="font-display text-4xl font-light tracking-tight sm:text-5xl">
          Risultati per {url.hostname}
        </h1>
        <p className="text-ink-muted">
          Analizzato il {scannedAtFormat.format(new Date(report.scannedAt))}:{" "}
          <span className="break-all">{report.url}</span>
        </p>
        {report.readOverHttp && <p className="mt-2 max-w-text">{READ_OVER_HTTP_NOTE}</p>}
        {catalogVersion < CATALOG_VERSION && <p className="mt-2 max-w-text">{REPORT_TEXTS.olderCatalog}</p>}
      </div>
      {actions}
      {urgent.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface-raised p-5">
          <h2 className="text-xl font-semibold">{SCORE_TEXTS.urgent}</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {urgent.map((result) => (
              <li key={result.id}>
                <a href={`#check-${result.id}`} className="underline underline-offset-4">
                  {headlineOf(result)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sections.map(({ section, score, results }) => (
        <ReportSection key={section} section={section} score={score} results={results} />
      ))}
    </section>
  );
}

function ReportSection({ section, score, results }: { section: Section; score: Score | Unscored; results: CheckResult[] }) {
  return (
    <section aria-labelledby={`section-${section}`} className="flex flex-col gap-2">
      <h2 id={`section-${section}`} className="text-xl font-semibold">
        {SECTION_LABELS[section]}
      </h2>
      {"value" in score ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-display text-5xl font-extrabold">{score.value}</span>
            <span className="sr-only"> su 100, </span>
            <span className="font-display text-2xl font-light">{VERDICT_LABELS[verdict(score.value)]}</span>
          </p>
          {score.capped && <p className="max-w-text">{SCORE_TEXTS.capped}</p>}
          {score.partial && <p className="text-ink-muted">{SCORE_TEXTS.partial}</p>}
        </>
      ) : (
        <p>{fillText(SCORE_TEXTS.unavailable, { unverified: String(score.unverified), checks: String(score.checks) })}</p>
      )}
      <ul className="flex flex-col">
        {results.map((result) => (
          <ResultItem key={result.id} result={result} />
        ))}
      </ul>
    </section>
  );
}

function textsOf(result: CheckResult) {
  const check: CheckDefinition = CHECKS[result.id];
  if (result.outcome === "unverified") return undefined;
  return (result.variant && check.variants?.[result.variant]) || check.texts[result.outcome];
}

function headlineOf(result: CheckResult): string {
  const texts = textsOf(result);
  return texts ? fillText(texts.headline, result.values) : CHECKS[result.id].label;
}

function ResultItem({ result }: { result: CheckResult }) {
  const check: CheckDefinition = CHECKS[result.id];
  const style = OUTCOME_STYLE[result.outcome];
  const texts = textsOf(result);
  const explanation = texts ? texts.explanation : result.reason && ERROR_MESSAGES[result.reason];

  return (
    <li id={`check-${result.id}`} className="flex scroll-mt-6 flex-col gap-2 border-t border-edge-subtle py-4 sm:flex-row sm:gap-6">
      <p className={`flex shrink-0 flex-wrap items-center gap-x-2 self-start font-medium sm:w-40 ${style.className}`}>
        <span
          aria-hidden="true"
          className="inline-flex size-6 items-center justify-center rounded-full border border-current text-sm"
        >
          {style.icon}
        </span>
        {OUTCOME_LABELS[result.outcome]}
        {isRecommended(result) && <span className="w-full pl-8 text-sm font-normal text-ink-muted">{RECOMMENDED_LABEL}</span>}
      </p>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-medium">{headlineOf(result)}</h3>
        {explanation && <p className="text-ink-muted">{explanation}</p>}
        <details className="mt-1">
          <summary className="w-fit cursor-pointer text-ink-accent underline underline-offset-4">
            Dettagli tecnici
          </summary>
          <dl className="mt-2 flex flex-col gap-2 text-sm">
            <div>
              <dt className="font-medium">Valori letti</dt>
              <dd>
                <ul className="font-mono break-all text-ink-muted">
                  {result.found.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt className="font-medium">Atteso</dt>
              <dd className="text-ink-muted">{check.expected}</dd>
            </div>
            <div>
              <dt className="font-medium">Documentazione</dt>
              <dd>
                <a href={check.docs} className="break-all text-ink-accent underline underline-offset-4">
                  {check.docs}
                </a>
              </dd>
            </div>
          </dl>
        </details>
      </div>
    </li>
  );
}
