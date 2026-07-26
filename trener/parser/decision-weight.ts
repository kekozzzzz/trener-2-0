import type { Street, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { nodeStateAt, checkBetAlternatives } from "./alternatives";
import { heroActionShapes } from "./action-shape";
import { detectHeroLuckyWin, equityVsHand } from "./lucky-win";
import { heroMadeHand, cardSetValue, compareValues } from "./made-hand";
import { readHeroDraw } from "./draws";
import { equityVsRangePreflop } from "./cooler";
import { detectHeroFacedFourBet } from "./vs-fourbet-faced";
import { handCode } from "@/config/poker/hand-codes";
import { referenceFourBetRange } from "@/config/poker/def-vs-3bet-chart";

// Критические ПО РЕШЕНИЮ (план 2026-07-11-критические-по-решению): раздачи, где было
// ТЯЖЁЛОЕ решение без денежного следа — они не всплывают ни по потере (фолд теряет мало),
// ни по вскрытию (карт никто не показал). Каналы детерминированные, LLM не участвует.
//
// Граница (как у движка веток): парсер даёт ФАКТ «здесь было тяжёлое решение» и числа
// точки решения, но НЕ вердикт «фолд был плохой» — правоту выясняет сократовский диалог.
// Вес решения (weightBb) — банк в точке решения плюс цена, в BB: ранжир кандидатов
// внутри потолка критических, замена ранжиру «по размеру потери».

// Пороги существенности зеркалят lucky-win.ts: решение за заметные фишки, не блок-бет.
const SIGNIFICANT_BB = 5;
const SIGNIFICANT_STACK_SHARE = 0.1;

// Пограничный выигранный колл: эквити против вскрытой руки между «далеко позади»
// (доезд, <33) и «далеко впереди» (кулер, ≥67) — решение было близким.
const MARGINAL_EQUITY_MIN = 33;
const MARGINAL_EQUITY_MAX = 67;

// Недобор (чек сильной руки) берём в критические только при заметном банке — мелкий
// прочеканный банк не тянет на диалог, им займётся строка фактов.
const MISSED_VALUE_MIN_POT_BB = 5;

// Эталонный диапазон 4-бета (план 2026-07-27-выиграл-но-ошибся-vs-4бет.md): порог не
// откалиброван солвером — грубая эвристика «по типовому диапазону, скорее, был позади».
// НЕ подставляем сюда тип соперника (NIT/FISH/LAG) — этот канал считается ещё на этапе
// классификации раздач (parser/ggpoker/classify.ts), когда профиль оппонента (БД, асинхронно)
// ещё не посчитан; берём только базовый (велью+блеф-блокеры) диапазон его позиции.
const NARROW_RANGE_EQUITY_MAX = 50;

const CONTINUE_ACTIONS = new Set(["CALL", "RAISE", "ALL_IN", "BET"]);
const STREET_BOARD_LEN: Record<Street, number> = { PREFLOP: 0, FLOP: 3, TURN: 4, RIVER: 5 };

export type DecisionChannel =
  | "BIG_FOLD" // фолд против существенной ставки после своего добровольного входа
  | "FOLD_INVEST" // фолд на улице, где Hero сам существенно поставил/рейзил
  | "WON_BLUFF" // выигрыш без вскрытия, последняя крупная агрессия — блеф/полу-блеф
  | "BIG_CALL_WON" // выигрыш со вскрытием при пограничном эквити существенного колла
  | "MISSED_VALUE" // тёрн/ривер прочеканы с сильной рукой при заметном банке
  | "WON_VS_NARROW_RANGE"; // выигрыш продолжения против 4-бета, типовой диапазон которого обычно уже

export type DecisionMark = {
  channel: DecisionChannel;
  street: Street;
  potBb: number; // банк в точке решения, BB
  toCallBb?: number; // цена решения (фолды/коллы), BB
  weightBb: number; // банк + цена — ранжир кандидатов
};

// Тай-брейк при РАВНОМ весе (найдено Артёмом 26.07): вес — не единственный критерий,
// иначе побеждает канал, который в коде добавлен раньше, — случайность порядка кода,
// а не осознанный выбор. Конкретный триггер: BIG_FOLD и FOLD_INVEST могут сработать на
// ОДНОЙ И ТОЙ ЖЕ точке решения (свой крупный бет на улице → рейз соперника → фолд на
// ТОЙ ЖЕ улице) — оба считают weightBb от одного и того же node.pot/node.toCall, вес
// совпадает всегда. FOLD_INVEST в этом случае — более конкретная и полная история
// («сам поставил и знал, каким будет план на рейз»), BIG_FOLD — общий случай, уместен,
// когда более специфичный канал не сработал. Меньшее число — выше приоритет.
const CHANNEL_PRIORITY: Record<DecisionChannel, number> = {
  FOLD_INVEST: 0,
  MISSED_VALUE: 1,
  BIG_CALL_WON: 2,
  WON_BLUFF: 3,
  BIG_FOLD: 4,
  WON_VS_NARROW_RANGE: 5,
};

// Все сработавшие каналы раздачи (без дублей канала — берётся самая тяжёлая точка).
export function decisionMarks(snapshot: TableSnapshot, chipResult: number): DecisionMark[] {
  const bb = bigBlindFromSnapshot(snapshot);
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!bb || !heroSeat) return [];
  const minAmount = Math.max(SIGNIFICANT_BB * bb, heroSeat.startingStack * SIGNIFICANT_STACK_SHARE);
  const toBb = (chips: number) => Math.round((chips / bb) * 10) / 10;

  const byChannel = new Map<DecisionChannel, DecisionMark>();
  const add = (m: DecisionMark) => {
    const prev = byChannel.get(m.channel);
    if (!prev || m.weightBb > prev.weightBb) byChannel.set(m.channel, m);
  };

  const heroFoldIdx = snapshot.actions.findIndex((a) => a.actor === "Hero" && a.action === "FOLD");
  if (heroFoldIdx >= 0) {
    const node = nodeStateAt(snapshot, heroFoldIdx);
    // BIG_FOLD: существенная цена колла И Hero до этого сам добровольно вошёл в банк.
    // Фолд мусора на первом же решении против чужого олл-ина — не тяжёлое решение.
    const investedBefore = snapshot.actions.some(
      (a, i) => i < heroFoldIdx && a.actor === "Hero" && CONTINUE_ACTIONS.has(a.action),
    );

    // Калибровка по разметке Артёма (2026-07-11, Test/audit/калибровка-крупного-фолда.md):
    // «воздух сдался на обычную ставку» — рутина, не диалог. Тяжёлым фолд делает то, что
    // было ЗА ЧТО держаться: своя готовая рука (пара+ по heroMadeHand, борд-пара = AIR),
    // сильное живое дро, карманная пара на префлопе (оборванный сет-майн) — либо уже
    // КРУПНОЕ собственное вложение в раздачу (3-бет/сквиз/контбет ≥ порога существенности).
    let hadSomething = false;
    if (node.board.length >= 3) {
      const made = heroMadeHand(snapshot.heroCards, node.board);
      if (made && made.strength !== "AIR") hadSomething = true;
      if (!hadSomething && node.board.length <= 4) {
        const draw = readHeroDraw(snapshot.heroCards, node.board);
        if (draw && !draw.backdoorOnly && draw.outsRaw >= 8) hadSomething = true;
      }
    } else {
      const code = handCode(snapshot.heroCards);
      if (code && code.length === 2) hadSomething = true; // карманная пара до флопа
    }
    const heroInvested = heroSeat.startingStack - node.heroRemaining;
    if (heroInvested >= minAmount) hadSomething = true;

    if (node.toCall >= minAmount && investedBefore && hadSomething)
      add({
        channel: "BIG_FOLD",
        street: node.street,
        potBb: toBb(node.pot),
        toCallBb: toBb(node.toCall),
        weightBb: toBb(node.pot + node.toCall),
      });

    // FOLD_INVEST: на улице фолда Hero уже сам существенно поставил/рейзил (бет → фолд).
    const foldStreet = snapshot.actions[heroFoldIdx].street;
    const investedThisStreet = snapshot.actions.some(
      (a, i) =>
        i < heroFoldIdx &&
        a.actor === "Hero" &&
        a.street === foldStreet &&
        (a.action === "BET" || a.action === "RAISE") &&
        (a.amount ?? 0) >= minAmount,
    );
    if (investedThisStreet)
      add({
        channel: "FOLD_INVEST",
        street: foldStreet,
        potBb: toBb(node.pot),
        toCallBb: toBb(node.toCall),
        weightBb: toBb(node.pot + node.toCall),
      });
  }

  const shown = snapshot.seats.filter((s) => s.label !== "Hero" && s.shownCards?.length === 2);

  // WON_BLUFF: выиграл, никто не вскрылся, последняя крупная постфлоп-агрессия Hero —
  // блеф или полу-блеф по объективной форме (action-shape). «Сработало» ≠ «правильно».
  if (chipResult > 0 && shown.length === 0) {
    const shapes = heroActionShapes(snapshot);
    for (let k = shapes.length - 1; k >= 0; k--) {
      const s = shapes[k];
      if ((snapshot.actions[s.actionIndex]?.amount ?? 0) < minAmount) continue;
      if (s.shape === "BLUFF" || s.shape === "SEMI_BLUFF") {
        const node = nodeStateAt(snapshot, s.actionIndex);
        add({ channel: "WON_BLUFF", street: s.street, potBb: toBb(node.pot), weightBb: toBb(node.pot) });
      }
      break; // смотрим только ПОСЛЕДНЮЮ крупную агрессию — она забрала банк
    }
  }

  // BIG_CALL_WON: выиграл со вскрытием, существенный постфлоп-колл при пограничном
  // эквити против худшей из показанных рук — решение было близким, доезд/кулер его не ловят.
  if (chipResult > 0 && shown.length > 0 && snapshot.heroCards?.length === 2) {
    for (let i = 0; i < snapshot.actions.length; i++) {
      const a = snapshot.actions[i];
      if (a.actor !== "Hero" || a.action !== "CALL" || a.street === "PREFLOP") continue;
      if ((a.amount ?? 0) < minAmount) continue;
      const board = snapshot.board.slice(0, STREET_BOARD_LEN[a.street]);
      if (board.length !== STREET_BOARD_LEN[a.street]) continue;
      let minEq: number | null = null;
      for (const seat of shown) {
        const eq = equityVsHand(snapshot.heroCards, seat.shownCards!, board);
        if (eq === null) continue;
        if (minEq === null || eq < minEq) minEq = eq;
      }
      if (minEq !== null && minEq >= MARGINAL_EQUITY_MIN && minEq < MARGINAL_EQUITY_MAX) {
        const node = nodeStateAt(snapshot, i - 1);
        add({
          channel: "BIG_CALL_WON",
          street: a.street,
          potBb: toBb(node.pot),
          toCallBb: toBb(node.toCall),
          weightBb: toBb(node.pot + node.toCall),
        });
      }
    }
  }

  // WON_VS_NARROW_RANGE: выиграл, продолжив (колл/рейз/олл-ин) против 4-бета исходного
  // опенера над собственным 3-бетом/сквизом Hero — и эквити его руки против ТИПОВОГО
  // диапазона 4-бета для позиции опенера (не против того, что показала ЭТА раздача)
  // ниже порога. Принцип 2 продукта: «выиграл, но, возможно, ошибся» — конкретный
  // соперник мог быть шире нормы, но решение сверяется с типовым диапазоном, а не с
  // везением. detectHeroLuckyWin/cooler этот спот не ловят (эквити считается против
  // ДИАПАЗОНА, не против вскрытой руки — она тут может не понадобиться вовсе).
  if (chipResult > 0) {
    const faced = detectHeroFacedFourBet(snapshot);
    if (faced && faced.openerPosition) {
      const heroPreflopContinues = snapshot.actions
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => a.street === "PREFLOP" && a.actor === "Hero" && CONTINUE_ACTIONS.has(a.action));
      const last = heroPreflopContinues[heroPreflopContinues.length - 1];
      if (last && (last.a.amount ?? 0) >= minAmount) {
        const eq = equityVsRangePreflop(snapshot.heroCards, referenceFourBetRange(faced.openerPosition));
        if (eq !== null && eq.equityPct < NARROW_RANGE_EQUITY_MAX) {
          const node = nodeStateAt(snapshot, last.i);
          add({
            channel: "WON_VS_NARROW_RANGE",
            street: "PREFLOP",
            potBb: toBb(node.pot),
            toCallBb: toBb(node.toCall),
            weightBb: toBb(node.pot + node.toCall),
          });
        }
      }
    }
  }

  // MISSED_VALUE: тёрн/ривер прочеканы насквозь с сильной рукой при заметном банке —
  // недобор (checkBetAlternatives уже гейтует силу руки и «прочекали насквозь»).
  for (const c of checkBetAlternatives(snapshot)) {
    if (c.reason !== "MISSED_VALUE") continue;
    if (c.street !== "TURN" && c.street !== "RIVER") continue;
    // Недобор реален ТОЛЬКО если на прочеканной улице рука Hero была старше вскрытых рук
    // соперников: тогда велью/защитная ставка забрала бы фишки — даже если соперник ПОТОМ доехал
    // (это и есть урок «дал бесплатную карту»). Если Hero был позади/наравне вскрытой руки
    // (66 против JJ на QQ432) — недобора не было. Судим по МОМЕНТУ решения, не по нетто-итогу
    // (правило: не суди по результату). Вскрытия нет → по нетто: не забрал банк = рука не победила.
    const shown = snapshot.seats.filter((s) => s.label !== "Hero" && s.shownCards?.length === 2);
    if (shown.length > 0 && snapshot.heroCards.length === 2) {
      const boardThen = snapshot.board.slice(0, STREET_BOARD_LEN[c.street]);
      const heroVal = cardSetValue([...snapshot.heroCards, ...boardThen]);
      const aheadOfAll = shown.every(
        (s) => compareValues(heroVal, cardSetValue([...s.shownCards!, ...boardThen])) > 0,
      );
      if (!aheadOfAll) continue; // был позади/наравне вскрытой руки — не недобор
    } else if (chipResult <= 0) {
      continue; // без вскрытия и без нетто-выигрыша рука не победила — недобора нет
    }
    const potBb = toBb(nodeStateAt(snapshot, c.actionIndex).pot);
    if (potBb < MISSED_VALUE_MIN_POT_BB) continue;
    add({ channel: "MISSED_VALUE", street: c.street, potBb, weightBb: potBb });
  }

  return [...byChannel.values()].sort(
    (a, b) => b.weightBb - a.weightBb || CHANNEL_PRIORITY[a.channel] - CHANNEL_PRIORITY[b.channel],
  );
}

