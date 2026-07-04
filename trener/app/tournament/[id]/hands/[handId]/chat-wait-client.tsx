"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoadingDots } from "@/components/ui/loading-dots";

type ChatResponse = {
  awaitingReply: boolean;
};

// Ожидание ответа тренера в чате: опрашиваем статус и обновляем страницу, когда
// ответ готов. Кнопка «Запустить воркер» убрана 2026-07-04 (правка Артёма): на
// проде воркер пинается сам при постановке задачи (kickWorker), а техническая
// кнопка в лицо игроку только пугает. Аварийный запуск остался у админа на /status.
export function ChatWaitClient({ handId }: { handId: string }) {
  const router = useRouter();
  const t = useTranslations("Chat");
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/chat/${handId}`);
      if (res.ok) {
        const data: ChatResponse = await res.json();
        if (!data.awaitingReply) router.refresh();
      }
    } finally {
      inFlight.current = false;
    }
  }, [handId, router]);

  useEffect(() => {
    const id = setInterval(poll, 1200);
    return () => clearInterval(id);
  }, [poll]);

  return (
    <p className="flex items-center gap-2 font-mono text-label uppercase tracking-label text-muted-foreground">
      {t("preparingReply")}
      <LoadingDots />
    </p>
  );
}
