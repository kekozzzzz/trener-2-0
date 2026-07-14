"use client";

import { useEffect, useState } from "react";

// Счётчик прошедших секунд ожидания ответа тренера. Показывает игроку, что процесс идёт (а не
// завис), пока LLM думает — особенно на CRITICAL-раздачах, где включён режим размышления и ответ
// дольше. Разрешённая «живая» единица по дизайн-системе — статичный моно-текст с растущим числом
// (не pulse/spin). Число — метрика, значит JetBrains Mono (font-mono).
export function ElapsedTimer({ className }: { className?: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // Неразрывный пробел между числом и «с», чтобы не переносилось.
  return <span className={className}>{seconds} с</span>;
}
