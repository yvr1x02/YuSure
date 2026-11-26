# MILESTONES — YuSure v1

Si lavora su **una milestone alla volta**: quella segnata come attiva. Ogni milestone termina con qualcosa che funziona e si può provare online. Ogni milestone si sviluppa su un branch `mN` e si chiude con una PR verso `main`.

**Regole per ogni milestone:**
- ogni nuova pagina entra nel controllo di accessibilità con axe (WCAG 2.2 AA) nello stesso commit che la aggiunge;
- ogni controllo nuovo ha test unitari sui casi ok, attenzione, problema e non verificato.

**Milestone attiva:** M4

## M0 — Fondamenta (completata il 2026-11-25)

- Progetto Next.js con TypeScript, Tailwind CSS v4 e lint (ADR-0001). Nome del pacchetto `yusure`.
- Vitest e Playwright configurati, con un test di esempio ciascuno e il controllo axe.
- `.gitignore` e `.env.example`.
- **Direzione visiva** in `docs/DESIGN.md`, ripresa dalla sezione Browse del portfolio: palette, font, tipografia, aspetto di un risultato del report. Approvata prima di scrivere i componenti.
- Layout di base, Home con il campo (ancora senza scansione) e pagina "Come funziona" con il testo di ADR-0002.
- Progetto Neon (piano Free, Francoforte) e progetto Vercel, con pubblicazione a ogni push e `DATABASE_URL` nelle variabili d'ambiente.
- Verifiche di ADR-0003: `after()` su Vercel e durata massima delle funzioni.
- Comandi compilati nel `CLAUDE.md`.

**Da verificare dopo il merge di M0:**
- L'indirizzo di produzione è pubblico, raggiungibile senza accesso a Vercel. Le anteprime protette vanno bene, la produzione no. *Verificato il 2026-11-25 dopo il merge della PR #1: `https://yusure.vercel.app/` e `/come-funziona` rispondono senza accesso; l'anteprima di `m0` rimanda al login.*
- Il deploy di produzione usa Node 22: la PR #1 è stata costruita con `engines.node` `>=22.12.0`, cioè con l'ultima versione disponibile; `22.x` arriva con la seconda PR di M0. *Verificato il 2026-11-25: il deploy di produzione della PR #3 è costruito con Node 22.x (`Node.js version changed from "26.x" to "22.x"`), ma con un avviso perché le impostazioni del progetto Vercel dicevano 26.x; portate a 22.x, il primo deploy di `m1` (`77919b2`) ha il log senza avvisi su engines.*

## M1 — Richieste sicure e primi controlli (completata il 2026-11-25)

- Modulo di richiesta sicura (ADR-0002), con tutti i test dei casi difficili.
- Normalizzazione dell'indirizzo inserito.
- Controlli: HTTPS, redirect da `http`, certificato e scadenza.
- Catalogo dei controlli: struttura dei testi per il titolare, dettagli tecnici, gravità e peso.
- Report mostrato subito dopo la scansione, senza salvataggio.
- Decidere `cacheComponents` e `partialPrefetching` con una prova, registrando la scelta in un ADR.
- Scansioni attive solo dove `SCAN_ENABLED` è `true`: Preview sì, Production no fino a M3.

**Da verificare dopo il merge di M1:**
- In produzione la Home mostra "YuSure è in costruzione" senza il form, e la Server Action rifiuta le richieste: `SCAN_ENABLED` non è impostata per Production. *Verificato il 2026-11-26: il deploy di produzione è quello della merge della PR #5 (`494d09b`); `https://yusure.vercel.app/` ha la frase "in costruzione" e nessun `<form>` né `<input>`; una chiamata diretta alla Server Action `scan` (ID letto dal JavaScript pubblico) con `example.com` risponde `{"status":"error","message":"YuSure è in costruzione: le scansioni arrivano a breve."}`.*
- In anteprima, con `SCAN_ENABLED=true` per Preview, una scansione vera da Vercel (fra1) completa i quattro controlli. *Parziale il 2026-11-26: sull'anteprima di `8a08417` l'utente ha completato una scansione fino al report (link `#check-httpRedirect` del riepilogo "Da sistemare subito"); il dettaglio dei singoli controlli non è stato registrato.*

## M2 — Sicurezza completa e punteggio (completata il 2026-11-26)

