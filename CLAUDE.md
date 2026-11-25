@AGENTS.md

# CLAUDE.md — YuSure

Istruzioni specifiche di questo progetto. Le regole generali (collaborazione, approvazioni, standard, workflow) arrivano dal Personal AI Brain caricato a livello utente: qui c'è solo ciò che vale per questo repository.

## Cos'è il progetto

Uno scanner di salute per siti web: si inserisce un indirizzo e si ottiene un report in italiano semplice su sicurezza, performance, SEO e accessibilità di base, con un punteggio e un link condivisibile. È un **progetto per il portfolio** e uno **strumento reale** per proporre lavori a negozi e ristoranti: conta la qualità dell'esecuzione e l'affidabilità dei risultati, non il numero di controlli.

Specifica: [docs/SPEC.md](docs/SPEC.md). Piano a milestone: [docs/MILESTONES.md](docs/MILESTONES.md). Decisioni: [docs/adr/](docs/adr/).

## Regole del progetto

- **Una milestone alla volta.** Lavora solo sulla milestone attiva in `docs/MILESTONES.md`; ciò che emerge fuori ambito va annotato nel report, non implementato.
- **Solo controlli passivi** (ADR-0002). Lo scanner legge ciò che il sito espone a qualsiasi visitatore. Mai test attivi: niente ricerca di file o percorsi nascosti, niente invio di input nei form, niente tentativi di accesso, niente scansione di porte. Un controllo nuovo che non rientra in questa regola è fuori ambito, anche se utile.
- **Lo scanner non deve diventare un'arma** (ADR-0002). Ogni richiesta verso un indirizzo inserito dall'utente passa dal modulo di richiesta sicura: solo `http`/`https` sulle porte 80 e 443, IP privati e riservati rifiutati dopo la risoluzione DNS e a ogni redirect, connessione all'IP verificato, timeout e limite di dimensione. Mai un `fetch` diretto verso un URL dell'utente fuori da quel modulo.
- **Segreti.** La stringa di connessione al database (`DATABASE_URL`, Neon), `CRON_SECRET` e la API key di PageSpeed stanno solo nelle variabili d'ambiente del server: mai il prefisso `NEXT_PUBLIC_`, mai nei log o negli URL. `.env.example` elenca quelle in uso.
- **Privacy** (ADR-0003). Nessun account. Si salvano solo l'indirizzo scansionato e i risultati. L'IP di chi scansiona serve solo al limite di richieste: si salva come hash con sale e si cancella entro 48 ore.
- **Linguaggio del report.** Ogni controllo ha una frase per il titolare del sito, senza gergo, e i dettagli tecnici apribili. I testi stanno in un unico posto (catalogo dei controlli), non sparsi nei componenti.
- **Risultati onesti.** Se un controllo non si può eseguire (timeout, errore, API non disponibile), il report lo dice: mai un "ok" o un "problema" dedotto da un errore.
- **Lingua.** Interfaccia in italiano. Codice, nomi di file e identificatori in inglese. Documentazione in italiano. Le cartelle delle route in `src/app/` sono indirizzi delle pagine, quindi in italiano (`/report/[id]`).
- **Commit.** Solo il titolo, senza descrizione. Nessuna riga `Co-Authored-By` di Claude.

## Comandi

Node 22 (`engines.node` è `22.x`: su Vercel decide la versione, ADR-0001). Le variabili d'ambiente stanno in `.env.local` (modello in `.env.example`).

| Comando | Cosa fa |
|---|---|
| `npm run dev` | server di sviluppo su `localhost:3000` |
| `npm run build` | build di produzione |
| `npm run lint` | ESLint |
| `npm run typecheck` | genera i tipi delle route e controlla TypeScript |
| `npm test` | test unitari con Vitest (`src/**/*.test.ts`) |
| `npm run test:e2e` | build, avvio sulla porta 3100 e test Playwright con axe (`e2e/`); la prima volta serve `npx playwright install chromium` |
