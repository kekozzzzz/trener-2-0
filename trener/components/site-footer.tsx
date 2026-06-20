import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";

// Юр-ссылки в подвале — требование модерации платёжного сервиса и 152-ФЗ:
// оферта, политика, возврат и реквизиты должны быть доступны с любой страницы.
const LEGAL_LINKS = [
  { href: "/legal/oferta", label: "Оферта" },
  { href: "/legal/privacy", label: "Конфиденциальность" },
  { href: "/legal/refund", label: "Возврат" },
  { href: "/legal/requisites", label: "Реквизиты" },
];

// Общий подвал сайта — один компонент, чтобы не дублировать по страницам.
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-8 py-8 font-mono text-label uppercase tracking-label text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
        <span>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
