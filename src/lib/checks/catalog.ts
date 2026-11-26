import type { SafeRequestErrorCode } from "@/lib/safe-request";

import type { Verdict } from "./score";

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
  /** Points lost on a problem; a warning loses half (score.ts). Security weights add up to 100. */
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
    weight: 25,
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
    weight: 12,
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
    weight: 20,
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
    weight: 4,
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

  mixedContent: {
    section: "security",
    label: "Contenuti caricati senza protezione",
    severity: "problem",
    weight: 10,
    texts: {
      ok: {
        headline: "La pagina carica tutto in modo protetto",
        explanation: "Script, stili e immagini arrivano tutti in https: il lucchetto del browser resta intatto.",
      },
      warning: {
        headline: "Alcune immagini o video arrivano senza protezione",
        explanation:
          "La pagina è protetta, ma alcuni elementi (immagini, video, icone) vengono caricati senza https. Il browser prova a caricarli in modo protetto e, se non ci riesce, non li mostra.",
      },
      problem: {
        headline: "Script o stili della pagina arrivano senza protezione",
        explanation:
          "Il browser li blocca, quindi parti del sito possono apparire rotte o smettere di funzionare. Vanno caricati in https.",
      },
    },
    expected: "Nell'HTML di una pagina https, nessuna risorsa caricata da http://",
    docs: "https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content",
  },

  hsts: {
    section: "security",
    label: "Accesso sempre protetto (HSTS)",
    severity: "warning",
    weight: 7,
    texts: {
      ok: {
        headline: "Il browser ricorda di aprire il sito solo in https",
        explanation:
          "Dopo la prima visita il browser non passa più dalla versione non protetta, nemmeno se qualcuno scrive l'indirizzo senza https.",
      },
      warning: {
        headline: "Il browser non sa di dover usare sempre https",
        explanation:
          "Manca l'istruzione che dice al browser di aprire il sito sempre in modo protetto, oppure vale meno di 6 mesi. Si aggiunge con una riga nella configurazione del server.",
      },
    },
    expected: "Strict-Transport-Security con max-age di almeno 15768000 secondi (6 mesi)",
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security",
  },

  csp: {
    section: "security",
    label: "Regole sui contenuti (CSP)",
    severity: "warning",
    weight: 2,
    texts: {
      ok: {
        headline: "Il sito dichiara da dove si possono caricare i contenuti",
        explanation: "Una Content Security Policy limita i danni se qualcuno riesce a inserire codice nelle pagine.",
      },
      warning: {
        headline: "Il sito non dichiara da dove si possono caricare i contenuti",
        explanation:
          "È una protezione in più contro l'inserimento di codice malevolo. Su un piccolo sito è normale non averla: è un consiglio, non un'urgenza.",
      },
    },
    expected: 'Un header Content-Security-Policy, oppure un tag <meta http-equiv="Content-Security-Policy">',
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP",
  },

  clickjacking: {
    section: "security",
    label: "Protezione dal clickjacking",
    severity: "warning",
    weight: 6,
    texts: {
      ok: {
        headline: "Il sito non può essere mostrato dentro altri siti",
        explanation:
          "Nessuno può nascondere le pagine del sito dentro una pagina propria per ingannare i visitatori e farli cliccare dove non vogliono.",
      },
      warning: {
        headline: "Il sito può essere mostrato dentro altri siti",
        explanation:
          "Un sito malevolo potrebbe incorporare queste pagine e ingannare i visitatori, facendoli cliccare dove non vogliono. Si evita con una riga nella configurazione del server.",
      },
    },
    expected:
      "X-Frame-Options: DENY o SAMEORIGIN, oppure frame-ancestors nell'header Content-Security-Policy (nel tag <meta> non vale)",
    docs: "https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Clickjacking",
  },

  nosniff: {
    section: "security",
    label: "Tipo dei file dichiarato (nosniff)",
    severity: "warning",
    weight: 2,
    texts: {
      ok: {
        headline: "Il browser usa i file solo per quello che sono",
        explanation: "Un file presentato come immagine non può essere eseguito come codice.",
      },
      warning: {
        headline: "Il browser potrebbe indovinare il tipo dei file",
        explanation:
          "Senza questa istruzione, un file caricato come immagine potrebbe essere trattato come codice. È un consiglio: si aggiunge con una riga nella configurazione del server.",
      },
    },
    expected: "X-Content-Type-Options: nosniff",
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options",
  },

  referrerPolicy: {
    section: "security",
    label: "Informazioni passate agli altri siti (Referrer-Policy)",
    severity: "warning",
    weight: 1,
    texts: {
      ok: {
        headline: "Il sito decide cosa dire agli altri siti",
        explanation:
          "Quando un visitatore segue un link esterno, il sito sceglie quanta parte dell'indirizzo di provenienza condividere.",
      },
      warning: {
        headline: "Il sito non decide cosa dire agli altri siti",
        explanation:
          "Il browser usa la sua regola predefinita, che di solito va bene. Dichiararla è un consiglio, utile se gli indirizzi delle pagine contengono dati dei visitatori.",
      },
    },
    expected: "Un header Referrer-Policy, per esempio strict-origin-when-cross-origin",
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy",
  },

  permissionsPolicy: {
    section: "security",
    label: "Permessi del browser (Permissions-Policy)",
    severity: "warning",
    weight: 1,
    texts: {
      ok: {
        headline: "Il sito dichiara quali funzioni del browser usa",
        explanation:
          "Fotocamera, microfono, posizione: il sito dice quali servono e quali no, anche per i contenuti incorporati.",
      },
      warning: {
        headline: "Il sito non dichiara quali funzioni del browser usa",
        explanation:
          "È un consiglio: limitare fotocamera, microfono e posizione a chi ne ha bisogno riduce i rischi dei contenuti esterni, come mappe o video incorporati.",
      },
    },
    expected: "Un header Permissions-Policy, per esempio camera=(), microphone=(), geolocation=()",
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy",
  },

  cookies: {
    section: "security",
    label: "Cookie",
    severity: "warning",
    weight: 6,
    texts: {
      ok: {
        headline: "Nessun cookie impostato senza protezioni",
        explanation: "I cookie che la pagina imposta, se ce ne sono, hanno tutte le protezioni consigliate.",
      },
      warning: {
        headline: "Alcuni cookie non hanno tutte le protezioni",
        explanation:
          "Possono viaggiare senza cifratura, essere letti da script o partire verso altri siti. Di solito si sistema nelle impostazioni del sito o del plugin che li crea.",
      },
    },
    expected: "Ogni Set-Cookie con Secure, HttpOnly e SameSite",
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie",
  },

  exposedVersions: {
    section: "security",
    label: "Versioni del software",
    severity: "warning",
    weight: 4,
    texts: {
      ok: {
        headline: "Il server non dichiara le versioni del software",
        explanation: "Chi cerca siti con programmi vecchi e vulnerabili non trova indizi nelle risposte del sito.",
      },
      warning: {
        headline: "Il server dichiara la versione del software che usa",
        explanation:
          "È un indizio utile a chi cerca siti con programmi vecchi da attaccare. Si nasconde con un'impostazione del server; conviene comunque tenere il software aggiornato.",
      },
    },
    expected: "Server e X-Powered-By assenti o senza numeri di versione",
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Server",
  },
} as const satisfies Record<string, CheckDefinition>;

