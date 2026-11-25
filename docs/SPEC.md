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
- **Ogni difetto si conta una volta.** Un certificato non valido o scaduto è un problema solo per "Certificato valido": "Il sito risponde in HTTPS" resta ok e la scadenza non si valuta. Se la porta 443 è chiusa, il problema è di "Il sito risponde in HTTPS" e i controlli sul certificato risultano non verificati.
- **Tempo massimo.** Ogni richiesta ha 10 secondi (ADR-0002) e la scansione intera 30: allo scadere, i controlli non finiti risultano "non verificato" con il motivo.

### Sicurezza

| Controllo | Come | Gravità se manca |
|---|---|---|
| Il sito risponde in HTTPS | Richiesta a `https://`: basta una risposta, anche con un certificato rifiutato. Porta 443 che rifiuta la connessione: problema | Problema |
| Da `http://` si arriva a `https://` | Richiesta a `http://`; i redirect si seguono uno alla volta finché restano su `http://`, al massimo 5: ok se la catena arriva a `https://` con 301/308 (o 302/307). Porta 80 che rifiuta la connessione: attenzione; nessuna risposta entro il tempo: non verificato | Problema |
| Certificato valido | Connessione TLS: emesso per il dominio, non scaduto | Problema |
| Scadenza del certificato | Meno di 14 giorni: attenzione. Già scaduto: conta solo in "Certificato valido" | Attenzione |
| Nessun contenuto misto | Nell'HTML di una pagina `https`, risorse caricate da `http://` | Problema per script e stili, attenzione per immagini |
| `Strict-Transport-Security` | Header presente, `max-age` di almeno 6 mesi | Attenzione |
| `Content-Security-Policy` | Header presente | Consigliato |
| Protezione dal clickjacking | `X-Frame-Options` oppure `frame-ancestors` nella CSP | Attenzione |
| `X-Content-Type-Options: nosniff` | Header presente con quel valore | Consigliato |
| `Referrer-Policy` | Header presente | Consigliato |
| `Permissions-Policy` | Header presente | Consigliato |
| Cookie | Per ogni `Set-Cookie`: `Secure`, `HttpOnly`, `SameSite` | Attenzione |
| Versioni esposte | `Server` o `X-Powered-By` con un numero di versione | Attenzione |

"Consigliato" pesa poco: l'assenza della CSP su un piccolo sito è normale e non deve far crollare il punteggio.

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

- Ogni sezione va da 0 a 100: si parte da 100 e si toglie il peso dei controlli non superati, secondo la gravità.
- Performance e Accessibilità usano il punteggio di Lighthouse, corretto dai controlli propri dove ci sono.
- Il punteggio totale è la media pesata delle quattro sezioni: Sicurezza 35%, Performance 25%, SEO 25%, Accessibilità 15%.
- I controlli "non verificati" non contano: il punteggio si calcola sugli altri e il report dice che è parziale.
- Giudizio: 90–100 Buono, 60–89 Da migliorare, sotto 60 Critico.

## Fuori dalla v1

- Inglese.
- PDF del report.
- Account, storico delle proprie scansioni, confronto nel tempo.
- Analisi di più pagine dello stesso sito.
- Qualsiasi controllo attivo (ADR-0002).
