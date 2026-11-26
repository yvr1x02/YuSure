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

Una tabella `scans` su Neon. Lo schema reale è in [`migrations/`](../../migrations/); questa tabella lo descrive (allineata il 2026-11-26, M4):

| Campo | Contenuto |
|---|---|
| `id` | identificativo casuale non indovinabile (16 byte in base64url), usato nel link |
| `cache_key` | dominio normalizzato più percorso dell'indirizzo inserito: la chiave della cache di 24 ore (sotto) |
| `domain` | dominio normalizzato (minuscolo, senza `www.`) |
| `url` | la versione `https://` dell'indirizzo inserito, cioè quella analizzata, **prima** dei redirect; dove porta la pagina si legge nei dettagli tecnici dei controlli |
| `created_at` | data della scansione |
| `status` | `running`, `done`, `partial`; fino a M4 si scrive solo `done`, gli altri servono con PageSpeed (M5) |
| `checks` | JSON `{ catalogVersion, readOverHttp?, results }`: la versione del catalogo dei controlli, l'indirizzo http se la pagina è stata letta così, i risultati grezzi |
| `scores` | punteggi per sezione, calcolati al momento della scansione; il totale arriva con tutte le sezioni (M5) |

E una tabella `scan_requests` per il limite per IP: `ip_hash` (HMAC dell'IP, mai l'IP) e `created_at`.

- **Il database si raggiunge solo dal server**, con la stringa di connessione in `DATABASE_URL`. Il browser non legge né scrive il database e non esiste un'API pubblica verso di esso, quindi non serve la Row Level Security.
- I report non scadono nella v1: riguardano siti pubblici e contengono solo ciò che quei siti mostrano a tutti.
- I risultati salvano dati grezzi (header letti, valori misurati), non frasi: le frasi del report vengono dal catalogo dei controlli al momento della visualizzazione, così una correzione dei testi vale anche per i report vecchi.

### Cache di 24 ore

Se lo stesso indirizzo è stato scansionato nelle ultime 24 ore, si apre quel report invece di farne uno nuovo. "Rifai la scansione" lo mostra con la data e spiega quando sarà possibile rifarla.

- **Chiave della cache** (decisa il 2026-11-26, M3): dominio normalizzato più percorso, presi dall'indirizzo inserito (la cache si controlla prima di qualsiasi richiesta al sito). Lo schema non conta (`http://x.it` e `x.it` danno la stessa chiave), così come query string e frammento, e la barra finale è normalizzata. Prima la chiave era solo il dominio: così due pagine diverse dello stesso sito avrebbero avuto lo stesso report.

### Limiti

- **Per IP:** al massimo 5 scansioni nuove all'ora (i report già in cache non contano).
- **Globale:** un tetto giornaliero di scansioni nuove, sotto la quota di PageSpeed verificata in M5. Oltre il tetto si risponde con un messaggio chiaro.
- I limiti si contano su Neon: niente servizi in più.
- **Valori e conteggio** (decisi il 2026-11-26, M3):
  - si parte da 5 all'ora per IP e 100 al giorno in totale, letti da variabili d'ambiente;
  - il tetto globale si conta sulla tabella `scans`, sulle ultime 24 ore (non sul giorno di calendario);
  - `scan_requests` serve solo alla finestra oraria per IP: le righe più vecchie di 2 ore si cancellano a ogni scansione e dal cron;
  - il limite per IP si controlla e si registra nella stessa transazione, sotto `pg_advisory_xact_lock` sull'hash dell'IP, così due richieste in parallelo non lo superano.

### IP e privacy

- L'IP si salva solo come **hash con sale** (HMAC con un segreto del server) nella tabella dei limiti, mai nella tabella dei report.
- Il segreto è `IP_HASH_SECRET` ed è obbligatorio: se manca, le scansioni si rifiutano invece di salvare un hash senza segreto (deciso il 2026-11-26, M3).
- **L'IP viene da `x-real-ip`**, letto con `ipAddress()` di `@vercel/functions`. La documentazione di Vercel dice che `x-real-ip` è "identical to the `x-forwarded-for` header" e che `x-forwarded-for` viene sovrascritto "to prevent IP spoofing", ma non lo dice esplicitamente per `x-real-ip` ([Request headers](https://vercel.com/docs/headers/request-headers)). **Provato il 2026-11-26** nell'anteprima di `m3`: tre scansioni con `x-real-ip` e `x-forwarded-for` falsi e diversi a ogni richiesta (`198.51.100.1`–`3`) sono finite su un solo hash. Vercel sovrascrive entrambi gli header, e il limite per IP non si aggira mandando un IP falso. Fuori da Vercel (`next dev`, e2e) tutte le richieste contano come un solo client.
- Le righe dei limiti scadute si cancellano **a ogni scansione**; un **cron giornaliero** di Vercel, protetto con `CRON_SECRET`, fa da rete di sicurezza quando non arrivano scansioni.
- Promessa pubblica (pagina "Come funziona"): l'hash dell'IP **si cancella entro 48 ore**. Con la soglia di 2 ore il caso peggiore è circa 27 ore (2 di vita più fino a 24 ore e 59 minuti tra due passaggi del cron), dentro la promessa e quindi dentro il vincolo per M3 descritto sotto.
- **I report non si indicizzano** (deciso il 2026-11-26, M3): `/report/[id]` manda `noindex` sia nel meta `robots` sia nell'header `X-Robots-Tag`.
- **Un report inesistente risponde 200, non 404.** La pagina arriva in streaming (il report si legge dentro `<Suspense>`, ADR-0004), quindi lo stato è già partito quando `notFound()` scopre che il report non c'è. La pagina mostra "Report non trovato", e Next aggiunge comunque il meta `noindex`; anche l'header `X-Robots-Tag: noindex` c'è. È il comportamento documentato da Next (`not-found.md`: "After streaming starts, the status code remains 200"). Verificato in anteprima il 2026-11-26.
- Nessun cookie di profilazione, nessuna analytics che salvi dati personali.

