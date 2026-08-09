"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Мини-диалог в первом экране (заказ Артёма 2026-08-09: «первое, что человек увидит,
// должно дать интерес пощупать»).
//
// Показывает механизм продукта в миниатюре: тренер задаёт вопрос → ты выбираешь ответ →
// тренер не хвалит и не ругает, а спрашивает дальше. Человек участвует до регистрации
// и за пять секунд понимает, чем это отличается от «готового совета».
//
// Честность: это помечено как ПРИМЕР диалога, а не как чей-то настоящий разбор.
// Вопрос и первая реплика — из реального разбора (те же тексты, что в секции «Как
// выглядит разговор»), вторая ветка написана в том же ключе для второго варианта ответа.
export function HeroDemo({
  question,
  prompt,
  answers,
  replies,
  youLabel,
  coachLabel,
  exampleLabel,
  afterText,
  retryLabel,
}: {
  question: string;
  prompt: string;
  /** Два варианта ответа игрока. */
  answers: [string, string];
  /** Реплика тренера на каждый из вариантов. */
  replies: [string, string];
  youLabel: string;
  coachLabel: string;
  exampleLabel: string;
  afterText: string;
  retryLabel: string;
}) {
  const [picked, setPicked] = useState<0 | 1 | null>(null);

  return (
    <div className="mt-6 border-l-2 border-primary pl-4">
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-label uppercase tracking-label text-primary">{coachLabel}</p>
        <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {exampleLabel}
        </p>
      </div>
      <p className="mt-2 text-body text-foreground">{question}</p>

      {picked === null ? (
        <div className="mt-4">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            {prompt}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {answers.map((answer, index) => (
              <button
                key={answer}
                type="button"
                onClick={() => setPicked(index as 0 | 1)}
                className={cn(
                  "border border-border bg-card px-4 py-3 text-left text-small text-foreground",
                  "transition-colors duration-150 hover:border-primary hover:text-primary"
                )}
              >
                {answer}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="border border-border bg-[#151515] px-4 py-3">
            <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {youLabel}
            </p>
            <p className="mt-1 text-small text-foreground">{answers[picked]}</p>
          </div>

          {/* Ответ тренера проявляется один раз — тот же приём, что у результатов
              парсера в продукте (design-system.md §5 п. 3). */}
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="font-mono text-label uppercase tracking-label text-primary">
              {coachLabel}
            </p>
            <p className="mt-1 text-small text-foreground">{replies[picked]}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {afterText}
            </p>
            <button
              type="button"
              onClick={() => setPicked(picked === 0 ? 1 : 0)}
              className="font-mono text-label uppercase tracking-label text-primary transition-colors duration-150 hover:text-foreground"
            >
              {retryLabel} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
