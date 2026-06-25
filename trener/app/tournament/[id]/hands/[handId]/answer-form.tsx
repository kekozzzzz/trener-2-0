"use client";

import { useActionState, useRef } from "react";
import { submitAnswerAction, type AnswerFormState } from "./actions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { MicButton } from "@/components/ui/mic-button";
import { appendTranscript } from "@/lib/append-transcript";

const initialState: AnswerFormState = {};

export function AnswerForm({ tournamentId, handId }: { tournamentId: string; handId: string }) {
  const action = submitAnswerAction.bind(null, tournamentId, handId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={formAction} className="mt-4 space-y-2">
      <Textarea ref={textareaRef} name="answer" rows={4} placeholder="Твой ответ..." />
      {state.error && <p className="text-small text-destructive">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              Отправляем
              <LoadingDots />
            </>
          ) : (
            "Ответить"
          )}
        </Button>
        <MicButton onTranscript={(text) => appendTranscript(textareaRef.current, text)} disabled={pending} />
      </div>
    </form>
  );
}
