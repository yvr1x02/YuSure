# ADR-0004 — Cache Components e Partial Prefetching

**Stato:** accettato
**Data:** 2026-11-25

## Contesto

Il progetto è nato con `create-next-app` (Next.js 16.4.6), che attiva `cacheComponents` e `partialPrefetching` in `next.config.ts`. M1 chiedeva di decidere se tenerli con una prova, ora che esiste la prima parte dinamica: la scansione lanciata dalla Home con una Server Action.

Dalla documentazione installata (`node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`): lasciare `partialPrefetching` non impostato produce un avviso, e nella prossima versione maggiore le due funzioni saranno attive ovunque e le opzioni verranno tolte.

## La prova (M1, in locale)

Build di produzione e `next start` con le due opzioni attive e poi spente; `next dev` con le opzioni attive. Uno script Playwright ha caricato `/`, letto le richieste di prefetch del `<Link>` verso `/come-funziona`, cliccato e misurato la navigazione.

| | Entrambe attive | Entrambe spente |
|---|---|---|
| Build | riuscita, nessun avviso | riuscita |
| `/` e `/come-funziona` | statiche | statiche |
| Prefetch di `/come-funziona` dal link | struttura e pagina, 2 richieste | le stesse, più la pagina `/` già aperta |
| Richieste al clic, tempo di navigazione | 0, 79 ms | 0, 75 ms |
| Overlay di sviluppo | nessuna segnalazione, anche dopo la navigazione | non provato |
| Risultati della scansione in cache | no: nessun `use cache` nel codice, la Server Action gira a ogni invio | no |

## Decisione

Restano **attive entrambe**.

- Con le pagine di oggi, tutte statiche, la differenza è trascurabile, e la prova non ha mostrato problemi.
- Sono le impostazioni di partenza di Next.js e diventeranno obbligatorie: spegnerle ora vorrebbe dire riaccenderle più avanti.
- I risultati di una scansione non devono mai finire in una cache di Next.js: la cache di 24 ore dei report (ADR-0003) sta nel database, non in `use cache`.

## Alternative considerate

- **Spegnerle entrambe.** Scartata: nessun vantaggio misurabile oggi, e un passaggio di adozione da rifare alla prossima versione maggiore.
- **Solo `cacheComponents`, senza Partial Prefetching.** Scartata: la documentazione lo prevede solo durante la migrazione di un'app che aveva adottato Cache Components prima del Partial Prefetching.

## Conseguenze

- La prova vera su una pagina dinamica si rifà in **M3** con `/report/[id]`: parametri nell'URL, dati dal database, link "Copia link". Lì vanno ricontrollati gli avvisi di navigazione immediata in sviluppo, cosa entra nell'App Shell e la freschezza del report dopo "Rifai la scansione".
- Ogni dato letto a ogni richiesta (database, `cookies()`, `headers()`) va dietro `<Suspense>` o in una Server Action; un `use cache` sui risultati di una scansione è un errore.
