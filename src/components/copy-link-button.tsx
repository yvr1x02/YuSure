"use client";

import { useState } from "react";

import { REPORT_TEXTS } from "@/lib/checks/catalog";

export function CopyLinkButton() {
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage(REPORT_TEXTS.copied);
    } catch {
      // Clipboard refused (permissions, insecure context): the address bar still works.
      setMessage(REPORT_TEXTS.copyFailed);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={copy}
        className="min-h-12 w-fit rounded-lg bg-fill-accent px-6 font-medium transition-[background-color,translate] duration-(--duration-unhover) ease-state hover:bg-fill-accent-hover hover:duration-(--duration-hover) active:translate-y-px active:duration-0"
      >
        {REPORT_TEXTS.copyLink}
      </button>
      <p role="status" className="min-h-6 text-ink-muted">
        {message}
      </p>
    </div>
  );
}
