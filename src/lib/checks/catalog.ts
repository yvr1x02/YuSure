import type { SafeRequestErrorCode } from "@/lib/safe-request";

/*
 * Every text of the report lives here (CLAUDE.md, "Linguaggio del report").
 * headline: what happened, for the site owner. explanation: why it matters.
 * {name} placeholders are filled by fillText with values found by the check.
 */

export type Outcome = "ok" | "warning" | "problem" | "unverified";
export type Section = "security" | "performance" | "seo" | "accessibility";

type Texts = { headline: string; explanation: string };

export type CheckDefinition = {
  section: Section;
  /** Neutral name, used when the check could not run. */
  label: string;
  /** Outcome when the check fails, from the SPEC table. */
  severity: "warning" | "problem";
  /** Points taken from the section score; the formula arrives in M2. */
  weight: number;
  texts: Partial<Record<Exclude<Outcome, "unverified">, Texts>>;
  /** "Dettagli tecnici": what a passing site shows. */
  expected: string;
  docs: string;
};

export const CHECKS = {
  https: {
    section: "security",
    label: "Connessione protetta (https)",
    severity: "problem",
    weight: 30,
    texts: {
      ok: {
        headline: "Il sito risponde in https",
        explanation: "Esiste una versione protetta del sito: quello che i visitatori leggono e scrivono può viaggiare cifrato.",
      },
      problem: {
        headline: "Il sito non risponde in https",
        explanation:
          "I browser lo segnalano come «Non sicuro», e molti visitatori se ne vanno prima di leggere. Anche Google preferisce i siti protetti.",
      },
    },
    expected: "Una risposta da https://; la validità del certificato ha un controllo a parte",
    docs: "https://developer.mozilla.org/en-US/docs/Glossary/HTTPS",
  },

  httpRedirect: {
    section: "security",
    label: "Passaggio da http a https",
    severity: "problem",
    weight: 15,
    texts: {
      ok: {
        headline: "Chi scrive l'indirizzo senza https arriva comunque alla versione protetta",
        explanation: "Il sito porta da solo i visitatori da http a https, anche da link vecchi o scritti a mano.",
      },
      warning: {
        headline: "La versione senza https del sito non risponde",
        explanation:
          "Chi scrive l'indirizzo con http:// o segue un link vecchio trova una pagina di errore invece del sito.",
      },
      problem: {
        headline: "Il sito non passa da http a https",
        explanation: "Chi scrive l'indirizzo senza «https» resta su una versione non protetta.",
      },
    },
    expected: "Da http:// un reindirizzamento 301 o 308 (anche 302 o 307) che arriva a https://, in al massimo 5 passaggi",
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Redirections",
  },

  certificateValid: {
    section: "security",
    label: "Certificato di sicurezza",
    severity: "problem",
    weight: 25,
    texts: {
      ok: {
        headline: "Il certificato di sicurezza è valido",
        explanation: "È emesso per questo dominio e il browser lo riconosce: i visitatori non vedono avvisi.",
      },
      problem: {
        headline: "Il certificato di sicurezza non è valido",
        explanation:
          "Il browser mostra un avviso a tutta pagina prima di aprire il sito: molti visitatori si fermano lì.",
      },
    },
    expected: "Un certificato non scaduto, emesso per il dominio da un'autorità riconosciuta",
    docs: "https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Transport_Layer_Security",
  },

  certificateExpiry: {
    section: "security",
    label: "Scadenza del certificato",
    severity: "warning",
    weight: 5,
    texts: {
      ok: {
        headline: "Il certificato scade il {date}",
        explanation: "Mancano più di 14 giorni alla scadenza.",
      },
      warning: {
        headline: "Il certificato scade entro 14 giorni",
        explanation:
          "Se non viene rinnovato in tempo, il sito mostrerà un avviso di sicurezza. Di solito il rinnovo è automatico: vale la pena controllare che lo sia.",
      },
    },
    expected: "Almeno 14 giorni alla scadenza",
    docs: "https://web.dev/articles/why-https-matters",
  },
} as const satisfies Record<string, CheckDefinition>;

export type CheckId = keyof typeof CHECKS;

export const OUTCOME_LABELS: Record<Outcome, string> = {
  ok: "Ok",
  warning: "Attenzione",
  problem: "Problema",
  unverified: "Non verificato",
};

export type ReasonCode = SafeRequestErrorCode | "scan_deadline" | "no_https" | "certificate_expired";

/** Shown in the form when the scan cannot start, and as the reason of "non verificato". */
export const ERROR_MESSAGES: Record<ReasonCode | "empty_address", string> = {
  empty_address: "Scrivi l'indirizzo di un sito, per esempio trattoriadamario.it.",
  invalid_url: "Questo indirizzo non sembra valido. Prova a scriverlo così: trattoriadamario.it",
  not_allowed: "Questo indirizzo non si può analizzare: YuSure apre solo pagine web normali, senza porte particolari né password nell'indirizzo.",
  not_public: "Questo indirizzo non è un sito pubblico.",
  dns_failed: "Questo dominio non risulta collegato a nessun sito. Controlla che sia scritto bene.",
  connection_refused: "Il sito non accetta connessioni. Potrebbe essere spento o in manutenzione: riprova più tardi.",
  connection_failed: "Non è stato possibile collegarsi al sito.",
  timeout: "Il sito non ha risposto entro 10 secondi.",
  too_large:
    "La pagina è molto pesante (oltre 2 MB) e YuSure si ferma lì. Una pagina così pesante è lenta da aprire, soprattutto da telefono.",
  too_many_redirects: "Il sito rimanda da un indirizzo all'altro più di 5 volte.",
  tls_error: "La connessione protetta non è riuscita perché il certificato non è valido.",
  bad_response: "Il sito ha risposto in un formato che YuSure non riesce a leggere.",
  scan_deadline: "La scansione ha superato i 30 secondi e si è fermata prima di questo controllo.",
  no_https: "Il sito non risponde in https, quindi non c'è un certificato da controllare.",
  certificate_expired: "Il certificato è già scaduto: lo segnala il controllo sul certificato di sicurezza.",
};

/** Fills {name} placeholders; a missing value is left visible rather than hidden. */
export function fillText(text: string, values: Record<string, string> = {}): string {
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] ?? placeholder);
}