// Самый тяжёлый канал раздачи — ранжир кандидата в критические.
export function topDecisionMark(snapshot: TableSnapshot, chipResult: number): DecisionMark | null {
  const marks = decisionMarks(snapshot, chipResult);
  return marks.length > 0 ? marks[0] : null;
}

// ── Причина попадания в критические — строка для промпта тренера ─────────────────────
// Тренер обязан знать, ПОЧЕМУ раздача выбрана: без этого он ищет потерю в раздаче-фолде
// или хвалит выигранный блеф. Причины пересчитываются из снимка на рендере промпта
// (детерминированно, без поля в БД). Проза русская для обеих локалей — как renderHandFacts.

const STREET_LOC: Record<Street, string> = {
  PREFLOP: "префлопе",
  FLOP: "флопе",
  TURN: "тёрне",
  RIVER: "ривере",
};

const CHANNEL_REASON: Record<DecisionChannel, (m: DecisionMark) => string> = {
  BIG_FOLD: (m) =>
    `крупный фолд на ${STREET_LOC[m.street]}: в банке ${m.potBb} BB игроку предлагали доплатить ${m.toCallBb} BB после его собственного входа в банк, и он сбросил. Разбирается САМ ФОЛД — он мог быть и дисциплинированно верным, и потерей банка, который принадлежал игроку; суди из точки решения`,
  FOLD_INVEST: (m) =>
    `фолд после собственной крупной ставки на ${STREET_LOC[m.street]}: игрок вложился на этой улице и сбросил на поднятие. Разбирается связка «ставка → фолд»: и план самой ставки, и правильность выхода`,
  WON_BLUFF: (m) =>
    `банк ${m.potBb} BB забран крупной агрессией без вскрытия, по объективной форме руки это блеф/полу-блеф. «Сработало» ещё не значит «правильно»: разбирается, окупается ли эта линия против диапазона соперника на дистанции — и хвалить выигрыш авансом нельзя, и ругать агрессию за смелость нельзя`,
  BIG_CALL_WON: (m) =>
    `пограничный выигранный колл на ${STREET_LOC[m.street]} (${m.toCallBb} BB в банк ${m.potBb} BB): решение было близким — ни явный доезд, ни явное «далеко впереди». Разбирается цена колла в точке решения, не итог`,
  MISSED_VALUE: (m) =>
    `${STREET_LOC[m.street] === "тёрне" ? "тёрн" : "ривер"} прочекан с сильной готовой рукой при банке ${m.potBb} BB — возможный недобор. Разбирается, был ли бет, который заплатили бы руки слабее`,
  WON_VS_NARROW_RANGE: (m) =>
    `выигранное продолжение против 4-бета на префлопе: банк в точке решения ${m.potBb} BB, доплата ${m.toCallBb} BB. Раздача выбрана НЕ из-за вскрытой руки соперника (она вторична и могла быть выбросом), а потому что против ТИПОВОГО диапазона 4-бета для его позиции (обычно только AA/KK/QQ+/AK, изредка блеф-блокер тузом) продолжение чаще проигрышно. В этот раз конкретный соперник оказался шире нормы и раздача выиграна — разбирается решение продолжить ПРОТИВ ОЖИДАЕМОГО диапазона, а не то, что показал именно этот соперник. ВАЖНО: если игрок объясняет, что уже видел от ЭТОГО соперника нестандартную агрессию за столом раньше (лишние рейзы, спью-4-беты) — это меняет разбор: у игрока мог быть настоящий рид, и тогда продолжение было осознанным эксплойтом, а не удачей вслепую; сначала выясни, что он знал про этого соперника, и только потом оценивай решение. Не хвали за сам факт выигрыша и не выдавай эталонный диапазон за то, что игрок точно знал в момент решения`,
};

