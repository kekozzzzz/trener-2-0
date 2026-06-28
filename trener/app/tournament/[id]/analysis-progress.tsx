"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LoadingDots } from "@/components/ui/loading-dots";
import { cn } from "@/lib/utils";

// Живой экран разбора турнира: пока LLM по очереди разбирает отобранные раздачи и
// собирает обзор, показываем РЕАЛЬНЫЕ этапы воркера с живым счётчиком «N из M».
// Каждый этап — настоящий шаг (Правило 1: ничего не выдумываем). Числа берём из
// status-API (handsReady/handsTotal/summaryReady). По завершении — refresh страницы.
//
// На этот экран попадают только статусы PARSED / CARD_READY-без-обзора: парсинг
// (UPLOADED/PARSING) и ошибка (FAILED) перехвачены раньше на странице турнира.

type StatusResponse = {
  status: string;
  summaryReady: boolean;
  handsTotal: number;
  handsReady: number;
};

type StageState = "done" | "active" | "pending";

// ~1.5с × 120 ≈ 3 мин — страховка от случая, когда обзор так и не собрался (например
// все разборы ушли в карантин), чтобы не опрашивать статус бесконечно. С запасом под
// бо́льшие карточки (до 20 раздач).
const MAX_POLLS = 120;

// Русское склонение существительного после числа: 1 раздача, 3 раздачи, 10 раздач.
function plural(n: number, forms: readonly [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

const HAND = ["раздачу", "раздачи", "раздач"] as const;

function StageRow({
  state,
  children,
}: {
  state: StageState;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      {/* Маркер этапа — геометрический (эмодзи в дизайн-системе запрещены). */}
      <span
        className={cn(
          "mt-1 size-3 shrink-0 border",
          state === "done" && "border-primary bg-primary",
          state === "active" && "border-primary bg-transparent",
          state === "pending" && "border-border bg-transparent",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "text-body",
          state === "active" && "text-foreground",
          state === "done" && "text-muted-foreground",
          state === "pending" && "text-muted-foreground opacity-50",
        )}
      >
        {children}
      </span>
    </li>
  );
}

export function AnalysisProgress({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [data, setData] = useState<StatusResponse | null>(null);
  const inFlight = useRef(false);
  const polls = useRef(0);
  const lastSignature = useRef<string | null>(null);

  const poll = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/status`);
      if (!res.ok) return false;
      const next: StatusResponse = await res.json();
      setData(next);

      // Каждая готовая раздача / смена статуса — перерисовываем серверную страницу, чтобы
      // разборы всплывали по очереди (вариант 2). router.refresh сохраняет состояние этого
      // клиентского компонента, поэтому опрос и счётчик не сбрасываются.
      const signature = `${next.status}:${next.handsReady}/${next.handsTotal}:${next.summaryReady}`;
      if (lastSignature.current !== null && lastSignature.current !== signature) {
        router.refresh();
      }
      lastSignature.current = signature;

      // Обзор собран (или турнир упал) — больше опрашивать незачем.
      return (next.status === "CARD_READY" && next.summaryReady) || next.status === "FAILED";
    } finally {
      inFlight.current = false;
    }
  }, [tournamentId, router]);

  useEffect(() => {
    let stopped = false;
    void poll(); // первый запрос сразу, чтобы счётчик не висел пустым ~1.5с
    const id = setInterval(async () => {
      polls.current += 1;
      const finished = await poll();
      if ((finished || polls.current >= MAX_POLLS) && !stopped) {
        stopped = true;
        clearInterval(id);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [poll]);

  const total = data?.handsTotal ?? 0;
  const ready = data?.handsReady ?? 0;
  const summaryReady = data?.summaryReady ?? false;
  const status = data?.status ?? null;

  const handsKnown = total > 0;
  const handsDone =
    summaryReady || status === "CARD_READY" || (handsKnown && ready >= total);

  const stage2: StageState = handsKnown ? "done" : "active";
  const stage3: StageState = !handsKnown ? "pending" : handsDone ? "done" : "active";
  const stage4: StageState = summaryReady ? "done" : handsDone ? "active" : "pending";

  return (
    <ul className="space-y-4">
      <StageRow state="done">Разобрали файл и посчитали твою статистику</StageRow>

      <StageRow state={stage2}>
        {handsKnown ? (
          <>
            Выбрали <span className="font-mono text-foreground">{total}</span>{" "}
            {plural(total, HAND)} — в них было что решать
          </>
        ) : (
          <span className="flex items-center gap-2">
            Выбираем раздачи, где было что решать
            <LoadingDots />
          </span>
        )}
      </StageRow>

      <StageRow state={stage3}>
        {stage3 === "done" ? (
          <>
            Разобрали все <span className="font-mono text-foreground">{total}</span>{" "}
            {plural(total, HAND)}
          </>
        ) : stage3 === "active" ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Разбираем их по одной:</span>
            <span className="font-mono">
              <span className="text-primary">{ready}</span> из {total}
            </span>
            <LoadingDots />
          </span>
        ) : (
          "Разбираем каждую раздачу отдельно"
        )}
      </StageRow>

      <StageRow state={stage4}>
        {stage4 === "active" ? (
          <span className="flex items-center gap-2">
            Собираем общую картину турнира
            <LoadingDots />
          </span>
        ) : (
          "Собираем общую картину турнира"
        )}
      </StageRow>
    </ul>
  );
}
