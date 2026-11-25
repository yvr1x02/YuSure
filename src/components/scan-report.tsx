import { CHECKS, ERROR_MESSAGES, fillText, OUTCOME_LABELS, type CheckDefinition, type Outcome } from "@/lib/checks/catalog";
import type { CheckResult } from "@/lib/checks/result";
import type { ScanReport as Report } from "@/lib/checks/scan";

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

export function ScanReport({ report }: { report: Report }) {
  const url = new URL(report.url);
  return (
    <section aria-labelledby="report-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id="report-title" className="font-display text-3xl font-light tracking-tight">
          Risultati per {url.hostname}
        </h2>
        <p className="text-ink-muted">
          Analizzato il {scannedAtFormat.format(new Date(report.scannedAt))}:{" "}
          <span className="break-all">{report.url}</span>
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold">Sicurezza</h3>
        <ul className="flex flex-col">
          {report.results.map((result) => (
            <ResultItem key={result.id} result={result} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ResultItem({ result }: { result: CheckResult }) {
  const check: CheckDefinition = CHECKS[result.id];
  const style = OUTCOME_STYLE[result.outcome];
  const texts = result.outcome === "unverified" ? undefined : check.texts[result.outcome];
  const headline = texts ? fillText(texts.headline, result.values) : check.label;
  const explanation = texts ? texts.explanation : result.reason && ERROR_MESSAGES[result.reason];

  return (
    <li className="flex flex-col gap-2 border-t border-edge-subtle py-4 sm:flex-row sm:gap-6">
      <p className={`flex shrink-0 items-center gap-2 self-start font-medium sm:w-40 ${style.className}`}>
        <span
          aria-hidden="true"
          className="inline-flex size-6 items-center justify-center rounded-full border border-current text-sm"
        >
          {style.icon}
        </span>
        {OUTCOME_LABELS[result.outcome]}
      </p>
      <div className="flex min-w-0 flex-col gap-1">
        <h4 className="font-medium">{headline}</h4>
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