// Блок «почему раздача в разборе» для критической раздачи. Пустая строка, если причин
// не видно (например, отбор по деньгам без каналов — тогда достаточно результата в фишках).
export function renderCriticalReason(snapshot: TableSnapshot, chipResult: number): string {
  const reasons: string[] = [];

  const lucky = detectHeroLuckyWin(snapshot);
  if (lucky && chipResult > 0)
    reasons.push(
      `выигранный доезд: в момент крупного вложения на ${STREET_LOC[lucky.street]} эквити игрока против вскрытой руки соперника было ≈${lucky.equityPct}% — раздача выиграна, но разбирается КАЧЕСТВО решения, не результат (эквити по вскрытию — причина отбора, в самом разборе суди по диапазону, который игрок мог видеть)`,
    );

  const mark = topDecisionMark(snapshot, chipResult);
  if (mark) reasons.push(CHANNEL_REASON[mark.channel](mark));

  if (reasons.length === 0 && chipResult < 0)
    reasons.push(
      "дорогая спорная потеря: игрок продолжил после чужого добровольного вложения и проиграл заметные фишки. Это отбор по размеру потери, НЕ приговор решению: кулер и правильный проигрыш — полноценный вердикт",
    );
  if (reasons.length === 0) return "";

  return [
    "Почему эта раздача выбрана в разбор (детерминированный отбор парсера, НЕ вердикт):",
    ...reasons.map((r) => `- ${r}`),
    "Причина отбора называет ХАРАКТЕР спота — какое решение разбирать. Не подгоняй ошибку под причину: решение могло быть верным, тогда так прямо и скажи.",
  ].join("\n");
}

