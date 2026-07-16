// Каталог типов раздач (план 2026-07-16-каталог-типов-раздач-РЕАЛИЗАЦИЯ): вместо абстрактных
// «сильная/средняя» — КОНКРЕТНЫЙ тип момента раздачи. Игроку показываем тип (живой хук: «выбил
// банк агрессией», «крупный фолд»); группу (STRONG/LEAK/CONTESTED/INITIATIVE/COOLER) держим
// ВНУТРИ — для сортировки/цвета/приоритета.
//
// Правило 1: тип детектирует ПАРСЕР существующими детекторами (decision-weight, кулер, доезд,
// чарт-лики, сквиз/изоляция/3-бет), LLM не участвует. Правило 2: оценка «молодец/ошибка»
// вскрывается ДИАЛОГОМ (осознанность), а НЕ результатом раздачи — поэтому метка нейтральна,
// особенно у выигрышей («забрал банк — как?», а не «переиграл»): иначе учим радоваться везению.
//
// Отдельно от hand.spot.marks: там метки ОШИБОК для канала памяти «та же ошибка, что и тогда».
// Свалить сюда позитив/инициативу нельзя — канал памяти счёл бы «выбил блефом» повторной ошибкой.

import type { TableSnapshot } from "@/parser/types";
import { decisionMarks } from "@/parser/decision-weight";
import { detectHeroCooler } from "@/parser/cooler";
import { detectHeroLuckyWin } from "@/parser/lucky-win";
import { detectHeroVsOpen } from "@/parser/vs-open";
import { detectHeroIso } from "@/parser/iso";
import { detectHeroSqueeze } from "@/parser/squeeze";
import { detectHeroMissedValue3bet } from "@/parser/missed-3bet";
import { isVsOpenThreeBetSignificantlyWide } from "@/config/poker/vs-open-chart";
import { isIsoSignificantlyWide } from "@/config/poker/iso-chart";
import { isSqueezeSignificantlyWide } from "@/config/poker/squeeze-chart";
import { countLeaks, LEAK_KINDS, type LeakKind } from "@/features/profile/leak-trend";

// Группа момента — ВНУТРЕННЯЯ (игроку не показываем именем). Приоритет показа в карточке:
// спорные (диалоги «почему») → сильные (похвала) → утечки → инициативные → кулеры.
export type MomentGroup = "CONTESTED" | "STRONG" | "LEAK" | "INITIATIVE" | "COOLER";

// Глубина разбора (Артём 2026-07-16): у каждого типа своя. «упоминание» — только метка +
// одна строка, без анализа/диалога (пропустил контбет). «заметка» — короткий разбор без
// диалога. «диалог» — полный сократовский разбор.
export type MomentDepth = "mention" | "note" | "dialogue";

export type HandMomentKind =
  // 🟡 CONTESTED (спорные решения — диалог «почему»)
  | "BIG_FOLD" // крупный фолд после своего вложения
  | "FOLD_INVEST" // фолд на улице, где сам поставил/рейзил
  | "BIG_CALL" // крупный колл олл-ина в спорном споте
  // 🟢 STRONG (выиграл сильным ходом — метка НЕЙТРАЛЬНА, оценку вскрывает диалог)
  | "WON_BLUFF" // забрал банк последней агрессией без вскрытия
  | "CAUGHT_BLUFF" // выиграл пограничный крупный колл
  // 🔴 LEAK (утечки — часто без потери фишек)
  | "MISSED_VALUE" // прочекал сильную руку насквозь
  | "OPEN_WIDE"
  | "LIMP"
  | "BB_3BET_WIDE"
  | "OPEN_SHOVE_WIDE"
  | "VS_OPEN_3BET_WIDE"
  | "ISO_WIDE"
  | "SQUEEZE_WIDE"
  | "FOURBET_WIDE"
  | "MISSED_3BET_VALUE" // вторая сторона чарта: флэт премиума вместо 3-бета на велью
  // 🔵 INITIATIVE (сам ход нейтрален — метка открывает вопрос про замысел)
  | "SQUEEZE"
  | "ISO"
  | "THREEBET"
  // 🎲 COOLER (не повезло / повезло — сыграно на грани доезда)
  | "COOLER" // проиграл, будучи впереди
  | "LUCKY_WIN"; // выиграл, будучи далеко позади

export type HandMoment = {
  kind: HandMomentKind;
  group: MomentGroup;
  depth: MomentDepth;
};

