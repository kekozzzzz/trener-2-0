"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { submitAnswerAction, type AnswerFormState } from "./actions";
import { RangeGrid } from "@/components/poker/range-grid";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { MicButton } from "@/components/ui/mic-button";
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
  // Сетка не отмечена, но игрок написал словами — это полноценный ответ (не заставляем
  // прорисовывать диапазон, если он хочет сказать мысль текстом; правка Артёма 2026-07-04).
  if (codes.length === 0) return note.trim();
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
  // Сетка диапазона по умолчанию СПРЯТАНА (правка Артёма 18.07: «опять везде диапазон» — грид
  // навязывает мышление диапазонами на каждом вопросе). Отвечаешь словами; хочешь отметить руки
  // соперника на сетке — жмёшь кнопку. Данные не страдают: composeAnswer при пустой сетке отдаёт
  // просто текст, при отмеченной — «Думаю, у оппонента диапазон: …» + заметку.
  const [showGrid, setShowGrid] = useState(false);

  return (
    <form action={formAction} onSubmit={() => markScrollToLatest(handId)} className="mt-4 space-y-4">
      <Textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("answerPlaceholder")}
      />
      {showGrid ? (
        <RangeGrid onChange={setCodes} />
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowGrid(true)}>
          {t("markRangeButton")}
        </Button>
      )}
      <input
        type="hidden"
        name="answer"
        value={composeAnswer(codes, note, (values) => t("rangeComposed", values))}
      />
      {state.error && <p className="text-small text-destructive">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || (codes.length === 0 && note.trim().length === 0)}>
          {pending ? (
            <>
              {tc("sending")}
              <LoadingDots />
            </>
          ) : (
            t("answerSubmit")
          )}
        </Button>
        {/* Голос дописывает заметку «почему такой диапазон» — поле контролируемое,
            поэтому дописываем в состояние (не через appendTranscript по ref). */}
        <MicButton
          onTranscript={(text) =>
            setNote((n) => (n && !n.endsWith(" ") ? `${n} ${text}` : n + text))
          }
          disabled={pending}
        />
      </div>
    </form>
  );
}
