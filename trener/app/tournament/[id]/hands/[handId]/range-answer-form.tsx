"use client";

import { useActionState, useState } from "react";
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
function composeAnswer(codes: string[], note: string): string {
  if (codes.length === 0) return "";
  const range = formatRange(codes);
  const combos = combosOf(codes);
  const pct = percentOf(codes).toFixed(1);
  const base = `Думаю, у оппонента диапазон: ${range} (${combos} комбо, ${pct}% рук).`;
  const trimmed = note.trim();
  return trimmed ? `${base} ${trimmed}` : base;
}

export function RangeAnswerForm({ tournamentId, handId }: { tournamentId: string; handId: string }) {
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
        placeholder="Можно дописать, почему такой диапазон (необязательно)..."
      />
      <input type="hidden" name="answer" value={composeAnswer(codes, note)} />
      {state.error && <p className="text-small text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending || codes.length === 0}>
        {pending ? (
          <>
            Отправляем
            <LoadingDots />
          </>
        ) : (
          "Ответить"
        )}
      </Button>
    </form>
  );
}
