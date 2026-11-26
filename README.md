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