## Alternative considerate

- **Tutto in una sola richiesta, PageSpeed compreso.** Scartata: l'utente aspetta anche 30 secondi davanti a una pagina ferma, e la funzione rischia la durata massima di Vercel.
- **Una coda dedicata** (servizio esterno di code o job). Scartata per la v1: un servizio in più da configurare, quando `after()` basta per un solo compito dopo la risposta.
- **Limite di richieste con Redis/Upstash.** Scartato: un servizio in più. Con il traffico previsto una tabella Postgres basta; si rivede se diventa un collo di bottiglia.
- **Salvare l'IP in chiaro.** Scartato: non serve, l'hash basta per contare.
- **Report che scadono dopo 30 giorni.** Rimandato: il link deve restare valido mentre un cliente valuta la proposta.

## Conseguenze

- In M0 si verificano sulla documentazione di Next.js e Vercel installati: il comportamento di `after()` su Vercel e la durata massima delle funzioni nel piano in uso.
- Il catalogo dei controlli ha una versione, salvata in `checks.catalogVersion`. Un report fatto con una versione precedente lo dice con una nota, perché alcuni controlli di oggi allora non c'erano.
- Il tetto globale e i 5 all'ora sono valori di partenza, configurabili da variabili d'ambiente.

## Verifiche M0: condizioni dei piani gratuiti

Lette il 2026-11-25, prima di creare qualsiasi risorsa. Sono condizioni di servizio, non consulenza legale: dove il testo è ambiguo lo dice.

### Vercel, piano Hobby

- **Uso consentito.** I Termini di servizio, §4 "Hobby Plan", limitano Hobby all'uso "personal or non-commercial". Vercel può rimuovere progetti Hobby senza preavviso. Fonte: [Terms of Service](https://vercel.com/legal/terms), aggiornati il 19 ottobre 2026.
- **"Commerciale" non è definito** in nessuna delle pagine lette (Termini, Acceptable Use Policy, Fair Use Guidelines, piani, prezzi). Le pagine di [piani](https://vercel.com/docs/plans) e [prezzi](https://vercel.com/pricing) descrivono Pro come il piano pensato anche per i freelance. Un report con il link "Contattami" per proporre lavori **non è trattato esplicitamente: il caso è ambiguo**.
- **Uso corretto.** Le [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines) (aggiornate il 12 novembre 2026) elencano tra i casi "Never fair use" anche **Scrapers** e **Penetration testing**, su tutti i piani. YuSure non è né l'uno né l'altro per come è progettato (ADR-0002: una pagina sola, su richiesta, solo controlli passivi), ma è un'interpretazione nostra: le linee guida non definiscono i due termini.
- **Decisione (2026-11-25): piano Hobby.** Per restare nell'uso personale e non commerciale, il report non invita a proporre lavori: al posto di "Contattami" c'è una firma neutra, "Un progetto di Yuri Impellizzeri", con link al portfolio. Si passa a Pro quando YuSure diventa uno strumento di vendita, e solo allora torna un invito esplicito.
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

## Verifiche M0: `after()` e durata delle funzioni

Verificate il 2026-11-25 sulla documentazione di Next.js 16.4.6 installata e su quella di Vercel. Non ancora provate su un deploy reale: la prova è in M5, quando `after()` si usa davvero.

- **`after()` è stabile** da Next.js 15.1 e non rende dinamica la route. Gira "for the platform's default or configured max duration of your route", configurabile con `maxDuration` nella configurazione del segmento. Fonte: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`.
- **Su Vercel `after()` si appoggia a `waitUntil`**: il lavoro continua dopo la risposta, ma con lo stesso limite di tempo della funzione, e se la funzione supera il limite viene interrotto. Il limite conta dall'arrivo della richiesta e comprende anche il lavoro dopo la risposta. Vercel consiglia `after()` a chi usa Next.js 15.1 o successivi. Fonte: [pacchetto @vercel/functions](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package), aggiornata il 2026-09-03.
- **Durata massima su Hobby, con Fluid compute (predefinito):** 300 secondi, sia come valore predefinito sia come massimo. Fonte: [durata delle funzioni](https://vercel.com/docs/functions/configuring-functions/duration), aggiornata il 2026-08-24.
- **Conseguenze per YuSure:**
  - controlli propri e chiamata a PageSpeed (spesso 10–30 secondi) stanno insieme ben dentro i 300 secondi della stessa richiesta: l'esecuzione in due tempi descritta sopra resta valida su Hobby;
  - in M5 si imposta `maxDuration` in modo esplicito sulla route di scansione, così il limite è scritto nel codice e non dipende dal piano;
  - con `cacheComponents` attivo, dentro `after()` chiamato da un Server Component non si possono usare `cookies()` o `headers()`: la scansione parte da un Route Handler o da una Server Function, dove sono permessi.
