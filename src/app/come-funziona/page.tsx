import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Come funziona — YuSure",
  description: "Cosa controlla YuSure, cosa non fa e quali dati salva.",
};

export default function HowItWorks() {
  return (
    <article className="flex max-w-text flex-col gap-12 pt-12 sm:pt-20">
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-4xl font-light tracking-tight sm:text-5xl">
          Come funziona
        </h1>
        <p className="text-lg text-ink-muted">
          YuSure guarda un sito come lo guarderebbe un visitatore qualsiasi e ti dice, in parole
          semplici, cosa va bene e cosa si può migliorare.
        </p>
      </header>

      <section aria-labelledby="cosa-controlla" className="flex flex-col gap-4">
        <h2 id="cosa-controlla" className="text-xl font-semibold">
          Cosa controlla
        </h2>
        {/* "In arrivo" until the checks exist: SEO and accessibility in M4, speed in M5 (MILESTONES). */}
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong className="font-semibold">Sicurezza:</strong> se il sito usa una connessione
            protetta (HTTPS), se il certificato è valido e quando scade, e le impostazioni che il
            sito invia al browser per proteggere chi lo visita.
          </li>
          <li>
            <strong className="font-semibold">Velocità</strong> <Upcoming />: quanto ci mette la pagina a
            comparire e a rispondere su un telefono, misurato con PageSpeed Insights di Google.
          </li>
          <li>
            <strong className="font-semibold">Visibilità su Google</strong> <Upcoming />: titolo, descrizione,
            adattamento ai telefoni e se i motori di ricerca possono trovare la pagina.
          </li>
          <li>
            <strong className="font-semibold">Accessibilità</strong> <Upcoming />: se la pagina si può usare
            anche da chi vede poco o usa un lettore di schermo: testi delle immagini, etichette dei
            campi, contrasto dei colori.
          </li>
        </ul>
        <p>
          Analizza solo la pagina che inserisci, più due file pubblici che ogni sito mette a
          disposizione dei motori di ricerca: <code className="font-mono">robots.txt</code> e{" "}
          <code className="font-mono">sitemap.xml</code>.
        </p>
      </section>

      <section aria-labelledby="cosa-non-fa" className="flex flex-col gap-4">
        <h2 id="cosa-non-fa" className="text-xl font-semibold">
          Cosa non fa
        </h2>
        <p>YuSure non forza nulla. Fa solo le richieste che farebbe un visitatore:</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>non cerca file o pagine nascoste;</li>
          <li>non scrive nei moduli del sito;</li>
          <li>non prova ad accedere ad aree riservate;</li>
          <li>non bussa ad altre porte del server.</li>
        </ul>
        <p>
          Per ogni scansione le richieste sono poche e sempre le stesse: la pagina, in https e in
          http per vedere se si viene portati sulla versione protetta; il certificato;{" "}
          <code className="font-mono">robots.txt</code> e{" "}
          <code className="font-mono">sitemap.xml</code>. La velocità la misura Google. Le
          richieste si presentano con il nome <code className="font-mono">YuSureBot/1.0</code>,
          così chi gestisce il sito sa chi è passato.
        </p>
      </section>

      <section aria-labelledby="come-si-protegge" className="flex flex-col gap-4">
        <h2 id="come-si-protegge" className="text-xl font-semibold">
          Come si protegge YuSure
        </h2>
        <p>
          Uno strumento che visita indirizzi scelti da chiunque potrebbe essere usato per
          raggiungere ciò che da fuori non si vede: la rete interna del server o i servizi del
          fornitore cloud. Per questo, prima di ogni richiesta, YuSure:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            accetta solo indirizzi web normali (http e https, porte 80 e 443), senza nomi utente o
            password;
          </li>
          <li>
            controlla a quali indirizzi IP corrisponde il sito e si ferma se anche uno solo non è
            pubblico;
          </li>
          <li>
            si collega proprio all’indirizzo appena verificato, così una risposta diversa
            all’ultimo momento non lo inganna;
          </li>
          <li>ripete gli stessi controlli a ogni reindirizzamento, al massimo 5;</li>
          <li>si ferma dopo 10 secondi o dopo 2 MB scaricati.</li>
        </ul>
        <p>Se un indirizzo non è un sito pubblico, YuSure lo dice e non va avanti.</p>
      </section>

      <section aria-labelledby="cosa-si-salva" className="flex flex-col gap-4">
        <h2 id="cosa-si-salva" className="text-xl font-semibold">
          Cosa si salva
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            L’indirizzo analizzato e i risultati dei controlli, per poter condividere il report con
            un link. Un report contiene solo ciò che il sito mostra a tutti.
          </li>
          <li>
            Il tuo indirizzo IP non si salva così com’è: serve solo a limitare le scansioni a 5
            all’ora, viene trasformato in un codice da cui non si può risalire all’IP e si cancella
            entro 48 ore.
          </li>
          <li>Niente account, niente cookie di profilazione, niente statistiche con dati personali.</li>
        </ul>
        <p>
          Se la stessa pagina è stata analizzata nelle ultime 24 ore, YuSure mostra quel report
          invece di rifarlo.
        </p>
      </section>
    </article>
  );
}

function Upcoming() {
  return <span className="text-ink-muted">(in arrivo)</span>;
}
