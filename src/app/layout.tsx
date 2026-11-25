import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YuSure",
  description: "Analizza la salute di un sito web: sicurezza, performance, SEO e accessibilità.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
