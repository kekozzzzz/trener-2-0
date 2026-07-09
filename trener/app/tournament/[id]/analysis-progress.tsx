"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
// Формы приходят из словаря (для английского все три совпадают — «hand/hands»).
function plural(n: number, forms: readonly [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

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

export function AnalysisProgress({
  tournamentId,
  handSeconds,
  summarySeconds,
  concurrency,
}: {
  tournamentId: string;
  // Реальное среднее время недавних разборов (правило 1) — для оценки ДО живой скорости.
  handSeconds: number | null;
  summarySeconds: number | null;
  concurrency: number;
}) {
  const router = useRouter();
  const t = useTranslations("AnalysisProgress");
  const HAND = [t("handOne"), t("handFew"), t("handMany")] as const;
  const [data, setData] = useState<StatusResponse | null>(null);
  // Оценка остатка по времени (обратная связь тестера 2026-07-08: «кажется, как будто
  // зависло»). Считаем ЧЕСТНО — по реально наблюдаемой скорости в этой сессии, а не по
  // выдуманному «10с на раздачу»: от базовой точки (первый ответ статуса) делим
  // прошедшее время на число разобранных с тех пор раздач. null — пока данных мало.
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const baseline = useRef<{ time: number; ready: number } | null>(null);
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

      // Оценка остатка: базовую точку ставим на первом ответе, дальше меряем скорость.
      const now = Date.now();
      if (baseline.current === null) {
        baseline.current = { time: now, ready: next.handsReady };
      } else {
        const doneSince = next.handsReady - baseline.current.ready;
        const elapsed = now - baseline.current.time;
        const remaining = next.handsTotal - next.handsReady;
        const stillReviewing = !next.summaryReady && remaining > 0 && next.handsTotal > 0;
        // Показываем только когда есть на чём считать (≥1 разобрана за ≥4с наблюдения).
        if (stillReviewing && doneSince >= 1 && elapsed > 4000) {
          const perHandMs = elapsed / doneSince;
          const leftMs = perHandMs * remaining;
          setEtaMinutes(leftMs < 45_000 ? 0 : Math.ceil(leftMs / 60_000));
        } else if (!stillReviewing) {
          setEtaMinutes(null);
        }
      }

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

  // Оценка ДО живой скорости (правило 1 — по реальному среднему, не константа): раздачи
  // считаются волнами по числу лейнов воркера, плюс сборка общей картины. Показываем, пока
  // не разобрана ни одна раздача (живой оценки ещё нет). < 45с → «меньше минуты».
  const upfrontMinutes =
    handSeconds && total > 0
      ? (() => {
          const waves = Math.ceil(total / Math.max(1, concurrency));
          const sec = waves * handSeconds + (summarySeconds ?? 0);
          return sec < 45 ? 0 : Math.ceil(sec / 60);
        })()
      : null;
  // Живая оценка точнее — как только появится, вытесняет предварительную.
  const shownEta = etaMinutes !== null ? etaMinutes : upfrontMinutes;

  const stage2: StageState = handsKnown ? "done" : "active";
  const stage3: StageState = !handsKnown ? "pending" : handsDone ? "done" : "active";
  const stage4: StageState = summaryReady ? "done" : handsDone ? "active" : "pending";

  // Пока обзор не собран — держим успокаивающую строку: разбор идёт на сервере и это
  // нормально долго (тестер принял медленный разбор за зависание).
  const inProgress = !summaryReady;

  return (
    <div className="space-y-4">
    <ul className="space-y-4">
      <StageRow state="done">{t("stageParsed")}</StageRow>

      <StageRow state={stage2}>
        {handsKnown ? (
          <>
            {t("stageSelectedPrefix")} <span className="font-mono text-foreground">{total}</span>{" "}
            {plural(total, HAND)} {t("stageSelectedSuffix")}
          </>
        ) : (
          <span className="flex items-center gap-2">
            {t("stageSelectingActive")}
            <LoadingDots />
          </span>
        )}
      </StageRow>

      <StageRow state={stage3}>
        {stage3 === "done" ? (
          <>
            {t("stageReviewedAll")} <span className="font-mono text-foreground">{total}</span>{" "}
            {plural(total, HAND)}
          </>
        ) : stage3 === "active" ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{t("stageReviewingPrefix")}</span>
            <span className="font-mono">
              <span className="text-primary">{ready}</span> {t("stageReviewingOf")} {total}
            </span>
            <LoadingDots />
            {shownEta !== null && (
              <span className="font-mono text-muted-foreground">
                · {shownEta === 0 ? t("etaUnderMinute") : t("etaAbout", { min: shownEta })}
              </span>
            )}
          </span>
        ) : (
          t("stageReviewingPending")
        )}
      </StageRow>

      <StageRow state={stage4}>
        {stage4 === "active" ? (
          <span className="flex items-center gap-2">
            {t("stageSummary")}
            <LoadingDots />
          </span>
        ) : (
          t("stageSummary")
        )}
      </StageRow>
    </ul>

      {inProgress && (
        <p className="border-l border-primary pl-4 text-small text-muted-foreground">
          {t("reassurance")}
        </p>
      )}
    </div>
  );
}
