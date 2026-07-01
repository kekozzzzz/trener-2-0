"use client";

import { useEffect, useRef } from "react";

// После ответа страница целиком перерисовывается (router.refresh в wait-client),
// и взгляд сбрасывается наверх. Чтобы игрок сразу видел новый блок тренера
// (следующий вопрос или вердикт), форма при отправке ставит флажок в sessionStorage,
// а этот якорь при появлении нового блока доскроллит к нему и флажок гасит.
// Флажок нужен, чтобы скроллить ТОЛЬКО после ответа, а не на первом открытии раздачи.

function flagKey(handId: string): string {
  return `scrollToLatest:${handId}`;
}

// Вызывается формой ответа в момент отправки.
export function markScrollToLatest(handId: string): void {
  try {
    sessionStorage.setItem(flagKey(handId), "1");
  } catch {
    // sessionStorage недоступен (приватный режим и т.п.) — молча пропускаем.
  }
}

export function ScrollToLatest({ handId }: { handId: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(flagKey(handId)) === "1";
      if (flagged) sessionStorage.removeItem(flagKey(handId));
    } catch {
      // sessionStorage недоступен — просто не скроллим.
    }
    if (flagged) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [handId]);

  return <div ref={ref} aria-hidden className="scroll-mt-8" />;
}
