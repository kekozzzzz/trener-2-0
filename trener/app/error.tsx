"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// Граница ошибок уровня приложения (внутри корневого layout — globals.css/Tailwind доступны).
// Ловит транзиентные исключения РЕНДЕРА страниц: гонка первого запроса к БД или прогрев i18n
// после редиректа с волшебной ссылки (баг реального тестера 12.07 — «Что-то сломалось» на
// первом заходе по ссылке из письма, лечилось перезагрузкой). Раньше error.tsx не было
// вообще, и любое такое исключение всплывало до полноэкранного global-error.
//
// «Попробовать снова» — ЖЁСТКАЯ перезагрузка (window.location.reload): новый запрос подхватит
// уже записанную сессию-куку и прогретое соединение и пройдёт. reset() лишь повторил бы тот
// же упавший рендер без нового запроса — для транзиента он не помогает (это и видел тестер).
export default function AppError({
  error,
  reset: _reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app error boundary:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] site-wrap flex-col items-start justify-center px-8 py-16">
      <p className="font-mono text-label uppercase tracking-label text-muted-foreground">Ошибка</p>
      <h1 className="mt-4 text-h2">Что-то сорвалось</h1>
      <p className="mt-4 max-w-xl text-body text-muted-foreground">
        Твои турниры и разборы целы. Часто это разовый сбой при первом заходе - попробуй ещё раз.
        Если повторяется, напиши на{" "}
        <a href="mailto:support@whygrid.app" className="text-primary hover:underline">
          support@whygrid.app
        </a>
        .
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={cn(buttonVariants({ variant: "default" }))}
        >
          Попробовать снова
        </button>
        <a href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          На главную
        </a>
      </div>
    </main>
  );
}
