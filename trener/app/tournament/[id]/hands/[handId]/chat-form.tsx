"use client";

import { useActionState } from "react";
import { sendChatMessageAction, type ChatFormState } from "./chat-actions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: ChatFormState = {};

export function ChatForm({ tournamentId, handId }: { tournamentId: string; handId: string }) {
  const action = sendChatMessageAction.bind(null, tournamentId, handId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <Textarea name="message" rows={3} placeholder="Спроси что-нибудь про эту раздачу..." />
      {state.error && <p className="text-small text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            Отправляем
            <LoadingDots />
          </>
        ) : (
          "Спросить"
        )}
      </Button>
    </form>
  );
}