// kind → (группа, глубина по умолчанию). Глубину тип может переопределять контекстом (см. ниже),
// но базовая таблица — здесь. Порядок групп для приоритета в GROUP_PRIORITY.
const KIND_META: Record<HandMomentKind, { group: MomentGroup; depth: MomentDepth }> = {
  BIG_FOLD: { group: "CONTESTED", depth: "dialogue" },
  FOLD_INVEST: { group: "CONTESTED", depth: "dialogue" },
  BIG_CALL: { group: "CONTESTED", depth: "dialogue" },
  WON_BLUFF: { group: "STRONG", depth: "dialogue" },
  CAUGHT_BLUFF: { group: "STRONG", depth: "dialogue" },
  MISSED_VALUE: { group: "LEAK", depth: "note" },
  OPEN_WIDE: { group: "LEAK", depth: "mention" },
  LIMP: { group: "LEAK", depth: "mention" },
  BB_3BET_WIDE: { group: "LEAK", depth: "note" },
  OPEN_SHOVE_WIDE: { group: "LEAK", depth: "note" },
  VS_OPEN_3BET_WIDE: { group: "LEAK", depth: "note" },
  ISO_WIDE: { group: "LEAK", depth: "mention" },
  SQUEEZE_WIDE: { group: "LEAK", depth: "note" },
  FOURBET_WIDE: { group: "LEAK", depth: "note" },
  MISSED_3BET_VALUE: { group: "LEAK", depth: "mention" },
  SQUEEZE: { group: "INITIATIVE", depth: "dialogue" },
  ISO: { group: "INITIATIVE", depth: "note" },
  THREEBET: { group: "INITIATIVE", depth: "note" },
  COOLER: { group: "COOLER", depth: "note" },
  LUCKY_WIN: { group: "COOLER", depth: "dialogue" },
};

// Приоритет для выбора ГЛАВНОГО типа (что показать первым) и порядка в карточке.
const GROUP_PRIORITY: Record<MomentGroup, number> = {
  CONTESTED: 5,
  STRONG: 4,
  LEAK: 3,
  INITIATIVE: 2,
  COOLER: 1,
};

const DECISION_TO_KIND = {
  BIG_FOLD: "BIG_FOLD",
  FOLD_INVEST: "FOLD_INVEST",
  WON_BLUFF: "WON_BLUFF",
  BIG_CALL_WON: "CAUGHT_BLUFF",
  MISSED_VALUE: "MISSED_VALUE",
} as const;

// Чарт-широта инициативного хода: тот же критерий, что в leak-trend (для типа-утечки).
function isLeakKind(kinds: HandMomentKind[], k: LeakKind): boolean {
  return kinds.includes(k as HandMomentKind);
}

// Все типы-моменты раздачи, детерминированно из снимка + результата в фишках. Несколько типов
// на раздачу — норма (если моментов несколько). Пустой массив = значимого момента нет (мусор).
// Никогда не бросает — зовётся в парс-шаге, кривой снимок не должен ронять сохранение турнира.
export function computeHandMoments(snapshot: TableSnapshot, chipResult: number): HandMoment[] {
  try {
    return computeHandMomentsUnsafe(snapshot, chipResult);
  } catch {
    return [];
  }
}

function computeHandMomentsUnsafe(snapshot: TableSnapshot, chipResult: number): HandMoment[] {
  const kinds = new Set<HandMomentKind>();

  // 1. Каналы решений (крупный фолд/блеф-вин/крупный колл-вин/недобор) — decision-weight.
  for (const m of decisionMarks(snapshot, chipResult)) {
    const mapped = DECISION_TO_KIND[m.channel];
    if (mapped) kinds.add(mapped);
  }

  // 2. Кулеры (проиграл впереди) и доезд (повезло позади).
  if (detectHeroCooler(snapshot)) kinds.add("COOLER");
  if (detectHeroLuckyWin(snapshot)) kinds.add("LUCKY_WIN");

  // 3. Чарт-лики (8) — переиспользуем leak-trend (тот же путь, что hand.spot.marks).
  const leaks = countLeaks([{ tableData: snapshot }]);
  for (const lk of LEAK_KINDS) {
    if (leaks[lk] > 0) kinds.add(lk as HandMomentKind);
  }

  // 3b. Вторая сторона чарта: не «шире нормы», а «не сделал, что чарт велит» (идея Артёма).
  if (detectHeroMissedValue3bet(snapshot)) kinds.add("MISSED_3BET_VALUE");

  // 4. Инициативные ходы (сквиз/изоляция/3-бет) — САМ ход как нейтральный тип, ТОЛЬКО если он
  //    НЕ помечен как «шире нормы» (иначе это уже утечка SQUEEZE_WIDE/ISO_WIDE/VS_OPEN_3BET_WIDE).
  const all = [...kinds];
  const sq = detectHeroSqueeze(snapshot);
  if (sq && !isLeakKind(all, "SQUEEZE_WIDE") && !isSqueezeSignificantlyWide(sq.heroPosition, sq.code))
    kinds.add("SQUEEZE");
  const iso = detectHeroIso(snapshot);
  if (iso && !isLeakKind(all, "ISO_WIDE") && !isIsoSignificantlyWide(iso.heroPosition, iso.code)) kinds.add("ISO");
  const vs = detectHeroVsOpen(snapshot);
  if (
    vs?.action === "3BET" &&
    !isLeakKind(all, "VS_OPEN_3BET_WIDE") &&
    !isVsOpenThreeBetSignificantlyWide(vs.heroPosition, vs.code)
  )
    kinds.add("THREEBET");

  return [...kinds].map((kind) => ({ kind, ...KIND_META[kind] }));
}

