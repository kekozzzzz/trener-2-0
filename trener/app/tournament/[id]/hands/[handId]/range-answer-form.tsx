"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { submitAnswerAction, type AnswerFormState } from "./actions";
import { RangeGrid } from "@/components/poker/range-grid";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { formatRange, combosOf, percentOf } from "@/config/poker/hand-grid";
import { markScrollToLatest } from "./scroll-to-latest";

const initialState: AnswerFormState = {};

// Превращает выбор игрока в обычный текстовый ответ для тренера: компактная
// нотация + «N комбо, X% рук» (всё детерминированно, правило 1) + необязательная
// заметка. Дальше идёт тем же путём, что и печатный ответ (submitAnswerAction).
// Шаблон предложения — из словаря (язык интерфейса игрока).
function composeAnswer(
  codes: string[],
  note: string,
  composed: (values: { range: string; combos: number; pct: string }) => string
): string {
  if (codes.length === 0) return "";
  const range = formatRange(codes);
  const combos = combosOf(codes);
  const pct = percentOf(codes).toFixed(1);
  const base = composed({ range, combos, pct });
  const trimmed = note.trim();
  return trimmed ? `${base} ${trimmed}` : base;
}

export function RangeAnswerForm({ tournamentId, handId }: { tournamentId: string; handId: string }) {
  const t = useTranslations("HandReview");
  const tc = useTranslations("Common");
  const action = submitAnswerAction.bind(null, tournamentId, handId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [codes, setCodes] = useState<string[]>([]);
  const [note, setNote] = useState("");

  return (
    <form action={formAction} onSubmit={() => markScrollToLatest(handId)} className="mt-4 space-y-4">
      <RangeGrid onChange={setCodes} />
      <Textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("rangeNotePlaceholder")}
      />
      <input
        type="hidden"
        name="answer"
        value={composeAnswer(codes, note, (values) => t("rangeComposed", values))}
      />
      {state.error && <p className="text-small text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending || codes.length === 0}>
        {pending ? (
          <>
            {tc("sending")}
            <LoadingDots />
          </>
        ) : (
          t("answerSubmit")
        )}
      </Button>
    </form>
  );
}
