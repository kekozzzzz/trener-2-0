"use client";

import { useActionState, useRef } from "react";
import { useTranslations } from "next-intl";
import { submitAnswerAction, type AnswerFormState } from "./actions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { MicButton } from "@/components/ui/mic-button";
import { appendTranscript } from "@/lib/append-transcript";
import { markScrollToLatest } from "./scroll-to-latest";

const initialState: AnswerFormState = {};

export function AnswerForm({ tournamentId, handId }: { tournamentId: string; handId: string }) {
  const t = useTranslations("HandReview");
  const tc = useTranslations("Common");
  const action = submitAnswerAction.bind(null, tournamentId, handId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!pending) e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form action={formAction} onSubmit={() => markScrollToLatest(handId)} className="mt-4 space-y-2">
      <Textarea ref={textareaRef} name="answer" rows={4} placeholder={t("answerPlaceholder")} onKeyDown={handleKeyDown} />
      {state.error && <p className="text-small text-destructive">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              {tc("sending")}
              <LoadingDots />
            </>
          ) : (
            t("answerSubmit")
          )}
        </Button>
        <MicButton onTranscript={(text) => appendTranscript(textareaRef.current, text)} disabled={pending} />
      </div>
    </form>
  );
}
