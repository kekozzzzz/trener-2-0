"use client";

import { useActionState, useRef } from "react";
import { useTranslations } from "next-intl";
import { sendChatMessageAction, type ChatFormState } from "./chat-actions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { MicButton } from "@/components/ui/mic-button";
import { appendTranscript } from "@/lib/append-transcript";

const initialState: ChatFormState = {};

export function ChatForm({ tournamentId, handId }: { tournamentId: string; handId: string }) {
  const t = useTranslations("Chat");
  const tc = useTranslations("Common");
  const action = sendChatMessageAction.bind(null, tournamentId, handId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter отправляет с обеих клавиш: основной (key="Enter") и цифрового блока —
    // часть клавиатур отдаёт цифровой Enter только кодом NumpadEnter.
    if ((e.key === "Enter" || e.code === "NumpadEnter") && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!pending) e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form action={formAction} className="space-y-2">
      <Textarea ref={textareaRef} name="message" rows={3} placeholder={t("placeholder")} onKeyDown={handleKeyDown} />
      {state.error && <p className="text-small text-destructive">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              {tc("sending")}
              <LoadingDots />
            </>
          ) : (
            t("ask")
          )}
        </Button>
        <MicButton onTranscript={(text) => appendTranscript(textareaRef.current, text)} disabled={pending} />
      </div>
    </form>
  );
}
