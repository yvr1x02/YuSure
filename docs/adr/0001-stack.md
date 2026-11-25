# ADR-0001 — Stack tecnico

**Stato:** accettato
**Data:** 2026-11-25

## Contesto

YuSure fa richieste verso siti esterni, deve salvare i report e servirli con un link, e deve essere riconoscibile in un portfolio da sviluppatore front-end e full-stack. Le versioni esatte si verificano in M0, al momento dell'installazione.

## Decisione

| Area | Scelta |
|---|---|
| Framework | Next.js (App Router), runtime Node.js per le route che scansionano |
| Linguaggio | TypeScript |
| Stile | Tailwind CSS v4 |
| Database | Supabase (Postgres), account dei progetti personali |
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
- **Un database diverso o nessun database.** Senza database non ci sono link condivisibili né cache; Supabase è già in uso nei progetti personali.

## Conseguenze

- cheerio e ipaddr.js sono dipendenze da approvare in M0 e M1, con verifica di nome e fonte ufficiale.
- Serve una API key di PageSpeed (Google Cloud), da creare in M5.
- La durata massima delle funzioni su Vercel limita il tempo di una scansione: si verifica in M0 sulla documentazione del piano in uso (ADR-0003).
