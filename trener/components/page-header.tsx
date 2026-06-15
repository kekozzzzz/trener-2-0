import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";
import { AuthNav } from "@/components/auth-nav";

// Общая шапка: вордмарк-ссылка на главную + навигация. Один компонент,
// чтобы шапка не расходилась по страницам.
export function PageHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
        <Link href="/">
          <Wordmark />
        </Link>
        <AuthNav />
      </div>
    </header>
  );
}
