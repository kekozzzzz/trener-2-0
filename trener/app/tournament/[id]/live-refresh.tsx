"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type StatusResponse = {
  status: string;
  summaryReady: boolean;
  handsTotal: number;
  handsReady: number;
};

// Делает страницу разбора «живой»: пока турнир ещё считается, опрашивает статус и
// перерисовывает серверную страницу по мере готовности — раздачи всплывают по очереди,
// общая картина появляется, когда собрана. Останавливается, когда разбор завершён
// (CARD_READY + общая картина готова) или турнир упал в ошибку.
//
// Перерисовываем только при РЕАЛЬНОМ изменении (сигнатура состояния), чтобы не дёргать
// router.refresh() вхолостую каждые полторы секунды.
// Потолок опросов (~1.5с × 80 ≈ 2 мин): страховка от редкого случая, когда общая
// картина так и не собралась (например, все разборы раздач упали в карантин) — чтобы
// клиент не опрашивал статус бесконечно. Нормальный разбор укладывается в секунды.
const MAX_POLLS = 80;

export function LiveRefresh({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const lastSignature = useRef<string | null>(null);
  const polls = useRef(0);

  const poll = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/status`);
      if (!res.ok) return false;
      const data: StatusResponse = await res.json();

      const signature = `${data.status}:${data.handsReady}/${data.handsTotal}:${data.summaryReady}`;
      if (lastSignature.current !== null && lastSignature.current !== signature) {
        router.refresh();
      }
      lastSignature.current = signature;

      // Разбор завершён или турнир упал — больше опрашивать незачем.
      return (data.status === "CARD_READY" && data.summaryReady) || data.status === "FAILED";
    } finally {
      inFlight.current = false;
    }
  }, [tournamentId, router]);

  useEffect(() => {
    let stopped = false;
    const id = setInterval(async () => {
      polls.current += 1;
      const done = await poll();
      if ((done || polls.current >= MAX_POLLS) && !stopped) {
        stopped = true;
        clearInterval(id);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [poll]);

  return null;
}
