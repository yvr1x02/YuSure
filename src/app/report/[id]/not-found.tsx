import { REPORT_TEXTS } from "@/lib/checks/catalog";

export default function ReportNotFound() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-4xl font-light tracking-tight sm:text-5xl">{REPORT_TEXTS.notFoundTitle}</h1>
      <p className="max-w-text text-lg text-ink-muted">{REPORT_TEXTS.notFound}</p>
    </div>
  );
}
