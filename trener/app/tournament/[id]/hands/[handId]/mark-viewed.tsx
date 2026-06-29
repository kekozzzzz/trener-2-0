"use client";

import { useEffect, useRef } from "react";
import { markHandViewedAction } from "./actions";

// Фоново отмечает раздачу просмотренной при открытии страницы разбора. Невидимый
// компонент: один вызов на монтирование (ref-гард от двойного запуска в dev-Strict
// Mode), ошибки глотаем — это сигнал прогресса, игроку он не виден.
export function MarkViewed({ handId }: { handId: string }) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void markHandViewedAction(handId).catch(() => {});
  }, [handId]);

  return null;
}
