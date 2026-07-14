"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { triggerWorkerAction } from "@/app/status/actions";
import { retryDialogueStep } from "@/features/queue-recovery/actions";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { ElapsedTimer } from "@/components/ui/elapsed-timer";

type DialogueResponse = {
  state: "QUESTION_ASKED" | "ANSWER_RECEIVED" | "VERDICT_SHOWN";
  failed?: boolean;
};

// Предохранитель от вечного опроса: ~5 минут при 1.2с. Штатно шаг считается ≤30с, а
// сдохшая задача поизонится за ~3 мин (3 попытки с backoff) — тогда придёт failed. Кап
// нужен на редкий случай «висит, но ещё не в карантине»: не крутим бесконечно.
const MAX_POLLS = 250;

export function WaitClient({ handId }: { handId: string }) {
  const router = useRouter();
  const t = useTranslations("HandReview");
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const inFlight = useRef(false);
  const polls = useRef(0);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/dialogue/${handId}`);
      if (res.ok) {
        const data: DialogueResponse = await res.json();
        if (data.state !== "ANSWER_RECEIVED") {
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

  // Повтор застрявшего шага: перезапускаем сдохшую задачу и снова ждём (сбрасываем кап).
  async function retry() {
    setRetrying(true);
    try {
      await retryDialogueStep(handId);
    } finally {
      polls.current = 0;
      setFailed(false);
      setRetrying(false);
    }
  }

  async function triggerWorker() {
    setWorkerError(null);
    setRunning(true);
    try {
      const result = await triggerWorkerAction();
      if (!result.ok) setWorkerError(t("workerBusy"));
    } catch {
      setWorkerError(t("workerFailed"));
    } finally {
      setRunning(false);
    }
    await poll();
  }

  if (failed) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-body text-muted-foreground">{t("stepFailed")}</p>
        <Button variant="outline" onClick={retry} disabled={retrying}>
          {retrying ? t("retrying") : t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-4">
        <p className="flex items-center gap-2 font-mono text-label uppercase tracking-label text-muted-foreground">
          {t("waitNextStep")}
          <LoadingDots />
          <ElapsedTimer className="normal-case tracking-normal text-primary" />
        </p>
      </div>
      {/* Подсказка про время: на CRITICAL-раздачах включён режим размышления → ответ дольше. */}
      <p className="text-small text-muted-foreground">{t("thinkingHint")}</p>
      {/* Ручной «пинок» очереди — только для локальной разработки, где нет
          постоянного воркера. На проде воркер крутится сам, кнопка не нужна. */}
      {process.env.NODE_ENV !== "production" && (
        <>
          <Button variant="outline" onClick={triggerWorker} disabled={running}>
            {t("runWorker")}
          </Button>
          {workerError && <span className="text-small text-destructive">{workerError}</span>}
        </>
      )}
    </div>
  );
}
