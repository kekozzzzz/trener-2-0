"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { triggerWorkerAction } from "@/app/status/actions";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

type DialogueResponse = {
  state: "QUESTION_ASKED" | "ANSWER_RECEIVED" | "VERDICT_SHOWN";
};

export function WaitClient({ handId }: { handId: string }) {
  const router = useRouter();
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/dialogue/${handId}`);
      if (res.ok) {
        const data: DialogueResponse = await res.json();
        if (data.state !== "ANSWER_RECEIVED") router.refresh();
      }
    } finally {
      inFlight.current = false;
    }
  }, [handId, router]);

  useEffect(() => {
    const id = setInterval(poll, 1200);
    return () => clearInterval(id);
  }, [poll]);

  async function triggerWorker() {
    setWorkerError(null);
    setRunning(true);
    try {
      const result = await triggerWorkerAction();
      if (!result.ok) setWorkerError("Воркер занят или вернул ошибку");
    } catch {
      setWorkerError("Не удалось запустить воркер");
    } finally {
      setRunning(false);
    }
    await poll();
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <p className="flex items-center gap-2 font-mono text-label uppercase tracking-label text-muted-foreground">
        Ответ принят, готовим следующий шаг
        <LoadingDots />
      </p>
      {/* Ручной «пинок» очереди — только для локальной разработки, где нет
          постоянного воркера. На проде воркер крутится сам, кнопка не нужна. */}
      {process.env.NODE_ENV !== "production" && (
        <>
          <Button variant="outline" onClick={triggerWorker} disabled={running}>
            Запустить воркер
          </Button>
          {workerError && <span className="text-small text-destructive">{workerError}</span>}
        </>
      )}
    </div>
  );
}
