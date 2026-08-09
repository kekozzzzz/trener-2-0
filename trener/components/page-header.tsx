import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";
import { AuthNav } from "@/components/auth-nav";
import { StatusBar } from "@/components/site/status-bar";

// Общая шапка: статус-строка + вордмарк-ссылка на главную + навигация. Один
// компонент, чтобы шапка не расходилась по страницам.
//
// Статус-строка (design-system.md §4.1 п. 1) обязательна на всех страницах: в ней
// живёт переключатель языка (из навигации он убран, чтобы не дублировался) и
// обещание «числа считает парсер» — правило 1 проекта видно на каждом экране.
export function PageHeader({ section }: { section?: string }) {
  return (
    <>
    <StatusBar section={section} />
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
    </>
  );
}
