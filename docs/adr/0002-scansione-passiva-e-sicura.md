# ADR-0002 — Scansione passiva e richieste sicure

**Stato:** accettato
**Data:** 2026-11-25

## Contesto

YuSure fa richieste verso indirizzi scelti da chiunque. Questo crea due rischi diversi.

1. **Verso i siti scansionati.** Su un sito non proprio, senza permesso, si possono fare solo le richieste che farebbe un visitatore. Test attivi (cercare `/.git` o `/admin`, provare input nei form, scansionare porte) sono un'altra cosa, anche se fatti "a fin di bene".
2. **Verso YuSure stesso: SSRF.** Un server che scarica URL scelti dall'utente può essere usato per raggiungere ciò che dall'esterno non si vede: `localhost`, la rete interna, i servizi di metadati del cloud (`169.254.169.254`). Lo stesso vale se il dominio inserito risolve verso un IP privato, se un redirect porta a un indirizzo interno, o se il DNS cambia risposta tra il controllo e la connessione (DNS rebinding).

## Decisione

### Solo controlli passivi

YuSure legge solo ciò che il sito espone a qualsiasi visitatore. Per ogni scansione le richieste sono poche e prevedibili:

- la pagina inserita, in `https` e in `http` (per verificare il redirect);
- una connessione TLS per leggere il certificato;
- `robots.txt` e `sitemap.xml` del dominio;
- la chiamata a PageSpeed, che fa Google.

Le richieste si identificano con un `User-Agent` dedicato (`YuSureBot/1.0`, con il link a "Come funziona"). Mai: percorsi indovinati, input nei form, tentativi di accesso, porte diverse da 80 e 443.

### Il modulo di richiesta sicura

Tutte le richieste verso indirizzi dell'utente passano da un unico modulo, con queste regole:

1. **Schema e porta:** solo `http` e `https`, solo le porte 80 e 443. Niente credenziali nell'URL (`user:pass@`).
2. **Nome host:** si rifiutano gli indirizzi IP scritti direttamente e i nomi senza un dominio di primo livello (`localhost`, `intranet`).
3. **Risoluzione DNS e controllo degli IP:** si risolve il nome e si rifiuta la richiesta se **anche uno** degli IP restituiti non è un indirizzo pubblico (privati, loopback, link-local, riservati, multicast, IPv4 dentro IPv6, ecc.), con la classificazione di ipaddr.js.
4. **Connessione all'IP verificato:** la connessione usa l'IP appena controllato e non risolve il nome una seconda volta, così il DNS rebinding non funziona. Il TLS usa comunque il nome del dominio (SNI e verifica del certificato).
5. **Redirect seguiti a mano:** al massimo 5, e ogni passo ripete i controlli dal punto 1.
6. **Limiti:** timeout di 10 secondi per richiesta, corpo letto al massimo per 2 MB (oltre si interrompe), decompressione inclusa nel limite.
7. **Errori:** all'utente si dice cosa non va ("Questo indirizzo non è un sito pubblico") senza dettagli interni; i motivi tecnici restano nei log del server, senza dati personali.

Il modulo ha test unitari per ogni regola, compresi i casi difficili: IPv6, `::ffff:127.0.0.1`, IP in notazione decimale o esadecimale, redirect verso un IP privato, nomi che risolvono verso più IP misti.

## Alternative considerate

- **Lista di domini bloccati.** Scartata: si aggira con qualsiasi dominio che risolve verso un IP interno. Si controlla l'IP, non il nome.
- **Controllo dell'IP e poi `fetch` normale.** Scartata: il `fetch` risolve di nuovo il nome, e il DNS può rispondere diversamente (rebinding).
- **Scansioni attive su richiesta, con una spunta "il sito è mio".** Scartata: una spunta non dimostra niente. Una verifica vera della proprietà (file o record DNS) è fuori dalla v1.

## Conseguenze

- Il modulo di richiesta sicura è la prima cosa da costruire (M1), prima di qualsiasi controllo.
- Il meccanismo per connettersi all'IP verificato si sceglie in M1 sulla documentazione di Node.js e di undici della versione installata, e si prova con un test che simula una risposta DNS che cambia.
- Siti che stanno solo su porte diverse da 80 e 443 non sono analizzabili: è voluto.
- Questa decisione e le sue ragioni vanno raccontate nella pagina "Come funziona" e nel README: sono parte di ciò che il progetto dimostra.

## Da verificare all'implementazione

- Come forzare l'IP della connessione con il client HTTP di Node installato (opzione `lookup` o `connect` di undici, oppure `http`/`https` di Node).
- Che la connessione TLS per il certificato usi la stessa protezione.
