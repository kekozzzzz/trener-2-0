import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";
import { AuthNav } from "@/components/auth-nav";

// Общая шапка: вордмарк-ссылка на главную + навигация. Один компонент,
// чтобы шапка не расходилась по страницам.
export function PageHeader() {
  return (
    <header className="border-b border-border">
      {/* Мобайл: вордмарк и навигация в две центрированные строки — навигация
          (особенно у авторизованного) шире, чем влезает в одну строку на ≤375px,
          иначе шапка переполняется по горизонтали. От sm — одна строка. */}
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:justify-between sm:px-8">
        <Link href="/">
          <Wordmark />
        </Link>
        <AuthNav />
      </div>
    </header>
  );
}
