# MILESTONES — YuSure v1

Si lavora su **una milestone alla volta**: quella segnata come attiva. Ogni milestone termina con qualcosa che funziona e si può provare online. Ogni milestone si sviluppa su un branch `mN` e si chiude con una PR verso `main`.

**Regole per ogni milestone:**
- ogni nuova pagina entra nel controllo di accessibilità con axe (WCAG 2.2 AA) nello stesso commit che la aggiunge;
- ogni controllo nuovo ha test unitari sui casi ok, attenzione, problema e non verificato.

**Milestone attiva:** M2

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
- In anteprima, con `SCAN_ENABLED=true` per Preview, una scansione vera da Vercel (fra1) completa i quattro controlli.

## M2 — Sicurezza completa e punteggio

- Header di sicurezza, cookie, versioni esposte, contenuto misto (con cheerio).
- Calcolo dei punteggi (SPEC, "Punteggio") in funzioni pure testate.
- Report completo per la sezione Sicurezza: riepilogo "Da sistemare subito", dettagli tecnici apribili.
- I controlli sulla pagina usano la versione `http://` quando `https` non risponde o il certificato non è valido, con una nota nel report (SPEC, regole comuni).
- GitHub Action che a ogni push e a ogni PR esegue lint, typecheck, test unitari ed e2e.
- Istruzioni per impostare la protezione di `main` (si entra solo con una PR e i controlli verdi); la imposta l'utente su GitHub.

## M3 — Salvataggio, link e limiti

- Driver Postgres approvato: `pg`, `@types/pg` e `@vercel/functions` (ADR-0001), con una prova sui tempi di avvio a freddo prima della scelta definitiva.
- Tabelle `scans` e `scan_requests` con migrazioni (ADR-0003).
- Pagina `/report/[id]`, "Copia link", cache di 24 ore e "Rifai la scansione".
- Limite per IP e tetto globale, IP come hash con sale.
- Cancellazione degli hash scaduti a ogni scansione, più il cron giornaliero come rete di sicurezza: cancellazione entro 48 ore (ADR-0003).
- Accendere le scansioni in produzione: `SCAN_ENABLED=true` per Production su Vercel e nuovo deploy, solo dopo che limite per IP e tetto globale sono attivi e verificati.

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
- Stati di caricamento, errori e casi limite curati.
- Firma "Un progetto di Yuri Impellizzeri" in fondo al report, con link al portfolio, senza invito a proporre lavori (ADR-0003).
- Nuova palette, da decidere insieme partendo dai colori di stato; poi aggiornare `docs/DESIGN.md`.
- Sfondo dinamico a tutta pagina con codice che si scrive: in Home gli header di risposta reali di YuSure; durante la scansione le richieste e le risposte del sito analizzato; nel report si ferma o resta appena visibile. Vincoli: pulsante di pausa (WCAG 2.2.2), fermo con `prefers-reduced-motion`, contrasto del testo misurato con lo sfondo attivo, prestazioni misurate con la CPU rallentata 4×. Cambia la direzione visiva approvata (`docs/DESIGN.md`, "Movimento"): va aggiornata prima di scriverlo.

## M7 — Rifinitura

- Accessibilità, telefono a 320px, stati vuoti e di errore.
- Prova su una decina di siti reali di tipo diverso, con i risultati confrontati a mano.
- Su alcuni di quei siti, confronto dei risultati con securityheaders.com e PageSpeed Insights, con le differenze spiegate.
- README finale con screenshot, link alla produzione e il racconto della protezione SSRF.

## Dopo la v1

- Inglese.
- PDF del report.
- Confronto con una scansione precedente dello stesso dominio.
