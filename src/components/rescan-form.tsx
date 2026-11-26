"use client";

import { useActionState } from "react";

import { scan, type ScanState } from "@/app/actions";
import { REPORT_TEXTS } from "@/lib/checks/catalog";

/** "Rifai la scansione": the same action as the Home form, so the cache and the limits apply too. */
export function RescanForm({ address }: { address: string }) {
  const [state, formAction, pending] = useActionState<ScanState, FormData>(scan, { status: "idle", address });

  let message = "";
  if (pending) message = REPORT_TEXTS.rescanPending;
  else if (state.status === "error") message = state.message;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="url" value={address} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-fit rounded-lg border border-edge px-6 font-medium transition-[background-color,translate] duration-(--duration-unhover) ease-state hover:bg-surface-raised hover:duration-(--duration-hover) active:translate-y-px active:duration-0 disabled:cursor-wait disabled:opacity-70"
      >
        {REPORT_TEXTS.rescan}
      </button>
      <p role="status" className="min-h-6 text-ink-muted">
        {message}
      </p>
    </form>
  );
}
