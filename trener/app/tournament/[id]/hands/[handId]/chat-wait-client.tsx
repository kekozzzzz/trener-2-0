"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { retryChatReply } from "@/features/queue-recovery/actions";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

type ChatResponse = {
  awaitingReply: boolean;
  failed?: boolean;
};

// Предохранитель от вечного опроса (см. wait-client.tsx).
const MAX_POLLS = 250;

// Ожидание ответа тренера в чате: опрашиваем статус и обновляем страницу, когда
// ответ готов. Если ответ сдох в карантин (failed) — показываем «не получилось, повторить»
// вместо бесконечного «готовим ответ». Кнопка «Запустить воркер» убрана 2026-07-04
// (правка Артёма): на проде воркер пинается сам. Аварийный запуск остался у админа на /status.
export function ChatWaitClient({ handId }: { handId: string }) {
  const router = useRouter();
  const t = useTranslations("Chat");
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const inFlight = useRef(false);
  const polls = useRef(0);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/chat/${handId}`);
      if (res.ok) {
        const data: ChatResponse = await res.json();
        if (!data.awaitingReply) {
          router.refresh();
          return;
        }
        if (data.failed) {
          setFailed(true);
          return;
        }
      }
      polls.current += 1;
      if (polls.current >= MAX_POLLS) setFailed(true);
    } finally {
      inFlight.current = false;
    }
  }, [handId, router]);

  useEffect(() => {
    if (failed) return;
    const id = setInterval(poll, 1200);
    return () => clearInterval(id);
  }, [poll, failed]);

  async function retry() {
    setRetrying(true);
    try {
      await retryChatReply(handId);
    } finally {
      polls.current = 0;
      setFailed(false);
      setRetrying(false);
    }
  }

  if (failed) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-body text-muted-foreground">{t("replyFailed")}</p>
        <Button variant="outline" onClick={retry} disabled={retrying}>
          {retrying ? t("retrying") : t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <p className="flex items-center gap-2 font-mono text-label uppercase tracking-label text-muted-foreground">
      {t("preparingReply")}
      <LoadingDots />
    </p>
  );
}
