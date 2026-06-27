"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { LoadingDots } from "@/components/ui/loading-dots";

const MESSAGES = [
  "Считаем VPIP, потери в фишках, SPR...",
  "Раскладываем раздачи турнира...",
  "Выбираем раздачи для разбора...",
];

export function ParsingWaitClient({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [messageIndex, setMessageIndex] = useState(0);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/status`);
      if (res.ok) {
        const data: { status: string } = await res.json();
        if (data.status !== "UPLOADED" && data.status !== "PARSING") router.refresh();
      }
    } finally {
      inFlight.current = false;
    }
  }, [tournamentId, router]);

  useEffect(() => {
    const pollId = setInterval(poll, 1500);
    return () => clearInterval(pollId);
  }, [poll]);

  useEffect(() => {
    const messageId = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 3000);
    return () => clearInterval(messageId);
  }, []);

  return (
    <p className="flex items-center gap-2 text-body text-muted-foreground">
      {MESSAGES[messageIndex]}
      <LoadingDots />
    </p>
  );
}
