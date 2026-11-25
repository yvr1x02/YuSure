# ADR-0001 — Stack tecnico

**Stato:** accettato, modificato il 2026-11-25 (database: Neon al posto di Supabase)
**Data:** 2026-11-25

## Contesto

YuSure fa richieste verso siti esterni, deve salvare i report e servirli con un link, e deve essere riconoscibile in un portfolio da sviluppatore front-end e full-stack. Le versioni esatte si verificano in M0, al momento dell'installazione.

## Decisione

| Area | Scelta |
|---|---|
| Framework | Next.js (App Router), runtime Node.js per le route che scansionano |
| Linguaggio | TypeScript |
| Stile | Tailwind CSS v4 |
| Database | Neon (Postgres), piano Free, regione Francoforte (`aws-eu-central-1`) |
| Hosting | Vercel |
| Analisi dell'HTML | cheerio |
| Controllo degli IP | ipaddr.js |
| Performance e accessibilità | API di PageSpeed Insights v5 |
| Test | Vitest per la logica, Playwright per i percorsi completi e i controlli axe |
| Package manager | npm |

Le richieste verso i siti, i controlli TLS e le chiamate a PageSpeed avvengono **solo sul server**: il browser parla soltanto con YuSure.

## Alternative considerate

- **Runtime Edge.** Scartato: non ha il modulo `tls` di Node, necessario per leggere il certificato, né il controllo sulla risoluzione DNS richiesto da ADR-0002.
- **Lighthouse eseguito da noi** (Chrome headless su una funzione serverless). Scartato: pesante, lento a partire e fragile su Vercel. PageSpeed esegue Lighthouse sui server di Google ed è gratuito con una API key.
- **Parsing dell'HTML con espressioni regolari.** Scartato: fragile su HTML reale e malformato; cheerio usa un parser conforme.
- **Controllo degli IP scritto a mano.** Scartato: è il cuore della protezione SSRF, e IPv6, gli IPv4 incapsulati in IPv6 e le notazioni alternative sono facili da sbagliare. ipaddr.js è una libreria matura per esattamente questo.
- **Nessun database.** Senza database non ci sono link condivisibili né cache.
- **Supabase**, scelta iniziale. Scartato: sul piano Free un progetto con poca attività per 7 giorni va in pausa e si riprende solo a mano dalla dashboard; nel frattempo i link ai report resterebbero rotti. Neon invece sospende il compute dopo 5 minuti di inattività e lo riattiva da solo alla prima query, in qualche centinaio di millisecondi ([scale to zero](https://neon.com/docs/introduction/scale-to-zero), aggiornata il 2026-11-04).
- **Cloudflare D1.** Scartato: da una funzione su Vercel si raggiunge solo tramite l'API HTTP dell'account Cloudflare, con un token dell'account, invece che con una normale connessione al database.

## Conseguenze

- cheerio e ipaddr.js sono dipendenze da approvare in M0 e M1, con verifica di nome e fonte ufficiale.
- **ipaddr.js 2.5.0**, approvato e installato in M1 (versione esatta) il 2026-11-25. Verifiche fatte prima dell'installazione:
  - il nome del pacchetto è `ipaddr.js`; autore e unico maintainer su npm è `whitequark`, che è anche il proprietario del repository `github.com/whitequark/ipaddr.js` (non archiviato);
  - licenza MIT, nessuna dipendenza, nessuno script di installazione, tipi TypeScript inclusi;
  - il commit da cui è stato pubblicato (`gitHead` `dc55282`, "Bump version.") è sulla storia principale del repository ufficiale, 4 minuti prima della pubblicazione su npm (2026-08-04);
  - `npm audit signatures`: firme del registry verificate per tutti i pacchetti installati;
  - **manca il tag `v2.5.0`** su GitHub (l'ultimo è `v2.4.0`) e non ci sono release: la corrispondenza fra pacchetto e sorgente si appoggia sul `gitHead`, non su un tag.
  - Dopo `ipaddr.process()` passa solo il range `unicast`: la libreria classifica già come non pubblici anche `3fff::/20`, NAT64, 6to4 e Teredo, senza bisogno di una lista nostra (test in `src/lib/safe-request/ip.test.ts`).
- Serve una API key di PageSpeed (Google Cloud), da creare in M5.
- Il database si raggiunge solo dal server, con la stringa di connessione in `DATABASE_URL` (ADR-0003). Il driver Postgres si sceglie e si installa in M3.
- Piano Free di Neon: 100 CU-ore al mese per progetto, 1 GB di spazio per progetto; oltre il limite di CU-ore il compute resta sospeso fino al mese successivo, senza perdita di dati ([piani](https://neon.com/docs/introduction/plans), aggiornata il 2026-11-24).
- **Node.js 22** in locale e su Vercel. Su Vercel `engines.node` in `package.json` ha la precedenza sull'impostazione del progetto, e un intervallo aperto (`>=22…`) prenderebbe l'ultima versione disponibile (26.x): per questo è `22.x`. Si sceglie solo la versione principale; minori e patch le applica Vercel. Fonte: [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), letta il 2026-11-25.
- La durata massima delle funzioni su Vercel limita il tempo di una scansione: si verifica in M0 sulla documentazione del piano in uso (ADR-0003).