export type CheckId = keyof typeof CHECKS;

/** Saved with every report (ADR-0003). Raise it when a check starts measuring something different. */
export const CATALOG_VERSION = 1;

export const OUTCOME_LABELS: Record<Outcome, string> = {
  ok: "Ok",
  warning: "Attenzione",
  problem: "Problema",
  unverified: "Non verificato",
};

export type ReasonCode =
  | SafeRequestErrorCode
  | "no_https"
  | "certificate_expired"
  | "read_over_http"
  | "page_unreachable"
  | "not_html";

/** Shown in the form when the scan cannot start, and as the reason of "non verificato". */
export const ERROR_MESSAGES: Record<
  ReasonCode | "empty_address" | "scan_disabled" | "scan_unavailable" | "ip_limit" | "daily_limit",
  string
> = {
  empty_address: "Scrivi l'indirizzo di un sito, per esempio trattoriadamario.it.",
  scan_disabled: "YuSure è in costruzione: le scansioni arrivano a breve.",
  scan_unavailable: "In questo momento YuSure non riesce ad analizzare siti. Riprova tra qualche minuto.",
  ip_limit: "Hai raggiunto il numero massimo di analisi per un'ora: puoi farne un'altra tra poco.",
  daily_limit: "YuSure ha raggiunto il numero massimo di analisi per oggi. Riprova più tardi.",
  invalid_url: "Questo indirizzo non sembra valido. Prova a scriverlo così: trattoriadamario.it",
  not_allowed: "Questo indirizzo non si può analizzare: YuSure apre solo pagine web normali, senza porte particolari né password nell'indirizzo.",
  not_public: "Questo indirizzo non è un sito pubblico.",
  dns_failed: "Questo dominio non risulta collegato a nessun sito. Controlla che sia scritto bene.",
  connection_refused: "Il sito non accetta connessioni. Potrebbe essere spento o in manutenzione: riprova più tardi.",
  connection_reset: "Il sito ha chiuso la connessione prima di rispondere.",
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
  read_over_http:
    "La pagina si è potuta leggere solo senza https, e questo controllo ha senso solo per la versione protetta del sito.",
  page_unreachable: "Non è stato possibile leggere la pagina, né in https né in http.",
  not_html: "L'indirizzo non porta a una pagina web (HTML), quindi non ci sono contenuti da controllare.",
};

