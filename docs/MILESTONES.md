# MILESTONES — YuSure v1

Si lavora su **una milestone alla volta**: quella segnata come attiva. Ogni milestone termina con qualcosa che funziona e si può provare online. Ogni milestone si sviluppa su un branch `mN` e si chiude con una PR verso `main`.

**Regole per ogni milestone:**
- ogni nuova pagina entra nel controllo di accessibilità con axe (WCAG 2.2 AA) nello stesso commit che la aggiunge;
- ogni controllo nuovo ha test unitari sui casi ok, attenzione, problema e non verificato.

**Milestone attiva:** M0

## M0 — Fondamenta

- Progetto Next.js con TypeScript, Tailwind CSS v4 e lint (ADR-0001). Nome del pacchetto `yusure`.
- Vitest e Playwright configurati, con un test di esempio ciascuno e il controllo axe.
- `.gitignore` e `.env.example`.
- **Direzione visiva** in `docs/DESIGN.md`, ripresa dalla sezione Browse del portfolio: palette, font, tipografia, aspetto di un risultato del report. Approvata prima di scrivere i componenti.
- Layout di base, Home con il campo (ancora senza scansione) e pagina "Come funziona" con il testo di ADR-0002.
- Progetto Neon (piano Free, Francoforte) e progetto Vercel, con pubblicazione a ogni push e `DATABASE_URL` nelle variabili d'ambiente.
- Verifiche di ADR-0003: `after()` su Vercel e durata massima delle funzioni.
- Comandi compilati nel `CLAUDE.md`.

## M1 — Richieste sicure e primi controlli

- Modulo di richiesta sicura (ADR-0002), con tutti i test dei casi difficili.
- Normalizzazione dell'indirizzo inserito.
- Controlli: HTTPS, redirect da `http`, certificato e scadenza.
- Catalogo dei controlli: struttura dei testi per il titolare, dettagli tecnici, gravità e peso.
- Report mostrato subito dopo la scansione, senza salvataggio.
- Decidere `cacheComponents` e `partialPrefetching` con una prova, registrando la scelta in un ADR.

## M2 — Sicurezza completa e punteggio

- Header di sicurezza, cookie, versioni esposte, contenuto misto (con cheerio).
- Calcolo dei punteggi (SPEC, "Punteggio") in funzioni pure testate.
- Report completo per la sezione Sicurezza: riepilogo "Da sistemare subito", dettagli tecnici apribili.

## M3 — Salvataggio, link e limiti

- Driver Postgres approvato: `pg`, `@types/pg` e `@vercel/functions` (ADR-0001), con una prova sui tempi di avvio a freddo prima della scelta definitiva.
- Tabelle `scans` e `scan_requests` con migrazioni (ADR-0003).
- Pagina `/report/[id]`, "Copia link", cache di 24 ore e "Rifai la scansione".
- Limite per IP e tetto globale, IP come hash con sale.
- Cancellazione degli hash scaduti a ogni scansione, più il cron giornaliero come rete di sicurezza: cancellazione entro 48 ore (ADR-0003).

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

## M7 — Rifinitura

- Accessibilità, telefono a 320px, stati vuoti e di errore.
- Prova su una decina di siti reali di tipo diverso, con i risultati confrontati a mano.
- README finale con screenshot, link alla produzione e il racconto della protezione SSRF.

## Dopo la v1

- Inglese.
- PDF del report.
- Confronto con una scansione precedente dello stesso dominio.