// Тема ПЕРВОГО вопроса тренера, привязанная к КОНКРЕТНОМУ решению раздачи (правка 2026-07-17).
// Проблема (регресс, Артём): первый вопрос в 100% случаев «с каким диапазоном…» — покер про
// РЕШЕНИЕ и мышление, а не только про диапазоны; после 10 таких раздач игрок пошлёт тренера.
// Причина: промпт упоминает диапазон 134 раза (теория «суди руку против всего диапазона»), и три
// из пяти CHANNEL_REASON сами заканчиваются «суди по диапазону». Модель тянется к самой заметной
// теме. Промптом-просьбой не лечится (проверено 3×) — даём ФАКТ: у каждого решения своя тема.
// Замысел («что ты хотел этим ходом?») у решения есть ВСЕГДА, а диапазон — лишь один из инструментов.
const CHANNEL_QUESTION_TOPIC: Record<DecisionChannel, string> = {
  BIG_FOLD:
    "спот про КРУПНЫЙ ФОЛД. Спроси про голову игрока в момент сброса: чего он испугался, что он вложил в руку соперника, был ли готов расстаться с банком. Пример темы: «что тебя остановило — какую руку ты у него увидел?». НЕ начинай с «с каким диапазоном» — фолд это про страх и чтение, а не про перечисление рук.",
  FOLD_INVEST:
    "спот про связку СТАВКА → ФОЛД (сам вложился и сбросил на поднятие). Спроси про ЗАМЫСЕЛ самой ставки: чего он хотел ею добиться и что планировал на поднятие. Пример: «что ты хотел этой ставкой и на что рассчитывал, если поднимут?».",
  WON_BLUFF:
    "спот про АГРЕССИЮ БЕЗ ВСКРЫТИЯ (по форме — блеф/полу-блеф, банк забран). Спроси про ЗАМЫСЕЛ: на что он рассчитывал, кого хотел выбить, был ли план на колл. Пример: «на что ты рассчитывал этой ставкой — кого выбивал?». НЕ хвали за то, что «сработало».",
  BIG_CALL_WON:
    "спот про ПОГРАНИЧНЫЙ КОЛЛ (решение было близким). Спрашивай через ЗАМЫСЕЛ игрока: почему он посчитал колл выгодным, что его склонило заплатить. Пример: «почему решил заплатить — что подсказало, что ты чаще прав?». НЕ начинай с «с каким диапазоном соперник…» — это про ТВОЙ анализ; диапазон отметить можно ПОЗЖЕ в диалоге, если он реально решает.",
  MISSED_VALUE:
    "спот про ВОЗМОЖНЫЙ НЕДОБОР (сильная рука прочекана). Спроси про ЗАМЫСЕЛ чека: почему не поставил, кого боялся спугнуть, видел ли, кто заплатил бы. Пример: «почему решил чекнуть — от кого ждал ставки?».",
  WON_VS_NARROW_RANGE:
    "спот про ПРОДОЛЖЕНИЕ ПРОТИВ 4-БЕТА на префлопе (выигранное, но диапазон соперника обычно намного уже, чем показал этот конкретный случай). Спроси про ЗАМЫСЕЛ ДО результата: с каким диапазоном соперника он играл, когда решал продолжать, и БЫЛ ЛИ у него рид именно на ЭТОГО соперника (видел его лишние рейзы раньше за столом?) — или это была оценка «вслепую», по типовому диапазону. Пример: «когда он 4-бетил, с какими руками ты его там видел — и почему именно так?». НЕ хвали за выигрыш — раздача выбрана именно потому, что решение стоит сверить с типичным диапазоном 4-бета, а не с тем, что выпало у конкретного соперника; но если у игрока был настоящий рид на этого соперника — это меняет разбор, не отметай его объяснение.",
};