// Главный тип раздачи — по приоритету групп, для метки игроку и выбора глубины. null — момента нет.
export function primaryMoment(moments: HandMoment[]): HandMoment | null {
  if (moments.length === 0) return null;
  return [...moments].sort((a, b) => GROUP_PRIORITY[b.group] - GROUP_PRIORITY[a.group])[0];
}

// Восстановить моменты (с группой/глубиной) из сохранённого списка kind (hand.spot.moments).
// Неизвестные kind (после отката/миграции) отбрасываем — не роняем UI.
export function hydrateMoments(kinds: HandMomentKind[]): HandMoment[] {
  return kinds.filter((k) => k in KIND_META).map((kind) => ({ kind, ...KIND_META[kind] }));
}

// Тип → i18n-ключ метки для игрока (значения в messages/*.json). Метки выигрышей НЕЙТРАЛЬНЫ
// (хук «как забрал?», не готовое «переиграл»): оценку вскрывает диалог, не результат.
const KIND_LABEL_KEY: Record<HandMomentKind, string> = {
  BIG_FOLD: "momentBigFold",
  FOLD_INVEST: "momentFoldInvest",
  BIG_CALL: "momentBigCall",
  WON_BLUFF: "momentWonBluff",
  CAUGHT_BLUFF: "momentCaughtBluff",
  MISSED_VALUE: "momentMissedValue",
  OPEN_WIDE: "momentOpenWide",
  LIMP: "momentLimp",
  BB_3BET_WIDE: "momentBb3betWide",
  OPEN_SHOVE_WIDE: "momentOpenShoveWide",
  VS_OPEN_3BET_WIDE: "momentVsOpen3betWide",
  ISO_WIDE: "momentIsoWide",
  SQUEEZE_WIDE: "momentSqueezeWide",
  FOURBET_WIDE: "momentFourbetWide",
  MISSED_3BET_VALUE: "momentMissed3betValue",
  SQUEEZE: "momentSqueeze",
  ISO: "momentIso",
  THREEBET: "momentThreebet",
  COOLER: "momentCooler",
  LUCKY_WIN: "momentLuckyWin",
};

export function momentLabelKey(kind: HandMomentKind): string {
  return KIND_LABEL_KEY[kind];
}

// Частотные отклонения от чарта. По РАЗВОРОТУ Артёма (2026-07-16) игроку в каждом турнире их не
// показываем вообще: разово это задумка, а не ошибка — тыкать в них раздача за раздачей значит
// занудствовать, и парсер всё равно не отличит замысел от зевка. Метки копятся МОЛЧА (spot.marks
// / spot.moments) и работают топливом для ОДНОЙ сводки по дистанции, когда набралась выборка.
export const GROUPED_DEVIATION_KINDS: HandMomentKind[] = [
  "OPEN_WIDE",
  "LIMP",
  "BB_3BET_WIDE",
  "OPEN_SHOVE_WIDE",
  "VS_OPEN_3BET_WIDE",
  "ISO_WIDE",
  "SQUEEZE_WIDE",
  "FOURBET_WIDE",
  "MISSED_3BET_VALUE",
];

// Момент ДЛЯ ПОКАЗА игроку (метка на раздаче) — как primaryMoment, но без частотных отклонений:
// они уходят в сводку по дистанции, а не в бейдж. Остаётся интересное: крупный фолд, выбил
// блефом, поймал блеф, повезло доехать, кулер, сквиз. null — показывать нечего (обычная раздача).
export function displayMoment(moments: HandMoment[]): HandMoment | null {
  return primaryMoment(moments.filter((m) => !GROUPED_DEVIATION_KINDS.includes(m.kind)));
}
