"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { triggerWorkerAction } from "@/app/status/actions";

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
    const id = setInterval(poll, 3000);
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
    <div style={{ marginTop: "1rem" }}>
      <p style={{ color: "#92400e" }}>Ответ принят, готовим следующий шаг...</p>
      <button
        onClick={triggerWorker}
        disabled={running}
        style={{
          fontFamily: "monospace",
          padding: "4px 12px",
          cursor: "pointer",
          border: "1px solid #374151",
          borderRadius: "4px",
          background: "#f9fafb",
        }}
      >
        Запустить воркер
      </button>
      {workerError && (
        <span style={{ color: "#991b1b", fontSize: "0.85em", marginLeft: "0.5rem" }}>{workerError}</span>
      )}
    </div>
  );
}
