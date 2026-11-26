"use client";

import { useActionState } from "react";

import { scan, type ScanState } from "@/app/actions";

const initialState: ScanState = { status: "idle", address: "" };

export function ScanForm() {
  const [state, formAction, pending] = useActionState(scan, initialState);

  let message = "";
  if (pending) message = "Analisi in corso: può richiedere fino a 30 secondi.";
  else if (state.status === "error") message = state.message;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <label htmlFor="url" className="font-medium">
        Indirizzo del sito
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="trattoriadamario.it"
          defaultValue={state.address}
          aria-describedby="scan-message"
          className="min-h-12 flex-1 rounded-md border border-edge bg-surface px-4 text-base placeholder:text-ink-subtle"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 rounded-lg bg-fill-accent px-6 font-medium transition-[background-color,translate] duration-(--duration-unhover) ease-state hover:bg-fill-accent-hover hover:duration-(--duration-hover) active:translate-y-px active:duration-0 disabled:cursor-wait disabled:opacity-70"
        >
          Analizza
        </button>
      </div>
      <p id="scan-message" role="status" className="min-h-6 text-ink-muted">
        {message}
      </p>
    </form>
  );
}
