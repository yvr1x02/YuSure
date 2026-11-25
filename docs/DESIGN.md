# DESIGN — Direzione visiva

**Stato:** approvata (2026-11-25)

YuSure riprende la sezione Browse del portfolio ("lo studio di giorno": carta, inchiostro, impaginazione editoriale) e la adatta a uno strumento: si legge un report, lo si mostra a un cliente, si agisce. Fonte: `Portfolio-main`, `src/app/globals.css` e `docs/design/design-system.md`.

## Principi

1. **Leggibilità prima dell'estetica.** Un colore che non supera WCAG 2.2 AA non è disponibile.
2. **Se togliendolo non peggiora nulla, non c'è.** Ogni bordo, ombra o animazione deve giustificarsi.
3. **Gerarchia con spazio e dimensione**, non con riquadri e decorazioni.
4. **Niente aspetta il movimento.** Tutto è completo senza JavaScript e con `prefers-reduced-motion`.

## Superficie

Solo tema chiaro nella v1. Carta avorio come superficie principale, sabbia come seconda superficie.

## Colore

I componenti usano solo i token semantici, mai i valori grezzi. Niente valori arbitrari di Tailwind.

### Valori grezzi (dal portfolio)

| Nome | Valore | Uso |
|---|---|---|
| `ivory` | `#f5f1e9` | carta |
| `sand` | `#e4d9c9` | seconda superficie |
| `sand-deep` | `#d6c8b4` | linee sottili, solo decorative |
| `umber-900` | `#28231f` | inchiostro |
| `umber-700` | `#5b524a` | inchiostro attenuato |
| `umber-600` | `#6e665e` | inchiostro tenue |
| `copper-300` | `#cf946d` | fondo accento, hover |
| `copper-400` | `#c4875f` | fondo accento |
| `copper-800` | `#7e4c30` | accento come testo |

### Colori di stato (nuovi)

| Esito | Valore | Su avorio | Su sabbia |
|---|---|---|---|
| Ok | `#3d6b45` | 5,50:1 | 4,45:1 |
| Attenzione | `#875a12` | 5,32:1 | 4,30:1 |
| Problema | `#a1121c` | 7,12:1 | 5,75:1 |
| Non verificato | `#6e665e` + bordo tratteggiato | 5,00:1 | 4,04:1 |

Su sabbia ok, attenzione e non verificato non superano 4,5:1: lì si usano solo per icone e testo grande. **L'esito non è mai affidato al solo colore:** sempre icona e parola (WCAG 1.4.1).

### Token semantici

| Token | Valore | Contrasto su avorio / sabbia |
|---|---|---|
| `surface` | `ivory` | — |
| `surface-raised` | `sand` | — |
| `ink` | `umber-900` | 13,80 / 11,16 |
| `ink-muted` | `umber-700` | 6,78 / 5,48 |
| `ink-subtle` | `umber-600` | 5,00 / 4,04 (su sabbia solo testo grande) |
| `ink-accent` | `copper-800` (link, sottolineati) | 6,29 / 5,08 |
| `fill-accent` / `fill-accent-hover` | `copper-400` / `copper-300`, con testo `ink` | 5,17 / 6,01 |
| `edge-subtle` | `sand-deep` (decorativo) | — |
| `edge` | `umber-700` | 6,78 |
| `focus-ring` | `umber-900` | 13,80 |
| `status-ok`, `status-warn`, `status-bad`, `status-unknown` | colori di stato | vedi sopra |

Ocra (attenzione) e rame (link) sono tonalità vicine: i link si distinguono per la sottolineatura, gli esiti per icona ed etichetta.

## Tipografia

- **General Sans** (ITF Free Font License): testo e interfaccia. 400 testo, 500 etichette e pulsanti, 600 titoli piccoli. Niente 700.
- **Bricolage Grotesque** (SIL OFL 1.1): solo display.
  - 800 maiuscolo: il nome YuSure e il **punteggio**.
  - 300: il **giudizio** ("Buono", "Da migliorare", "Critico") e le frasi grandi.
  - 200: i **numeri di capitolo** delle sezioni: 01 Sicurezza, 02 Performance, 03 SEO, 04 Accessibilità.
- **Monospace di sistema** (`ui-monospace`, nessun download): valori tecnici, header, millisecondi.
- Font in locale con `next/font/local`, file variabili `.woff2`, licenze accanto ai file.
- Scala dal portfolio: testo con rapporto 1,125 (`xs`–`xl`), display con rapporto ~1,25. Tracking più stretto al crescere della dimensione.

## Impaginazione

- Una colonna di 48rem; testo al massimo 68 caratteri per riga.
- Spazio e dimensione separano le parti; linee sottili (`edge-subtle`) solo dove lo spazio non basta.
- Il riepilogo "Da sistemare subito" su `surface-raised`: è la prima cosa da leggere.
- Header: YuSure in Bricolage 800 e il link "Come funziona". Niente testata a folio.
- Raggi: 10px campi, 12px pulsanti, 16px pannelli.
- Funziona a 320px di larghezza senza scorrimento orizzontale.

## Un risultato del report

```
● Problema   Il sito non passa da http a https
             Chi scrive l'indirizzo senza "https" resta su una versione non protetta.
             ▸ Dettagli tecnici
```

- Esito: icona + parola nel colore di stato.
- Frase per il titolare in `ink`, spiegazione in `ink-muted`.
- "Dettagli tecnici" con `<details>`/`<summary>` nativi: valori letti in monospace, valore atteso, link a MDN o web.dev.
- "Non verificato" dice sempre il motivo.

## Movimento

Curve e durate dal portfolio:

| Token | Valore | Uso |
|---|---|---|
| `--ease-state` | `cubic-bezier(0.4, 0, 0.2, 1)` | hover, focus, cambi di stato |
| `--ease-reveal` | `cubic-bezier(0.16, 1, 0.3, 1)` | l'unica comparsa |
| `--duration-hover` | 160ms | hover in entrata |
| `--duration-unhover` | 220ms | hover in uscita |
| `--duration-release` | 380ms | la luce del bordo che si spegne |
| `--duration-reveal` | 700ms | barra del punteggio |
| `--duration-reduced` | 200ms | tutto, con movimento ridotto |

- Pressione di un pulsante: `translateY(1px)` immediato, risalita in 190ms.
- Il punteggio è un numero fermo: **niente conteggio**. La barra sotto si riempie una volta, 700ms.
- Performance in attesa: "In corso…" con una pulsazione lenta del segnaposto.
- Con `prefers-reduced-motion: reduce`: niente pulsazione, niente spostamenti, solo dissolvenze di 200ms.

## Cosa non si prende da Browse

Grana, vignettatura, cielo che cambia con lo scorrimento, testo che si compone da caratteri casuali, parole che entrano una alla volta, testata a folio, interruttore del movimento (basta `prefers-reduced-motion`), tema scuro.
