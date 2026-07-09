"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { retryTournamentParse } from "@/features/queue-recovery/actions";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

// Предохранитель от вечного опроса (см. wait-client.tsx).
const MAX_POLLS = 200; // ~5 минут при 1.5с

export function ParsingWaitClient({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const t = useTranslations("ParsingWait");
  const MESSAGES = [t("metrics"), t("layout"), t("selecting")];
  const [messageIndex, setMessageIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const inFlight = useRef(false);
  const polls = useRef(0);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/status`);
      if (res.ok) {
        const data: { status: string; failed?: boolean } = await res.json();
        if (data.status !== "UPLOADED" && data.status !== "PARSING") {
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
  }, [tournamentId, router]);

  useEffect(() => {
    if (failed) return;
    const pollId = setInterval(poll, 1500);
    return () => clearInterval(pollId);
  }, [poll, failed]);

  useEffect(() => {
    if (failed) return;
    const messageId = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 3000);
    return () => clearInterval(messageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  async function retry() {
    setRetrying(true);
    try {
      await retryTournamentParse(tournamentId);
    } finally {
      polls.current = 0;
      setFailed(false);
      setRetrying(false);
    }
  }

  if (failed) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-body text-muted-foreground">{t("failed")}</p>
        <Button variant="outline" onClick={retry} disabled={retrying}>
          {retrying ? t("retrying") : t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <p className="flex items-center gap-2 text-body text-muted-foreground">
      {MESSAGES[messageIndex]}
      <LoadingDots />
    </p>
  );
}
