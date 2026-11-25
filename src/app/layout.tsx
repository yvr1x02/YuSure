import type { Metadata } from "next";

import { bricolage, hanken } from "@/app/fonts/fonts";
import { SiteHeader } from "@/components/layout/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "YuSure",
  description: "Analizza la salute di un sito web: sicurezza, performance, SEO e accessibilità.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${hanken.variable} ${bricolage.variable}`}>
      <body>
        <a
          href="#contenuto"
          className="sr-only rounded-md bg-surface-raised px-4 py-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
        >
          Salta al contenuto
        </a>
        <SiteHeader />
        <main id="contenuto" className="mx-auto w-full max-w-page px-4 pb-16">
          {children}
        </main>
      </body>
    </html>
  );
}
