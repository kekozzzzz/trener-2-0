// Метки ошибок раздачи — второй канал памяти тренера: «та же ошибка, что и тогда»
// (план 2026-07-05-память-тренера-2). Правило 1: метки ставят СУЩЕСТВУЮЩИЕ детекторы
// парсера и чартов (те же, что в лик-трекере) плюс детектор доезда — LLM не участвует.
//
// Считаются один раз при парсинге и пишутся в JSON hand.spot рядом с отпечатком
// (поле marks) — схема БД не меняется, старые раздачи без меток просто не находятся
// этим каналом.

import type { Street, TableSnapshot } from "@/parser/types";
import { detectHeroLuckyWin } from "@/parser/lucky-win";
import { detectHeroMissedValue3bet } from "@/parser/missed-3bet";
import type { SpotFingerprint } from "@/parser/spot-fingerprint";
import { countLeaks, LEAK_KINDS, type LeakKind } from "@/features/profile/leak-trend";
import type { HandMomentKind } from "@/features/card/hand-moments";

// «Пропущенный 3-бет на велью» (2026-07-16) — вторая сторона чарта: не «шире нормы», а
// «не сделал того, что чарт велит». Самый ясный из пропусков (флэт премиума ≈ всегда зевок).
export type SpotMarkKind = LeakKind | "LUCKY_WIN" | "MISSED_3BET_VALUE";

export type SpotMark = {
  kind: SpotMarkKind;
  street?: Street; // только LUCKY_WIN: улица крупного вложения
  equityPct?: number; // только LUCKY_WIN: эквити Hero в момент вложения
};

// Что реально лежит в JSON-колонке hand.spot после 2026-07-05: отпечаток + метки ошибок (marks,
// для канала памяти «та же ошибка») + типы-моменты каталога (moments, 2026-07-16 — для показа
// игроку). Читатели отпечатка (spotMatchScore/spotKey) смотрят только свои 6 полей; marks и
// moments — независимые списки (moments шире: включает позитив/инициативу, marks — только ошибки).
export type StoredSpot = SpotFingerprint & { marks?: SpotMark[]; moments?: HandMomentKind[] };

// Метки ошибок одной раздачи. Никогда не бросает — вызывается в парс-шаге.
export function computeSpotMarks(snapshot: TableSnapshot): SpotMark[] {
  try {
    const marks: SpotMark[] = [];

    const counts = countLeaks([{ tableData: snapshot }]);
    for (const kind of LEAK_KINDS) {
      if (counts[kind] > 0) marks.push({ kind });
    }

    const lucky = detectHeroLuckyWin(snapshot);
    if (lucky) marks.push({ kind: "LUCKY_WIN", street: lucky.street, equityPct: lucky.equityPct });

    // Вторая сторона чарта (2026-07-16): не «шире нормы», а «не сделал того, что чарт велит».
    if (detectHeroMissedValue3bet(snapshot)) marks.push({ kind: "MISSED_3BET_VALUE" });

    return marks;
  } catch {
    return []; // кривой снимок не должен ронять сохранение турнира
  }
}

const STREET_RU: Record<Street, string> = {
  PREFLOP: "на префлопе",
  FLOP: "на флопе",
  TURN: "на тёрне",
  RIVER: "на ривере",
};

// Человеческая метка ошибки для блока памяти в промпте (тексты русские, как весь блок).
export function mistakeLabel(mark: SpotMark): string {
  switch (mark.kind) {
    case "OPEN_WIDE":
      return "открытие первым шире нормы";
    case "LIMP":
      return "лимп";
    case "BB_3BET_WIDE":
      return "3-бет из BB шире нормы";
    case "OPEN_SHOVE_WIDE":
      return "пуш на коротком стеке вне диапазона";
    case "VS_OPEN_3BET_WIDE":
      return "3-бет против опена шире нормы";
    case "ISO_WIDE":
      return "изоляция лимпера шире нормы";
    case "SQUEEZE_WIDE":
      return "сквиз шире нормы";
    case "FOURBET_WIDE":
      return "4-бет шире нормы";
    case "MISSED_3BET_VALUE":
      return "флэт премиума против опена вместо 3-бета на велью";
    case "LUCKY_WIN": {
      const street = mark.street ? ` ${STREET_RU[mark.street]}` : "";
      const equity = mark.equityPct != null ? ` с эквити ${mark.equityPct}%` : "";
      return `крупное вложение${street}${equity}, будучи далеко позади`;
    }
  }
}
