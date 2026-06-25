"use client";

import { useActionState, useRef } from "react";
import { sendChatMessageAction, type ChatFormState } from "./chat-actions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { MicButton } from "@/components/ui/mic-button";
import { appendTranscript } from "@/lib/append-transcript";

const initialState: ChatFormState = {};

export function ChatForm({ tournamentId, handId }: { tournamentId: string; handId: string }) {
  const action = sendChatMessageAction.bind(null, tournamentId, handId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={formAction} className="space-y-2">
      <Textarea ref={textareaRef} name="message" rows={3} placeholder="Спроси что-нибудь про эту раздачу..." />
      {state.error && <p className="text-small text-destructive">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
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
        <MicButton onTranscript={(text) => appendTranscript(textareaRef.current, text)} disabled={pending} />
      </div>
    </form>
  );
}
