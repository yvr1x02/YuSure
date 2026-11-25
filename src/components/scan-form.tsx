"use client";

import { useState, type FormEvent } from "react";

export function ScanForm() {
  const [message, setMessage] = useState("");

  // shortcut: no scan yet (M0); M1 replaces this with address normalisation and the real request.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = new FormData(event.currentTarget).get("url")?.toString().trim();
    setMessage(
      address
        ? "La scansione arriva a breve: YuSure è ancora in costruzione."
        : "Scrivi l'indirizzo di un sito, per esempio trattoriadamario.it.",
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
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
          aria-describedby="scan-message"
          className="min-h-12 flex-1 rounded-md border border-edge bg-surface px-4 text-base placeholder:text-ink-subtle"
        />
        <button
          type="submit"
          className="min-h-12 rounded-lg bg-fill-accent px-6 font-medium transition-[background-color,translate] duration-(--duration-unhover) ease-state hover:bg-fill-accent-hover hover:duration-(--duration-hover) active:translate-y-px active:duration-0"
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
