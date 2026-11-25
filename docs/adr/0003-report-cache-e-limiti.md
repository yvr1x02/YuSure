# ADR-0003 — Report, cache, limiti e dati salvati

**Stato:** accettato, modificato il 2026-11-25 (database: Neon al posto di Supabase, ADR-0001)
**Data:** 2026-11-25

## Contesto

- I report devono avere un link condivisibile, quindi vanno salvati.
- Una scansione completa dura parecchi secondi: i controlli propri ne richiedono pochi, PageSpeed spesso 10–30 secondi.
- Lo scanner è pubblico e senza account: va protetto dagli abusi, e la quota giornaliera dell'API di PageSpeed è limitata.
- Senza account, l'unico dato personale coinvolto è l'IP di chi scansiona.

## Decisione

### Esecuzione in due tempi

1. La richiesta di scansione esegue i **controlli propri** (sicurezza, SEO, accessibilità dall'HTML), salva il report e risponde con il suo `id`. Il browser apre `/report/[id]`.
2. La **chiamata a PageSpeed** parte dopo la risposta (`after()` di Next.js) e completa il report quando arriva.
3. La pagina del report, finché la Performance non c'è, chiede lo stato a intervalli (ogni 3 secondi, al massimo per 90 secondi), poi mostra "non verificato" con il motivo.

Così il report compare in pochi secondi e il tempo di PageSpeed non blocca nessuno.

### Salvataggio

Una tabella `scans` su Neon:

| Campo | Contenuto |
|---|---|
| `id` | identificativo casuale non indovinabile, usato nel link |
| `domain` | dominio normalizzato (minuscolo, senza `www.`) |
| `url` | indirizzo analizzato dopo i redirect |
| `created_at` | data della scansione |
| `status` | `running`, `done`, `partial` |
| `checks` | risultati dei controlli (JSON), con la versione del catalogo |
| `scores` | punteggi per sezione e totale |

- **Il database si raggiunge solo dal server**, con la stringa di connessione in `DATABASE_URL`. Il browser non legge né scrive il database e non esiste un'API pubblica verso di esso, quindi non serve la Row Level Security.
- I report non scadono nella v1: riguardano siti pubblici e contengono solo ciò che quei siti mostrano a tutti.
- I risultati salvano dati grezzi (header letti, valori misurati), non frasi: le frasi del report vengono dal catalogo dei controlli al momento della visualizzazione, così una correzione dei testi vale anche per i report vecchi.

### Cache di 24 ore

Se lo stesso dominio è stato scansionato nelle ultime 24 ore, si apre quel report invece di farne uno nuovo. "Rifai la scansione" lo mostra con la data e spiega quando sarà possibile rifarla.

### Limiti

- **Per IP:** al massimo 5 scansioni nuove all'ora (i report già in cache non contano).
- **Globale:** un tetto giornaliero di scansioni nuove, sotto la quota di PageSpeed verificata in M5. Oltre il tetto si risponde con un messaggio chiaro.
- I limiti si contano in una tabella `scan_requests` su Neon: niente servizi in più.

### IP e privacy

- L'IP si salva solo come **hash con sale** (HMAC con un segreto del server) nella tabella dei limiti, mai nella tabella dei report.
- Le righe dei limiti scadute si cancellano **a ogni scansione**; un **cron giornaliero** di Vercel, protetto con `CRON_SECRET`, fa da rete di sicurezza quando non arrivano scansioni.
- Promessa pubblica (pagina "Come funziona"): l'hash dell'IP **si cancella entro 48 ore**.
- Nessun cookie di profilazione, nessuna analytics che salvi dati personali.

## Alternative considerate

- **Tutto in una sola richiesta, PageSpeed compreso.** Scartata: l'utente aspetta anche 30 secondi davanti a una pagina ferma, e la funzione rischia la durata massima di Vercel.
- **Una coda dedicata** (servizio esterno di code o job). Scartata per la v1: un servizio in più da configurare, quando `after()` basta per un solo compito dopo la risposta.
- **Limite di richieste con Redis/Upstash.** Scartato: un servizio in più. Con il traffico previsto una tabella Postgres basta; si rivede se diventa un collo di bottiglia.
- **Salvare l'IP in chiaro.** Scartato: non serve, l'hash basta per contare.
- **Report che scadono dopo 30 giorni.** Rimandato: il link deve restare valido mentre un cliente valuta la proposta.

## Conseguenze

- In M0 si verificano sulla documentazione di Next.js e Vercel installati: il comportamento di `after()` su Vercel e la durata massima delle funzioni nel piano in uso.
- Il catalogo dei controlli ha una versione: i report vecchi indicano con quale versione sono stati fatti.
- Il tetto globale e i 5 all'ora sono valori di partenza, configurabili da variabili d'ambiente.

## Verifiche M0: condizioni dei piani gratuiti

Lette il 2026-11-25, prima di creare qualsiasi risorsa. Sono condizioni di servizio, non consulenza legale: dove il testo è ambiguo lo dice.

### Vercel, piano Hobby

- **Uso consentito.** I Termini di servizio, §4 "Hobby Plan", limitano Hobby all'uso "personal or non-commercial". Vercel può rimuovere progetti Hobby senza preavviso. Fonte: [Terms of Service](https://vercel.com/legal/terms), aggiornati il 19 ottobre 2026.
- **"Commerciale" non è definito** in nessuna delle pagine lette (Termini, Acceptable Use Policy, Fair Use Guidelines, piani, prezzi). Le pagine di [piani](https://vercel.com/docs/plans) e [prezzi](https://vercel.com/pricing) descrivono Pro come il piano pensato anche per i freelance. Un report con il link "Contattami" per proporre lavori **non è trattato esplicitamente: il caso è ambiguo**.
- **Uso corretto.** Le [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines) (aggiornate il 12 novembre 2026) elencano tra i casi "Never fair use" anche **Scrapers** e **Penetration testing**, su tutti i piani. YuSure non è né l'uno né l'altro per come è progettato (ADR-0002: una pagina sola, su richiesta, solo controlli passivi), ma è un'interpretazione nostra: le linee guida non definiscono i due termini.
- **Durata massima delle funzioni:** su Hobby 300 secondi, predefinita e massima. Fonti: [piano Hobby](https://vercel.com/docs/plans/hobby) e [limiti](https://vercel.com/docs/limits).

### Neon, piano Free

- **Nessuna pausa del progetto.** Il compute si sospende dopo 5 minuti senza query, sul piano Free non si può disattivare, e si riattiva da solo alla query successiva "within a few hundred milliseconds". La documentazione non dà numeri più precisi. Fonte: [Scale to zero](https://neon.com/docs/introduction/scale-to-zero), aggiornata il 2026-11-04.
- **Inattività.** Le FAQ dei prezzi dicono che Neon non mette in pausa i progetti Free per inattività e che non c'è un passo di ripristino. Nessuna pagina letta prevede la cancellazione per inattività dei progetti Free su AWS (la regola dei 90 giorni riguarda solo le regioni Azure dismesse). Fonti: [prezzi](https://neon.com/pricing), aggiornata il 2026-11-04; [regioni](https://neon.com/docs/introduction/regions), aggiornata il 2026-11-21.
- **Limiti.** 100 CU-ore al mese per progetto (circa 400 ore a 0,25 CU), 1 GB di spazio per progetto, 5 GB di traffico in uscita al mese, 10 branch per progetto. Oltre le CU-ore o il traffico il compute resta sospeso fino al mese successivo; oltre lo spazio falliscono le scritture. Nessun limite cancella i dati. Fonte: [piani](https://neon.com/docs/introduction/plans), aggiornata il 2026-11-24.
- **Regione.** Francoforte è disponibile (`aws-eu-central-1`); la regione non si cambia dopo la creazione. Fonte: [regioni](https://neon.com/docs/introduction/regions).
- **Connessione.** Dalle funzioni serverless la stringa con pooling (host con `-pooler`); per le migrazioni la connessione diretta. Fonte: [connection pooling](https://neon.com/docs/connect/connection-pooling), aggiornata il 2026-11-14.
- **Conseguenza per YuSure:** un report aperto dopo un periodo senza traffico paga qualche centinaio di millisecondi di riattivazione, ma il link funziona sempre. Il rischio da tenere d'occhio è il tetto di CU-ore: il tetto globale di scansioni (M5) e la sospensione dopo 5 minuti lo tengono basso.

### Vercel, cron sul piano Hobby

- Una volta al giorno al massimo, con precisione di un'ora (±59 minuti), in UTC, solo sui deploy di produzione; nessun nuovo tentativo se fallisce. L'endpoint si protegge con `CRON_SECRET`, inviato da Vercel nell'header `Authorization: Bearer …`. I cron sono indicati come funzione "legacy" che verrà migrata a Schedules. Fonti: [Cron Jobs](https://vercel.com/docs/cron-jobs), aggiornata il 2026-09-16; [uso e prezzi](https://vercel.com/docs/cron-jobs/usage-and-pricing), aggiornata il 2026-07-15; [gestione](https://vercel.com/docs/cron-jobs/manage-cron-jobs), aggiornata il 2026-08-11.
- **Conseguenza:** quando non arrivano scansioni, la cancellazione dipende solo dal cron, che passa una volta al giorno con un'ora di tolleranza. Per questo la promessa è "entro 48 ore" e non "dopo 24 ore". **Vincolo per M3:** con una soglia di 24 ore il caso peggiore è circa 49 ore (24 di vita, fino a 24 ore e 59 minuti tra due passaggi del cron), quindi la soglia di cancellazione va scelta più bassa, in modo che la promessa delle 48 ore valga sempre.