export const SECTION_LABELS: Record<Section, string> = {
  security: "Sicurezza",
  performance: "Performance",
  seo: "SEO",
  accessibility: "Accessibilità",
};

export const VERDICT_LABELS: Record<Verdict, string> = {
  good: "Buono",
  improve: "Da migliorare",
  critical: "Critico",
};

export const SCORE_TEXTS = {
  urgent: "Da sistemare subito",
  partial: "Punteggio parziale: i controlli non verificati non sono contati.",
  unavailable:
    "Punteggio non disponibile: troppi controlli non si sono potuti eseguire ({unverified} su {checks}) per dare un voto affidabile.",
};

/** The report page around the results (SPEC, "Report"). */
export const REPORT_TEXTS = {
  loading: "Caricamento del report…",
  notFoundTitle: "Report non trovato",
  notFound: "Questo link non porta a nessun report. Controlla di averlo copiato per intero.",
  copyLink: "Copia link",
  copied: "Link copiato.",
  copyFailed: "Non è stato possibile copiare il link: copialo dalla barra degli indirizzi.",
  rescan: "Rifai la scansione",
  rescanPending: "Analisi in corso: può richiedere fino a 30 secondi.",
  rescanLater: "Questo report ha meno di 24 ore: potrai rifare la scansione dal {date}.",
  olderCatalog:
    "Questo report è stato fatto con una versione precedente dei controlli: alcuni controlli che YuSure fa oggi allora non c'erano.",
};

/** Shown above the results when the page checks used the http version (SPEC, regole comuni). */
export const READ_OVER_HTTP_NOTE =
  "I controlli sulla pagina (header, cookie e contenuti) usano la versione http, perché quella https non si è potuta leggere o rimanda a http.";

/** Fills {name} placeholders; a missing value is left visible rather than hidden. */
export function fillText(text: string, values: Record<string, string> = {}): string {
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] ?? placeholder);
}
