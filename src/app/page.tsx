import { ScanForm } from "@/components/scan-form";

export default function Home() {
  return (
    <div className="flex flex-col gap-10 pt-12 sm:pt-20">
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-4xl font-light tracking-tight sm:text-5xl">
          Il tuo sito è in buona salute?
        </h1>
        <p className="max-w-text text-lg text-ink-muted">
          YuSure controlla sicurezza, velocità, visibilità su Google e accessibilità di un sito e
          ti spiega i risultati in parole semplici. Legge solo ciò che il sito mostra a tutti: non
          forza nulla.
        </p>
      </div>
      <ScanForm />
    </div>
  );
}
