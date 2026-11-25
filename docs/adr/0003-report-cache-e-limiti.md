# ADR-0003 — Report, cache, limiti e dati salvati

**Stato:** accettato
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

Una tabella `scans` su Supabase:

| Campo | Contenuto |
|---|---|
| `id` | identificativo casuale non indovinabile, usato nel link |
| `domain` | dominio normalizzato (minuscolo, senza `www.`) |
| `url` | indirizzo analizzato dopo i redirect |
| `created_at` | data della scansione |
| `status` | `running`, `done`, `partial` |
| `checks` | risultati dei controlli (JSON), con la versione del catalogo |
| `scores` | punteggi per sezione e totale |

- **Row Level Security attiva senza policy pubbliche:** il browser non legge né scrive il database. Tutto passa dal server, con la chiave di Supabase con privilegi.
- I report non scadono nella v1: riguardano siti pubblici e contengono solo ciò che quei siti mostrano a tutti.
- I risultati salvano dati grezzi (header letti, valori misurati), non frasi: le frasi del report vengono dal catalogo dei controlli al momento della visualizzazione, così una correzione dei testi vale anche per i report vecchi.

### Cache di 24 ore

Se lo stesso dominio è stato scansionato nelle ultime 24 ore, si apre quel report invece di farne uno nuovo. "Rifai la scansione" lo mostra con la data e spiega quando sarà possibile rifarla.

### Limiti

- **Per IP:** al massimo 5 scansioni nuove all'ora (i report già in cache non contano).
- **Globale:** un tetto giornaliero di scansioni nuove, sotto la quota di PageSpeed verificata in M5. Oltre il tetto si risponde con un messaggio chiaro.
- I limiti si contano in una tabella `scan_requests` su Supabase: niente servizi in più.

### IP e privacy

- L'IP si salva solo come **hash con sale** (HMAC con un segreto del server) nella tabella dei limiti, mai nella tabella dei report.
- Le righe dei limiti più vecchie di 24 ore si cancellano. Il meccanismo (cancellazione a ogni scansione o job pianificato) si sceglie in M3.
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
