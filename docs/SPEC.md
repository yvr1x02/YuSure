# SPEC — YuSure v1

**Stato:** approvata (decisioni del 2026-11-25)

## Obiettivo

Uno scanner che analizza un sito web e produce un report comprensibile da chi il sito lo possiede, non solo da uno sviluppatore. Serve a due cose:

1. **Portfolio:** mostrare lavoro di backend, sicurezza applicativa e cura del frontend.
2. **Lavoro reale:** dare a un titolare (negozio, ristorante) un report con i problemi del suo sito, da cui parte una proposta.

Pubblico del report: prima il titolare, poi lo sviluppatore. Ogni risultato ha una frase semplice e, sotto, i dettagli tecnici apribili.

## Ambito della v1

- **Solo italiano.** L'inglese è previsto dopo la v1.
- **Nessun account.** Chiunque può scansionare un sito; ogni report ha un link pubblico non indovinabile.
- **Una pagina sola:** si analizza l'indirizzo inserito, più `robots.txt` e `sitemap.xml` del dominio. Nessuna esplorazione delle altre pagine.
- **Solo controlli passivi** (ADR-0002).

## Schermate

### 1. Home

- Campo per l'indirizzo e pulsante "Analizza". Si accetta anche senza `https://` (`trattoriadamario.it`).
- Una riga che spiega cosa fa YuSure e che non forza nulla, con link a "Come funziona".
- Errori comprensibili: indirizzo non valido, sito non raggiungibile, troppe scansioni.

### 2. Report (`/report/[id]`)

- In testa: dominio, data della scansione, **punteggio da 0 a 100** e giudizio a parole ("Buono", "Da migliorare", "Critico").
- Quattro sezioni: **Sicurezza, Performance, SEO, Accessibilità**, ognuna con il suo punteggio.
- Per ogni controllo:
  - esito: ok, attenzione, problema, oppure "non verificato" con il motivo;
  - frase per il titolare (cosa significa e perché conta);
  - "Dettagli tecnici" apribile: valori letti, cosa ci si aspettava, link alla documentazione (MDN o web.dev).
- I problemi gravi compaiono per primi in un riepilogo "Da sistemare subito".
- I risultati che arrivano dopo (Performance, ADR-0003) mostrano uno stato di caricamento e si completano da soli.
- Pulsante "Copia link" del report e "Rifai la scansione" (soggetto alla cache di 24 ore).
- In fondo, discreta, una firma neutra: "Un progetto di Yuri Impellizzeri", con link al portfolio. Nessun invito a proporre lavori finché YuSure è sul piano Hobby di Vercel (ADR-0003).

### 3. Come funziona (`/come-funziona`)

Cosa controlla YuSure, cosa **non** fa (niente test attivi, niente accessi, niente ricerca di file nascosti) e cosa si salva (ADR-0003).

## I controlli della v1

Il peso di ogni controllo e le soglie stanno nel catalogo dei controlli nel codice; qui c'è l'elenco e la gravità predefinita.

Regole comuni (decise in M1):

- **Quale versione si analizza.** Sempre `https://` più il percorso inserito, anche se l'indirizzo è scritto con `http://`; `http://` serve al controllo del redirect. Se `https` non risponde o il certificato non è valido, i controlli sulla pagina (header, HTML) usano la versione `http://` e il report lo dice in una nota. "Non verificato" solo se non risponde nessuna delle due.
  Dettagli decisi in M2: "non risponde" vuol dire connessione rifiutata, chiusa dal sito prima di rispondere o fallita, oppure tempo scaduto; se `https` ha risposto ma la pagina non si legge (oltre 2 MB, formato illeggibile) non si ripiega. Si usa l'ultima risposta della catena `http://` già letta per il redirect, senza richieste in più; se la catena porta a `https://`, nessuna pagina è leggibile. Anche una pagina `https` che rimanda a `http://` conta come letta in http. Con la pagina letta in http, HSTS e contenuto misto risultano non verificati: valgono solo per la versione protetta.
