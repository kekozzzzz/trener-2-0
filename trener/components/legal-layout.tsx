import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { SiteFooter } from "@/components/site-footer";
import { LEGAL_UPDATED_AT } from "@/config/legal";

// Общий каркас юридических страниц (/legal/*): шапка + читаемая колонка текста +
// подвал. Один компонент, чтобы оферта/политика/возврат/реквизиты были единообразны.
export function LegalLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <Link href="/">
            <Wordmark />
          </Link>
          <AuthNav />
        </div>
      </header>

      <article className="mx-auto max-w-3xl space-y-8 px-8 py-16 sm:py-24">
        <div className="space-y-2">
          <h1 className="text-h1">{title}</h1>
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Редакция от {LEGAL_UPDATED_AT}
          </p>
        </div>
        {children}
      </article>

      <SiteFooter />
    </main>
  );
}

// Раздел юр-документа: заголовок + произвольное содержимое.
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-h3">{heading}</h2>
      {children}
    </section>
  );
}

// Абзац текста документа — приглушённый, читаемый.
export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-body text-muted-foreground">{children}</p>;
}

// Маркированный список пунктов документа.
export function LList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-body text-muted-foreground marker:text-muted-foreground">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
