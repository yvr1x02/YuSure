# YuSure

Scanner di salute per siti web: inserisci un indirizzo e ricevi un report in italiano semplice su sicurezza, performance, SEO e accessibilità di base, con un punteggio e un link da condividere.

Solo controlli passivi: YuSure legge quello che il sito mostra a qualsiasi visitatore, senza forzare nulla.

Progetto in sviluppo. Specifica in [docs/SPEC.md](docs/SPEC.md).

## Controlli automatici

A ogni pull request, a ogni push su `main` e a richiesta (`workflow_dispatch`), la GitHub Action [CI](.github/workflows/ci.yml) esegue lint, typecheck, test unitari ed e2e con axe, nel job `checks`.

### Protezione di `main`

Si imposta una volta sola su GitHub, dopo che `checks` ha completato almeno un run (altrimenti non compare fra i controlli selezionabili):

1. **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**.
2. **Ruleset name:** `main`. **Enforcement status:** Active. Nessuno nella **Bypass list**.
3. **Target branches** → **Add a target** → **Include default branch**.
4. In **Branch protections** seleziona:
   - **Restrict deletions** (già selezionata);
   - **Require a pull request before merging**, con **Required approvals** a 0: si entra solo con una PR;
   - **Require status checks to pass**: aggiungi `checks` con il pulsante **+** e, come sorgente, **GitHub Actions**; spunta **Require branches to be up to date before merging**;
   - **Block force pushes**.
5. **Create**.

Per controllare: un `git push` diretto su `main` viene rifiutato e una PR con `checks` rosso non si può unire.

## Database

Postgres su Neon, un branch per ambiente (ADR-0001). Le migrazioni sono file SQL in [`migrations/`](migrations/), applicati in ordine da [`scripts/migrate.mjs`](scripts/migrate.mjs): ognuno in una transazione, una volta sola, usando la connessione diretta `DATABASE_URL_UNPOOLED`.

```sh
npm run db:migrate   # legge .env.local; una variabile già esportata ha la precedenza
```

### Postgres per i test

I test sul database e gli e2e usano un Postgres 18 in un container, la stessa versione principale di Neon. Il database si svuota a ogni esecuzione, e per questo `TEST_DATABASE_URL` deve puntare a `localhost`.

```sh
docker run --rm -d --name yusure-test-db -p 127.0.0.1:5433:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=yusure postgres:18   # oppure podman run
export TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/yusure
npm test && npm run test:e2e
```

Senza `TEST_DATABASE_URL`:
- `npm test` salta i test sul database e lo segnala tra i test saltati;
- `npm run test:e2e` si ferma con un errore.

In CI il database è un service del job `checks`.