// Тема ПЕРВОГО вопроса. Раньше при отсутствии явного канала возвращали null → тема НЕ вставлялась
// (hand-analysis.ts) → модель по умолчанию скатывалась в «с каким диапазоном» (регресс, Артём 17.07:
// постфлоп-раздачи #82/#106 и префлоп-олл-ины начинались с диапазона, а надо — с замысла). Теперь
// дефолт НЕ null: у ЛЮБОГО решения есть замысел, с него и начинаем; диапазон — инструмент на потом.
const DEFAULT_QUESTION_TOPIC =
  "у этого решения нет одного яркого триггера-канала, но ЗАМЫСЕЛ есть всегда. Спроси, что игрок хотел своим ключевым ходом (ставкой / коллом / олл-ином / чеком) и на что рассчитывал — «что у тебя было в голове, когда ты…». НЕ начинай с «с каким диапазоном соперник…»: это про ТВОЙ анализ, а не про мышление игрока; диапазон отметить можно ПОЗЖЕ в диалоге, если он реально решает исход.";

export function questionTopicHint(snapshot: TableSnapshot, chipResult: number): string {
  const mark = topDecisionMark(snapshot, chipResult);
  return mark ? CHANNEL_QUESTION_TOPIC[mark.channel] : DEFAULT_QUESTION_TOPIC;
}
