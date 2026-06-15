"use client";

import { useActionState } from "react";
import { submitAnswerAction, type AnswerFormState } from "./actions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: AnswerFormState = {};

export function AnswerForm({ tournamentId, handId }: { tournamentId: string; handId: string }) {
  const action = submitAnswerAction.bind(null, tournamentId, handId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-4 space-y-2">
      <Textarea name="answer" rows={4} placeholder="Твой ответ..." />
      {state.error && <p className="text-small text-destructive">{state.error}</p>}
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
    </form>
  );
}
