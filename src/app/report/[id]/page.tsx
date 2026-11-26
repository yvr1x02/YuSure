import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { CopyLinkButton } from "@/components/copy-link-button";
import { RescanForm } from "@/components/rescan-form";
import { ScanReport } from "@/components/scan-report";
import { fillText, REPORT_TEXTS } from "@/lib/checks/catalog";
import { findScan } from "@/lib/scans";

// Reports are shared by link, never indexed (decided in M3); next.config.ts also sends X-Robots-Tag.
export const metadata: Metadata = {
  title: "Report — YuSure",
  robots: { index: false, follow: false },
};

const CACHE_HOURS = 24;

const dateFormat = new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Rome" });

export default function ReportPage({ params }: PageProps<"/report/[id]">) {
  return (
    <div className="pt-12 sm:pt-20">
      {/* Read from the database at every request: never in a Next.js cache (ADR-0004). */}
      <Suspense fallback={<p className="text-lg">{REPORT_TEXTS.loading}</p>}>
        <Report params={params} />
      </Suspense>
    </div>
  );
}

async function Report({ params }: Pick<PageProps<"/report/[id]">, "params">) {
  const { saved, rescanFrom } = await loadReport((await params).id);
  const actions = (
    <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
      <CopyLinkButton />
      {rescanFrom ? (
        <p className="max-w-text text-ink-muted">{fillText(REPORT_TEXTS.rescanLater, { date: dateFormat.format(rescanFrom) })}</p>
      ) : (
        <RescanForm address={saved.report.url} />
      )}
    </div>
  );
  return <ScanReport report={saved.report} scores={saved.scores} catalogVersion={saved.catalogVersion} actions={actions} />;
}

/** The report, and when it can be scanned again if the 24-hour cache still holds it (ADR-0003). */
async function loadReport(id: string) {
  await connection();
  const saved = await findScan(id);
  if (!saved) notFound();
  const from = new Date(new Date(saved.report.scannedAt).getTime() + CACHE_HOURS * 3_600_000);
  return { saved, rescanFrom: Date.now() < from.getTime() ? from : undefined };
}