- **Ogni difetto si conta una volta.** Un certificato non valido o scaduto è un problema solo per "Certificato valido": "Il sito risponde in HTTPS" resta ok e la scadenza non si valuta. Se la porta 443 è chiusa, il problema è di "Il sito risponde in HTTPS" e i controlli sul certificato risultano non verificati.
- **Tempo massimo.** Ogni richiesta ha 10 secondi (ADR-0002) e la scansione intera 30: allo scadere, i controlli non finiti risultano "non verificato" con il motivo.

### Sicurezza

| Controllo | Come | Gravità se manca |
|---|---|---|
| Il sito risponde in HTTPS | Richiesta a `https://`: basta una risposta, anche con un certificato rifiutato. Porta 443 che rifiuta la connessione: problema. Connessione chiusa dal sito prima di qualsiasi risposta (`ECONNRESET`, `EPIPE`, `ECONNABORTED`, durante l'handshake TLS o subito dopo): problema se `http://` sullo stesso host risponde, altrimenti non verificato (deciso in M3). Tempo scaduto: non verificato | Problema |
| Da `http://` si arriva a `https://` | Richiesta a `http://`; i redirect si seguono uno alla volta finché restano su `http://`, al massimo 5: ok se la catena arriva a `https://` con 301/308 (o 302/307). Porta 80 che rifiuta la connessione: attenzione; nessuna risposta entro il tempo: non verificato | Problema |
| Certificato valido | Connessione TLS: emesso per il dominio, non scaduto | Problema |
| Scadenza del certificato | Meno di 14 giorni: attenzione. Già scaduto: conta solo in "Certificato valido" | Attenzione |
| Nessun contenuto misto | Nell'HTML di una pagina `https`, risorse caricate da `http://` (anche tramite `<base>`). Script, stili, iframe, `object` ed `embed`: problema; immagini, video, audio e icone: attenzione. Con `upgrade-insecure-requests` nella CSP: ok, con le risorse elencate nei dettagli. Vedi "Limiti noti" | Problema per script e stili, attenzione per immagini |
| `Strict-Transport-Security` | Header presente, `max-age` di almeno 6 mesi (15768000 secondi); con header ripetuti vale il primo | Attenzione |
| `Content-Security-Policy` | Header presente, oppure `<meta http-equiv="Content-Security-Policy">` (dettagli: "CSP via meta"). *Deviazione approvata in M2: la SPEC chiedeva solo l'header; il meta conta perché i browser lo applicano.* `Report-Only` non conta | Consigliato |
| Protezione dal clickjacking | `X-Frame-Options` (`DENY` o `SAMEORIGIN`) oppure `frame-ancestors` nell'header CSP; nel `<meta>` non conta, perché i browser la ignorano | Attenzione |
| `X-Content-Type-Options: nosniff` | Header presente con quel valore | Consigliato |
| `Referrer-Policy` | Header presente | Consigliato |
| `Permissions-Policy` | Header presente | Consigliato |
| Cookie | Per ogni `Set-Cookie`: `Secure`, `HttpOnly`, `SameSite`. Nei dettagli il nome del cookie, mai il valore | Attenzione |
| Versioni esposte | `Server` o `X-Powered-By` con un numero di versione | Attenzione |

"Consigliato" pesa poco: l'assenza della CSP su un piccolo sito è normale e non deve far crollare il punteggio.

### Limiti noti

- **CSS:** il controllo del contenuto misto non legge gli `url(http://…)` nel CSS, quindi sfuggono sfondi e font caricati senza https. Nei fogli di stile esterni leggerli vorrebbe dire scaricare altri file, fuori dalle richieste previste (ADR-0002); nei blocchi `<style>` e negli attributi `style`, che sono già nell'HTML, è un limite del controllo attuale.

### Performance

Dall'API di PageSpeed Insights (Lighthouse), per mobile:

- punteggio Performance di Lighthouse;
- **LCP** (buono ≤ 2,5 s), **CLS** (buono ≤ 0,1) dai dati di laboratorio;
- **INP** (buono ≤ 200 ms) e i valori reali solo se l'API restituisce i dati degli utenti di Chrome; se mancano, il report lo dice;
- le 3 opportunità di miglioramento con il risparmio maggiore.

### SEO

| Controllo | Gravità se manca |
|---|---|
| `<title>` presente, 10–60 caratteri | Problema se manca, attenzione se fuori misura |
| `<meta name="description">`, 50–160 caratteri | Attenzione |
| `<meta name="viewport">` | Problema |
| `<html lang>` | Attenzione |
| Un solo `<h1>` | Attenzione |
| Tag Open Graph (`og:title`, `og:description`, `og:image`) | Consigliato |
| `link rel="canonical"` | Consigliato |
| `robots.txt` raggiungibile e che non blocca tutto | Attenzione |
| `sitemap.xml` raggiungibile (anche se indicata in `robots.txt`) | Consigliato |
| Dati strutturati schema.org (JSON-LD) | Consigliato |
| La pagina non è esclusa dai motori (`noindex`) | Problema |

### Accessibilità

- Dall'HTML: immagini senza `alt`, campi dei form senza etichetta, link e pulsanti senza testo.
- Da Lighthouse (stessa chiamata della Performance): punteggio Accessibilità e i controlli falliti, compreso il contrasto.

## Punteggio

- Ogni sezione va da 0 a 100: si parte da 100 e si toglie il peso dei controlli non superati, secondo l'esito: un problema toglie tutto il peso, un'attenzione metà. I pesi stanno nel catalogo; quelli di Sicurezza sommano a 100.
- Formula (decisa in M2): `arrotonda(100 × (pesi verificati − punti persi) ÷ pesi verificati)`, dove "pesi verificati" è la somma dei pesi dei controlli non "non verificati". Esempio: 19 punti persi su 100 danno 81; se il controllo del redirect (peso 12) non si può eseguire, 19 su 88 danno 78, parziale.
- Performance e Accessibilità usano il punteggio di Lighthouse, corretto dai controlli propri dove ci sono.
- Il punteggio totale è la media pesata delle quattro sezioni: Sicurezza 35%, Performance 25%, SEO 25%, Accessibilità 15%. Si calcola dai punteggi delle sezioni già arrotondati; una sezione senza punteggio esce dalla media, i pesi delle altre si ricalcolano e il totale è parziale. Se le sezioni con un punteggio pesano meno della metà (meno di 50 su 100), niente totale. Si mostra da M5, quando ci sono tutte le sezioni.
- I controlli "non verificati" non contano: il punteggio si calcola sugli altri e il report dice che è parziale.
- **Copertura minima** (decisa in M3): se i controlli verificati di una sezione pesano meno della metà del peso totale della sezione, la sezione non ha né punteggio né giudizio. Il report scrive "Punteggio non disponibile" con il motivo: quanti controlli non si sono potuti eseguire, su quanti. Esattamente la metà basta. Caso che l'ha fatta nascere: `neverssl.com` il 2026-11-26, con https che chiude la connessione e http in timeout, aveva verificati solo i due controlli sul certificato (24 su 100) e risultava "100, Buono".
- Giudizio, sul numero arrotondato: 90–100 Buono, 60–89 Da migliorare, sotto 60 Critico.
- "Consigliato" non è un esito: nel report è un'attenzione con un peso basso. Gli esiti restano quattro.

## Fuori dalla v1

- Inglese.
- PDF del report.
- Account, storico delle proprie scansioni, confronto nel tempo.
- Analisi di più pagine dello stesso sito.
- Qualsiasi controllo attivo (ADR-0002).
