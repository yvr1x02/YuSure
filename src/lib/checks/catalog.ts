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

/**
 * Checks (or variants) weighing this much or less are "Consigliato": a low-weight warning,
 * labelled the same way in every section (SPEC, "Punteggio").
 */
export const RECOMMENDED_MAX_WEIGHT = 3;

export type CheckDefinition = {
  section: Section;
  /** Neutral name, used when the check could not run. */
  label: string;
  /** Outcome when the check fails, from the SPEC table. */
  severity: "warning" | "problem";
  /** Points lost on a problem; a warning loses half (score.ts). Security weights add up to 100. */
  weight: number;
  texts: Partial<Record<Exclude<Outcome, "unverified">, Texts>>;
  /**
   * Texts for one cause of an outcome (CheckResult.variant), e.g. a title missing or too long.
   * A variant's own weight replaces the check's in the points it loses.
   */
  variants?: Record<string, Texts & { weight?: number }>;
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

  // SEO (SPEC, "SEO"). Weights add up to 100 (decided in M4).
  noindex: {
    section: "seo",
    label: "Pagina visibile su Google",
    severity: "problem",
    weight: 20,
    texts: {
      ok: {
        headline: "La pagina non chiede di restare fuori da Google",
        explanation: "Nessuna istruzione nella pagina dice ai motori di ricerca di non mostrarla nei risultati.",
      },
      problem: {
        headline: "La pagina chiede ai motori di ricerca di non mostrarla",
        explanation:
          "Con «noindex» Google la toglie dai risultati: chi cerca l'attività non la trova. Capita che resti attivo per sbaglio dopo la costruzione del sito.",
      },
    },
    expected: 'Nessun noindex o none nei <meta name="robots"> o "googlebot" né nell\'header X-Robots-Tag',
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Robots-Tag",
  },

  title: {
    section: "seo",
    label: "Titolo della pagina",
    severity: "problem",
    weight: 18,
    texts: {
      ok: {
        headline: "La pagina ha un titolo della lunghezza giusta",
        explanation: "È il testo che Google mostra in grande nei risultati e che compare sulla scheda del browser.",
      },
      problem: {
        headline: "La pagina non ha un titolo",
        explanation:
          "Google ne inventa uno prendendo pezzi della pagina, e nei risultati il sito si riconosce peggio. Il titolo si scrive nelle impostazioni della pagina.",
      },
    },
    variants: {
      short: {
        headline: "Il titolo della pagina è molto corto ({length} caratteri)",
        explanation:
          "Un titolo di poche parole dice poco a chi cerca. Meglio qualcosa come «Trattoria da Mario – cucina toscana ad Arezzo».",
      },
      long: {
        headline: "Il titolo della pagina è lungo ({length} caratteri)",
        explanation: "Oltre i 60 caratteri circa Google lo taglia nei risultati: le parole importanti vanno all'inizio.",
      },
    },
    expected: "Un <title> di 10–60 caratteri",
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/title",
  },

  viewport: {
    section: "seo",
    label: "Adattamento ai telefoni",
    severity: "problem",
    weight: 18,
    texts: {
      ok: {
        headline: "La pagina dice al telefono di adattarsi allo schermo",
        explanation: "Sui telefoni la pagina si mostra alla larghezza giusta invece che rimpicciolita.",
      },
      problem: {
        headline: "La pagina non è impostata per i telefoni",
        explanation:
          "Sul telefono si vede come un sito da computer rimpicciolito, da ingrandire con le dita. Google valuta i siti guardando la versione per telefono, quindi conta anche per la posizione nei risultati.",
      },
    },
    expected: 'Un <meta name="viewport">, di solito con width=device-width, initial-scale=1',
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport",
  },

  metaDescription: {
    section: "seo",
    label: "Descrizione per Google",
    severity: "warning",
    weight: 10,
    texts: {
      ok: {
        headline: "La pagina ha una descrizione per Google della lunghezza giusta",
        explanation: "È il testo che Google può mostrare sotto il titolo nei risultati di ricerca.",
      },
    },
    variants: {
      missing: {
        headline: "La pagina non ha una descrizione per Google",
        explanation:
          "Google sceglie da solo un pezzo di testo da mostrare sotto il titolo, non sempre quello che convince a cliccare.",
      },
      short: {
        headline: "La descrizione per Google è molto corta ({length} caratteri)",
        explanation: "Ha spazio per dire di più: cosa offri, dove sei, perché sceglierti.",
      },
      long: {
        headline: "La descrizione per Google è lunga ({length} caratteri)",
        explanation: "Google di solito la taglia: le cose importanti vanno nelle prime righe.",
      },
    },
    expected: 'Un <meta name="description"> di 50–160 caratteri',
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name",
  },

  robotsTxt: {
    section: "seo",
    label: "File robots.txt",
    severity: "warning",
    weight: 11,
    texts: {
      ok: {
        headline: "Il file robots.txt c'è e lascia entrare i motori di ricerca",
        explanation: "È il file con cui il sito dice ai motori di ricerca dove possono passare.",
      },
    },
    variants: {
      missing: {
        headline: "Il sito non ha un file robots.txt",
        explanation:
          "Non è un errore grave: senza il file Google visita tutto. Averlo serve a indicare la sitemap e le parti da non visitare.",
      },
      blocksAll: {
        headline: "Il file robots.txt chiede a Google di non visitare il sito",
        explanation:
          "Con «Disallow: /» Google non legge le pagine e nei risultati il sito compare male o non compare. Succede spesso che resti così dopo la costruzione del sito.",
      },
      serverError: {
        headline: "Il file robots.txt risponde con un errore del server",
        explanation:
          "Con questo errore Google smette di visitare il sito per 12 ore, poi per un mese usa l'ultima copia del file che conosce. Va sistemato in fretta, di solito dal fornitore dell'hosting.",
      },
    },
    expected: "robots.txt che risponde 200 e non blocca tutto per Googlebot (Disallow: / senza Allow); se manca, Google visita tutto",
    docs: "https://developers.google.com/search/docs/crawling-indexing/robots/intro",
  },

  lang: {
    section: "seo",
    label: "Lingua della pagina",
    severity: "warning",
    weight: 6,
    texts: {
      ok: {
        headline: "La pagina dichiara la sua lingua",
        explanation: "Motori di ricerca, traduttori e lettori di schermo sanno in che lingua leggerla.",
      },
      warning: {
        headline: "La pagina non dichiara la sua lingua",
        explanation:
          "Il browser può proporre di tradurla senza motivo e i lettori di schermo per chi non vede rischiano di leggerla con la pronuncia sbagliata.",
      },
    },
    expected: '<html lang="…">, per esempio lang="it"',
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/lang",
  },

  h1: {
    section: "seo",
    label: "Titolo principale nel testo",
    severity: "warning",
    weight: 6,
    texts: {
      ok: {
        headline: "La pagina ha un solo titolo principale",
        explanation: "Il titolo in cima al testo dice subito, a Google e a chi legge, di cosa parla la pagina.",
      },
    },
    variants: {
      none: {
        headline: "La pagina non ha un titolo principale nel testo",
        explanation:
          "Manca il titolo più importante (h1): Google e chi usa un lettore di schermo capiscono meno bene di cosa parla la pagina.",
      },
      // Google copes with several h1: a recommendation, not a warning (decided in M4).
      many: {
        headline: "La pagina ha {count} titoli principali",
        explanation:
          "Google li gestisce senza problemi, ma un solo titolo principale rende la pagina più chiara per chi usa un lettore di schermo.",
        weight: RECOMMENDED_MAX_WEIGHT,
      },
    },
    expected: "Un solo <h1>",
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/Heading_Elements",
  },

  sitemap: {
    section: "seo",
    label: "Sitemap",
    severity: "warning",
    weight: 3,
    texts: {
      ok: {
        headline: "Il sito ha una sitemap",
        explanation: "È l'elenco delle pagine del sito: aiuta Google a trovarle tutte, anche le nuove.",
      },
    },
    variants: {
      missing: {
        headline: "Non si trova una sitemap",
        explanation:
          "Per un sito piccolo non è grave, ma la sitemap aiuta Google a trovare le pagine nuove. Molti sistemi la creano da soli: basta attivarla.",
      },
      invalid: {
        headline: "L'indirizzo della sitemap non porta a una sitemap",
        explanation: "Risponde, ma con una pagina che non è l'elenco delle pagine del sito: Google non può usarla.",
      },
    },
    expected: "La sitemap indicata in robots.txt, altrimenti /sitemap.xml, che risponde 200 con <urlset> o <sitemapindex>",
    docs: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview",
  },

  canonical: {
    section: "seo",
    label: "Indirizzo principale della pagina",
    severity: "warning",
    weight: 3,
    texts: {
      ok: {
        headline: "La pagina indica il suo indirizzo principale",
        explanation: "Se la stessa pagina si apre da più indirizzi, Google sa quale mostrare.",
      },
      warning: {
        headline: "La pagina non indica il suo indirizzo principale",
        explanation:
          "Se la pagina si apre da più indirizzi (con e senza www, con parametri), Google può considerarli doppioni.",
      },
    },
    expected: '<link rel="canonical" href="…">',
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel#canonical",
  },

  openGraph: {
    section: "seo",
    label: "Anteprima nei social",
    severity: "warning",
    weight: 3,
    texts: {
      ok: {
        headline: "La pagina ha titolo, descrizione e immagine per le anteprime",
        explanation: "Quando qualcuno condivide il link su WhatsApp o sui social, l'anteprima mostra quello che hai scelto.",
      },
      warning: {
        headline: "Mancano informazioni per le anteprime nei social",
        explanation:
          "Quando il link si condivide su WhatsApp o sui social, l'anteprima può uscire senza immagine o con un testo a caso.",
      },
    },
    expected: "I meta Open Graph og:title, og:description e og:image",
    docs: "https://ogp.me/",
  },

  structuredData: {
    section: "seo",
    label: "Dati strutturati",
    severity: "warning",
    weight: 2,
    texts: {
      ok: {
        headline: "La pagina descrive l'attività in un formato che Google capisce",
        explanation: "Con i dati strutturati Google capisce meglio nome, indirizzo, orari e tipo di attività.",
      },
    },
    variants: {
      missing: {
        headline: "La pagina non ha dati strutturati",
        explanation:
          "Con i dati strutturati Google capisce meglio nome, indirizzo, orari e tipo di attività.",
      },
      invalid: {
        headline: "I dati strutturati della pagina non si leggono",
        explanation: "Ci sono, ma scritti in modo che Google non riesce a leggerli: vanno corretti.",
      },
    },
    expected: 'Almeno uno <script type="application/ld+json"> con JSON valido (schema.org)',
    docs: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
  },

  // Accessibility from the HTML (SPEC, "Accessibilità"); Lighthouse joins in M5. Weights add up to 100 (decided in M4).
  imageAlt: {
    section: "accessibility",
    label: "Testo delle immagini",
    severity: "problem",
    weight: 35,
    texts: {
      ok: {
        headline: "Tutte le immagini hanno un testo alternativo",
        explanation: "Chi non vede usa un lettore di schermo, che legge ad alta voce cosa mostrano le immagini.",
      },
      warning: {
        headline: "Alcune immagini non hanno un testo alternativo",
        explanation:
          "Chi usa un lettore di schermo non sa cosa mostrano. Il testo si aggiunge nelle impostazioni dell'immagine; per le immagini solo decorative basta un testo vuoto.",
      },
      problem: {
        headline: "Molte immagini non hanno un testo alternativo",
        explanation:
          "Chi usa un lettore di schermo perde una parte importante della pagina. Il testo si aggiunge nelle impostazioni di ogni immagine; per quelle solo decorative basta un testo vuoto.",
      },
    },
    expected: 'Ogni <img> con alt; alt="" per le immagini decorative. 1–2 senza alt: attenzione, da 3: problema',
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img#alt",
  },

  formLabels: {
    section: "accessibility",
    label: "Etichette dei campi",
    severity: "problem",
    weight: 35,
    texts: {
      ok: {
        headline: "I campi dei moduli hanno un'etichetta",
        explanation: "Chi usa un lettore di schermo sa cosa scrivere in ogni campo, per esempio nel modulo per prenotare.",
      },
      problem: {
        headline: "Alcuni campi dei moduli non hanno un'etichetta",
        explanation:
          "Chi usa un lettore di schermo sente solo «campo di testo» e non sa cosa scriverci. Il testo grigio dentro il campo non basta: sparisce appena si scrive.",
      },
    },
    expected: "Ogni campo con <label>, aria-label, aria-labelledby o title (il placeholder non conta)",
    docs: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/label",
  },

  accessibleNames: {
    section: "accessibility",
    label: "Testo di link e pulsanti",
    severity: "problem",
    weight: 30,
    texts: {
      ok: {
        headline: "Link e pulsanti dicono dove portano o cosa fanno",
        explanation: "Anche chi usa un lettore di schermo capisce ogni link e ogni pulsante.",
      },
      warning: {
        headline: "Alcuni link o pulsanti non hanno un testo",
        explanation:
          "Sono spesso icone, per esempio quelle dei social: chi usa un lettore di schermo sente solo «link» senza sapere dove porta.",
      },
      problem: {
        headline: "Molti link o pulsanti non hanno un testo",
        explanation:
          "Chi usa un lettore di schermo sente una serie di «link» e «pulsante» senza sapere dove portano. Per le icone si aggiunge un testo nascosto o un'etichetta.",
      },
    },
    expected: "Ogni link e pulsante con testo, aria-label, aria-labelledby, title o un'immagine con alt. 1–2 senza: attenzione, da 3: problema",
    docs: "https://developer.mozilla.org/en-US/docs/Glossary/Accessible_name",
  },
} as const satisfies Record<string, CheckDefinition>;

export type CheckId = keyof typeof CHECKS;

/** Saved with every report (ADR-0003). Raise it when a check starts measuring something different. */
export const CATALOG_VERSION = 2;

/** Next to "Attenzione" on low-weight warnings (RECOMMENDED_MAX_WEIGHT). */
export const RECOMMENDED_LABEL = "Consigliato";

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
  | "not_html"
  | "client_rendered"
  | "rate_limited";

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
  client_rendered:
    "La pagina si costruisce nel browser con JavaScript: YuSure non riesce a leggerne il contenuto. Non è un difetto del sito, è un limite di questa analisi.",
  rate_limited: "Il sito ha chiesto a YuSure di rallentare (risposta 429), quindi il file non si è potuto leggere.",
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
