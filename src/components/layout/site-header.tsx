import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-page items-center justify-between px-4 py-6">
      <Link href="/" className="font-display text-xl font-extrabold tracking-tight uppercase">
        YuSure
      </Link>
      <nav aria-label="Principale">
        <Link href="/come-funziona" className="font-medium underline-offset-4 hover:underline">
          Come funziona
        </Link>
      </nav>
    </header>
  );
}