- Header di sicurezza, cookie, versioni esposte, contenuto misto (con cheerio).
- Calcolo dei punteggi (SPEC, "Punteggio") in funzioni pure testate.
- Report completo per la sezione Sicurezza: riepilogo "Da sistemare subito", dettagli tecnici apribili.
- I controlli sulla pagina usano la versione `http://` quando `https` non risponde o il certificato non è valido, con una nota nel report (SPEC, regole comuni).
- GitHub Action che a ogni push e a ogni PR esegue lint, typecheck, test unitari ed e2e.
- Istruzioni per impostare la protezione di `main` (si entra solo con una PR e i controlli verdi); la imposta l'utente su GitHub.

**Da verificare dopo il merge di M2:**
- La CI parte sul push in `main` della merge e finisce verde. *Verificato il 2026-11-26: run del push di `5cf113a` (merge della PR #6) verde, job `checks` in 60 s.*
- Protezione di `main` impostata seguendo il README: un `git push` diretto su `main` viene rifiutato. *Verificato il 2026-11-26 dalle API, non con un push: ruleset `main` (id 28153949) creato via API secondo il README, enforcement `active`, bypass list vuota; `GET rules/branches/main` restituisce `deletion`, `pull_request` (0 approvazioni), `required_status_checks` (`checks` da GitHub Actions, branch aggiornato) e `non_fast_forward`, con `current_user_can_bypass: never`. Il push diretto non è stato provato, per non rischiare di modificare `main`.*
- In produzione la Home resta "in costruzione" e la Server Action rifiuta le richieste (`SCAN_ENABLED` spenta fino a M3). *Verificato il 2026-11-26 sul deploy di `5cf113a`: frase "in costruzione", nessun `<form>` né `<input>`; la Server Action `scan`, chiamata direttamente con `example.com`, risponde "YuSure è in costruzione: le scansioni arrivano a breve."*

## M3 — Salvataggio, link e limiti (completata il 2026-11-26)

- Driver Postgres: `pg`, `@types/pg` e `@vercel/functions` (ADR-0001). La prova di avvio a freddo non è stata completata; la scelta segue le raccomandazioni di Neon e Vercel per Fluid compute.
- Tabelle `scans` e `scan_requests` con migrazioni (ADR-0003).
- Pagina `/report/[id]`, "Copia link", cache di 24 ore e "Rifai la scansione".
- Limite per IP e tetto globale, IP come hash con sale.
- Cancellazione degli hash scaduti a ogni scansione, più il cron giornaliero come rete di sicurezza: cancellazione entro 48 ore (ADR-0003).
- Accendere le scansioni in produzione: `SCAN_ENABLED=true` per Production su Vercel e nuovo deploy, solo dopo che limite per IP e tetto globale sono attivi e verificati.
- Decisioni del 2026-11-26, all'avvio di M3:
  - Connessione chiusa dal sito prima di qualsiasi risposta https (`connection_reset`): "Il sito risponde in HTTPS" è un problema se http sullo stesso host risponde, altrimenti non verificato; il timeout resta non verificato (SPEC).
  - La regola ESLint su cheerio e undici copre anche gli `import()` dinamici.
  - Database e migrazioni (ADR-0001): SQL a mano con un runner nostro in `.mjs`; un branch Neon per Production, Preview e Development, con `DATABASE_URL` e `DATABASE_URL_UNPOOLED` per ambiente; Postgres in Docker in locale e in CI. Nessuna migrazione prima che l'utente confermi che i branch Neon sono pronti.
  - Report, cache e limiti (ADR-0003): chiave della cache dominio più percorso; punteggi salvati alla scansione e frasi calcolate alla visualizzazione; 5 all'ora per IP e 100 al giorno in totale, con il limite per IP sotto `pg_advisory_xact_lock`; righe di `scan_requests` cancellate dopo 2 ore; cron protetto da `CRON_SECRET`; `noindex` sui report; `IP_HASH_SECRET` obbligatoria.
  - SPEC: sezione "Limiti noti", con gli `url(http://…)` nel CSS.
  - Header di sicurezza di YuSure in `next.config.ts`: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` e una CSP fissa, senza nonce (le pagine restano statiche, ADR-0004 non cambia), con la toolbar di Vercel permessa solo in anteprima.
  - Copertura minima del punteggio: se i controlli verificati pesano meno di metà della sezione, niente punteggio né giudizio; stessa regola per il totale (SPEC, "Punteggio").

**Verifiche del 2026-11-26 sulla prima parte di M3 (PR #7, merge `bd99242`):**
- Anteprima di `8a08417`, prova dell'utente: la toolbar di Vercel si carica e apre i commenti, nessun errore CSP in console, l'header `Content-Security-Policy` è quello previsto per Preview (con `https://vercel.live`).
- La PR #7, dopo il rebase su `main`, mostra solo i 6 commit di M3 e 18 file; CI verde su `8a08417` (71 s) e sul push in `main` di `bd99242` (64 s).
- Produzione, deploy di `bd99242`: `/` e `/come-funziona` mandano CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e `X-Frame-Options`; la CSP non contiene `vercel.live` e la toolbar non c'è; la Home resta "in costruzione" e la Server Action rifiuta le richieste.
- Branch `m2` e `m3` cancellati dopo il merge, in locale e su GitHub.

**Verifiche del 2026-11-26 sulla seconda parte di M3 (branch `m3`):**
- In locale, Postgres 18.7 in un container: lint e typecheck puliti; Vitest 378 su 378 con `TEST_DATABASE_URL`, 369 più 9 saltati senza; e2e 25 su 25 (axe sui report e sul 404, `X-Robots-Tag`, Home → report dalla cache, "Copia link"); build con `/report/[id]` in Partial Prerender. Senza `pg_advisory_xact_lock` il test con 8 richieste parallele fallisce: il lock serve e il test lo copre.
- CI su GitHub (`workflow_dispatch` su `34b111f`, run 45838648130): verde in 82 s, con i test sul database eseguiti sul service Postgres 18 (378 su 378, nessuno saltato).
- Variabili su Vercel controllate dalle API (nomi, ambiti e tipi, non i valori): `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `IP_HASH_SECRET` e `CRON_SECRET` Sensitive in Production e Preview; `SCAN_ENABLED=true` per tutti i branch di Preview.
- Migrazioni (`001_scans.sql`) applicate sui branch Neon dev, preview e production; su ognuno tabelle `scans`, `scan_requests`, `schema_migrations` e i 5 indici, Postgres 18.7; la seconda esecuzione non applica nulla.
- Anteprima di `34b111f` (fra1, database preview, `SCAN_LIMIT_DAILY=4` temporanea solo per `m3`):
  - `x-real-ip` e `x-forwarded-for` falsi e diversi a ogni richiesta: tre scansioni, un solo hash (ADR-0003);
  - report salvato (`example.com/4`: catalogo v1, 13 risultati, punteggio sicurezza 79) e aperto dal link in una sessione nuova, con `X-Robots-Tag: noindex`; un id inesistente mostra "Report non trovato" (200 con `noindex`, ADR-0003);
  - cache: `http://www.example.com/1/?da=mail` apre il report di `example.com/1`, senza contare la richiesta;
  - tetto globale: la quinta scansione è rifiutata ("per oggi"), senza salvare né contare;
  - limite per IP: con il tetto libero, la quinta richiesta passa e la sesta è rifiutata ("per un'ora");
  - nei log dell'anteprima nessun errore dell'app, solo l'avviso SSL di `pg` (ADR-0001).
- Pulizia dopo la prova: report e richieste di prova cancellati dal database preview; `SCAN_LIMIT_DAILY`, i due deploy di prova con il link di condivisione e `.env.preview.local` cancellati dall'utente.

**Da verificare dopo il merge di M3:**
- La CI parte sul push in `main` della merge e finisce verde. *Verificato il 2026-11-26: run 45848146899 del push di `b94442f` (merge della PR #8) verde in 86 s, e2e 25 su 25.*
- Produzione con le scansioni ancora spente: Home "in costruzione", `/report/<id inesistente>` con `noindex`, header di sicurezza. *Verificato il 2026-11-26 sul deploy di `b94442f` (`yusure.vercel.app`, fra1):*
  - *`/`: 200, "in costruzione", nessun `<form>`; `/come-funziona`: 200;*
  - *su tutte le pagine CSP con `frame-ancestors 'none'` e senza `vercel.live`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` e HSTS;*
  - *`/report/AAAAAAAAAAAAAAAAAAAAAA` (id valido, quindi una query vera sul database production) e `/report/sconosciuto` (id non valido, nessuna query): 200, "Report non trovato", `X-Robots-Tag: noindex` e meta `noindex` (ADR-0003);*
  - *`/api/cron/pulizia` senza segreto o con un segreto sbagliato: 401.*
  - *La Server Action non è stata chiamata direttamente: con il form spento la Home non contiene il riferimento all'azione; il rifiuto resta coperto dai test unitari.*
- Dopo `SCAN_ENABLED=true` in Production e il nuovo deploy: una scansione dell'utente salvata nel database production e la richiesta contata in `scan_requests`. *Verificato il 2026-11-26 dall'utente: scansioni in produzione di `yusure.vercel.app`, `anime-tracker-three.vercel.app` e `gemmahandmade.it`, report aperti; dal SQL Editor di Neon sul branch production, in `scans` le tre righe con quelle `cache_key` e in `scan_requests` 3 righe. Non ricontrollato da Claude.*

## M4 — SEO e accessibilità dall'HTML

- Controlli SEO della SPEC, compresi `robots.txt` e `sitemap.xml`.
- Controlli di accessibilità dall'HTML.

## M5 — Performance con PageSpeed

- API key di PageSpeed (la crea l'utente) e verifica della quota per il tetto globale.
- Esecuzione in due tempi con `after()` e aggiornamento della pagina del report.
- Core Web Vitals, opportunità di miglioramento, punteggio e controlli di accessibilità di Lighthouse.
- Togliere da "Come funziona" la riga "YuSure è in costruzione: le scansioni arrivano a breve".

## M6 — Passata di stile

- Revisione dell'aspetto di Home, Report e Come funziona rispetto a `docs/DESIGN.md`.
- Barra del punteggio prevista in `docs/DESIGN.md` ("Movimento"): sotto il numero fermo, si riempie una volta in 700 ms (`--duration-reveal`); con `prefers-reduced-motion` niente riempimento animato.
- Stati di caricamento, errori e casi limite curati.
- Firma "Un progetto di Yuri Impellizzeri" in fondo al report, con link al portfolio, senza invito a proporre lavori (ADR-0003).
- Nuova palette, da decidere insieme partendo dai colori di stato; poi aggiornare `docs/DESIGN.md`.
- Sfondo dinamico a tutta pagina con codice che si scrive: in Home gli header di risposta reali di YuSure; durante la scansione le richieste e le risposte del sito analizzato; nel report si ferma o resta appena visibile. Vincoli: pulsante di pausa (WCAG 2.2.2), fermo con `prefers-reduced-motion`, contrasto del testo misurato con lo sfondo attivo, prestazioni misurate con la CPU rallentata 4×. Cambia la direzione visiva approvata (`docs/DESIGN.md`, "Movimento"): va aggiornata prima di scriverlo.

**Da decidere prima di M7:** una CSP con `'unsafe-inline'` negli script diventa "attenzione" (da migliorare) invece di "ok"? Oggi il controllo guarda solo se la CSP c'è, mentre securityheaders.com penalizza `'unsafe-inline'`.

## M7 — Rifinitura

- Accessibilità, telefono a 320px, stati vuoti e di errore.
- Prova su una decina di siti reali di tipo diverso, con i risultati confrontati a mano.
- Su alcuni di quei siti, confronto dei risultati con securityheaders.com e PageSpeed Insights, con le differenze spiegate.
- Miglioramento possibile: CSP di YuSure con un nonce generato da `proxy.ts`, senza `'unsafe-inline'` negli script. Costi: tutte le pagine dinamiche, niente cache CDN per l'HTML, incompatibile con il Partial Prerendering, quindi va rivista ADR-0004.
- README finale con screenshot, link alla produzione e il racconto della protezione SSRF.
- `sslmode=verify-full` nelle stringhe di connessione, prima di aggiornare `pg` alla versione maggiore successiva (ADR-0001).

## Dopo la v1

- Inglese.
- PDF del report.
- Confronto con una scansione precedente dello stesso dominio.
- Passare dai Cron Jobs di Vercel a Vercel Schedules quando escono dalla beta (Vercel definisce i Cron Jobs "legacy").
