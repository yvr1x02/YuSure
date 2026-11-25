import localFont from "next/font/local";

// Self-hosted variable files, Latin, weight axis only; licences beside them (docs/DESIGN.md).

export const hanken = localFont({
  src: "./HankenGrotesk-Variable.woff2",
  variable: "--font-hanken",
  weight: "100 900",
});

export const bricolage = localFont({
  src: "./BricolageGrotesque-Variable.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
});
