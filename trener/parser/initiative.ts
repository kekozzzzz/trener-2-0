import type { Street, TableSnapshot } from "./types";
import { nodeStateAt } from "./alternatives";
import { bigBlindFromSnapshot } from "./big-blind";
import { isAggressiveActionAt } from "./aggression";

// Инициатива на постфлопе: держит тот, кто сделал ПОСЛЕДНЕЕ агрессивное действие
// (бет/рейз/олл-ин) на предыдущих улицах. Форсы (блайнды/анте) и чек/колл/фолд инициативу
// НЕ дают. Инициатива сдвигается: чек-рейз или донк её забирают. Правило 1: факт считает
// парсер по снимку. Сквозная нить через c-bet, пробу и барели. НЕ вплетено в промпт.

const STREET_ORDER: Record<Street, number> = { PREFLOP: 0, FLOP: 1, TURN: 2, RIVER: 3 };
const STREET_RU: Record<Street, string> = { PREFLOP: "префлопе", FLOP: "флопе", TURN: "тёрне", RIVER: "ривере" };
const STREET_BOARD_LEN: Record<Street, number> = { PREFLOP: 0, FLOP: 3, TURN: 4, RIVER: 5 };

// Инициатива по улицам строкой для промпта (правило 1): кто префлоп-агрессор и у кого лид,
// входя в каждую постфлоп-улицу, — чтобы модель не реконструировала «чью доску»/c-bet/баррель
// из сырого списка действий. Соперников зовём ПОЗИЦИЕЙ (не «Player N»), Hero — «ты».
export function renderInitiative(snapshot: TableSnapshot): string {
  if (snapshot.board.length < 3) return ""; // до флопа отдельный факт не нужен
  const name = (label: string | null): string | null => {
    if (!label) return null;
    if (label === "Hero") return "ты";
    const seat = snapshot.seats.find((s) => s.label === label);
    const pn = seat?.positionName && seat.positionName !== "OTHER" ? seat.positionName : undefined;
    return pn ?? (seat && seat.position !== "OTHER" ? seat.position : null);
  };
  const parts: string[] = [];
  const preAgg = currentAggressor(snapshot, "FLOP"); // агрессор входя во флоп = префлоп-агрессор
  parts.push(
    preAgg
      ? `префлоп инициативу взял ${name(preAgg) ?? "соперник (позиция не определена)"}`
      : "префлоп никто не рейзил (лимпованный банк) - инициативы ни у кого",
  );
  for (const street of ["TURN", "RIVER"] as const) {
    if (snapshot.board.length < STREET_BOARD_LEN[street]) break;
    const agg = currentAggressor(snapshot, street);
    parts.push(
      `входя в ${STREET_RU[street]} - ${agg ? `у ${name(agg) ?? "соперника"}` : "инициативы нет (прошлую улицу прочекали)"}`,
    );
  }
  return `Инициатива (последнее агрессивное действие - считает парсер; «чью доску», c-bet и баррель бери отсюда, не собирай из списка сам): ${parts.join("; ")}.`;
}

// Кто держит инициативу, ВХОДЯ в улицу `street` = актор последнего агрессивного действия
// на предыдущих улицах. null — до этой улицы никто не был агрессивен (напр. лимп-банк).
// ВАЖНО: олл-ин-КОЛЛ парсеры эмитят как action ALL_IN (не CALL) — его инициативой считать
// НЕЛЬЗЯ, иначе тот, кто лишь заколлировал шов, получает «инициативу» (бьёт по кулерам с
// колл-олл-ином). Поэтому ведём currentBet по улицам и засчитываем ALL_IN в агрессию только
// когда он реально поднимает ставку (raw > currentBet) — тот же критерий, что в facts.ts walkPot.
export function currentAggressor(snapshot: TableSnapshot, street: Street): string | null {
  const target = STREET_ORDER[street];
  let aggressor: string | null = null;
  let curStreet: Street | null = null;
  let currentBet = 0;
  const committed = new Map<string, number>();
  for (const a of snapshot.actions) {
    if (STREET_ORDER[a.street] >= target) break; // только предыдущие улицы
    if (a.street !== curStreet) {
      curStreet = a.street;
      currentBet = 0;
      committed.clear();
    }
    const c = committed.get(a.actor) ?? 0;
    const raw = a.amount ?? 0;
    switch (a.action) {
      case "POST_SB":
      case "POST_BB":
        committed.set(a.actor, c + raw);
        currentBet = Math.max(currentBet, c + raw);
        break;
      case "BET":
        committed.set(a.actor, c + raw);
        currentBet = c + raw;
        aggressor = a.actor;
        break;
      case "CALL":
        committed.set(a.actor, c + raw);
        break;
      case "RAISE":
      case "ALL_IN": {
        const isRaise = a.action === "RAISE" || raw > currentBet;
        if (isRaise) {
          committed.set(a.actor, raw);
          currentBet = raw;
          aggressor = a.actor;
        } else {
          committed.set(a.actor, c + raw); // олл-ин как колл-добор — не агрессия
        }
        break;
      }
    }
  }
  return aggressor;
}

// Тактические метки для промпта: c-bet (первый бет флопа от префлоп-агрессора) и чек-рейзы
// по улицам. Фреймворк на них прямо опирается («чек-рейз на тёрне почти всегда сила», «c-bet»),
// а раньше модель распознавала паттерн из сырого списка [N] и путала. Правило 1 — считает парсер.
export function renderTacticalMarks(snapshot: TableSnapshot): string {
  if (snapshot.board.length < 3) return "";
  const name = (label: string): string => {
    if (label === "Hero") return "ты";
    const seat = snapshot.seats.find((s) => s.label === label);
    const pn = seat?.positionName && seat.positionName !== "OTHER" ? seat.positionName : undefined;
    return pn ?? (seat && seat.position !== "OTHER" ? seat.position : "соперник");
  };
  const marks: string[] = [];

  // c-bet: первый агрессивный ход на флопе — бет префлоп-агрессора.
  const preAgg = currentAggressor(snapshot, "FLOP");
  const flopFirstAgg = snapshot.actions.find(
    (a) => a.street === "FLOP" && (a.action === "BET" || a.action === "RAISE" || a.action === "ALL_IN"),
  );
  if (preAgg && flopFirstAgg && flopFirstAgg.actor === preAgg && flopFirstAgg.action === "BET")
    marks.push(`c-bet (продолженную ставку префлоп-агрессора) на флопе поставил ${name(preAgg)}`);

  // Отложенный контбет: префлоп-агрессор ЧЕКНУЛ флоп и поставил на тёрне. Линия ДВУСТОРОННЯЯ —
  // в ней и отказ от банка, и намеренно придержанная сильная рука. Метка нужна потому, что модель
  // читала чек агрессора как категорическое «признал слабость диапазона» и на этом строила совет
  // коллировать (Артём 19.07: «это же может быть блеф-ловушка, фиши такие обожают»).
  if (preAgg) {
    const checkedFlop = snapshot.actions.some(
      (a) => a.street === "FLOP" && a.actor === preAgg && a.action === "CHECK",
    );
    const flopBetByAnyone = snapshot.actions.some(
      (a) => a.street === "FLOP" && (a.action === "BET" || a.action === "RAISE" || a.action === "ALL_IN"),
    );
    const turnLead = snapshot.actions.find(
      (a) => a.street === "TURN" && (a.action === "BET" || a.action === "ALL_IN"),
    );
    if (checkedFlop && !flopBetByAnyone && turnLead && turnLead.actor === preAgg)
      marks.push(
        `отложенный контбет: префлоп-агрессор ${name(preAgg)} чекнул флоп и поставил только на тёрне. ` +
          `Эту линию НЕЛЬЗЯ читать как признание слабости: в ней и отказ от банка, и намеренно ` +
          `придержанная сильная рука (слоуплей на сухой доске — обычное дело на микролимитах). ` +
          `Не пиши «раз чекнул флоп, туза/короля у него почти нет» — чек флопа этого НЕ доказывает`,
      );
  }

  // Чек-рейзы по улицам: тот же actor сначала CHECK, затем РЕЙЗ на той же улице.
  // ⚠️ALL_IN сам по себе чек-рейзом не является: румы пишут им и КОЛЛ ва-банк (см. aggression.ts),
  // а чек-КОЛЛ олл-ина — это не чек-рейз. Сверяем сумму через общий критерий (аудит 18.07).
  const checkedOn = new Map<string, Set<string>>();
  for (const [i, a] of snapshot.actions.entries()) {
    if (a.street === "PREFLOP") continue;
    let checked = checkedOn.get(a.street);
    if (!checked) {
      checked = new Set<string>();
      checkedOn.set(a.street, checked);
    }
    if (a.action === "CHECK") {
      checked.add(a.actor);
    } else if (
      (a.action === "RAISE" || a.action === "ALL_IN") &&
      checked.has(a.actor) &&
      isAggressiveActionAt(snapshot, i)
    ) {
      marks.push(`чек-рейз на ${STREET_RU[a.street]} сделал ${name(a.actor)}`);
    }
  }

  if (marks.length === 0) return "";
  return `Тактические метки (считает парсер - c-bet/чек-рейз бери отсюда, не выводи из списка действий сам): ${marks.join("; ")}.`;
}

export type InitiativeRead = {
  street: Street; // улица, где Hero сдал инициативу (прочекал)
  pot: number;
  suggestedBet: number;
  suggestedBetPctOfPot: number;
  foldsNeededPct: number; // доля диапазона соперника, которая должна сброситься
  rationale: string;
};

// Hero ВЗЯЛ инициативу (последнее агрессивное действие было его - c-bet/бет/чек-рейз), но
// на СЛЕДУЮЩЕЙ улице прочекал первым - сдал лид. Взял инициативу → обычно баррель. Тёрн/
// ривер (флоп-c-bet ловит cbetSpots). ОРИЕНТИР по частоте, не метка «блеф/велью».
export function gaveBackInitiative(snapshot: TableSnapshot): InitiativeRead[] {
  const out: InitiativeRead[] = [];

  for (const street of ["TURN", "RIVER"] as const) {
    if (currentAggressor(snapshot, street) !== "Hero") continue; // инициатива не у Hero
    const idx = snapshot.actions.findIndex((a) => a.street === street && a.actor === "Hero");
    if (idx < 0 || snapshot.actions[idx].action !== "CHECK") continue; // не прочекал первым (баррель/фейс-донк)

    const pot = nodeStateAt(snapshot, idx).pot;
    if (pot <= 0) continue;
    const bet = Math.round((pot * 2) / 3);
    const foldsNeededPct = Math.round((bet / (bet + pot)) * 100);

    out.push({
      street,
      pot,
      suggestedBet: bet,
      suggestedBetPctOfPot: 67,
      foldsNeededPct,
      rationale: `Инициатива была ТВОЯ (последнее агрессивное действие - твоё), а на ${STREET_RU[street]} ты прочекал - сдал лид. Взял инициативу - обычно продолжай (баррель): чек приглашает ставку в тебя, и с мусором придётся сбросить банк, который добрал бы вторым бетом. Ставка ~2/3 окупается, если он сбрасывает больше ${foldsNeededPct}% диапазона. Оговорка: против телефона (не сбрасывает) - только на велью.`,
    });
  }

  return out;
}

// ── Затухающая агрессия соперника (бет…чек) - МЯГКИЙ рид, не приговор ─────────────────
// Соперник ставил на ранних улицах, а на поздней прочекал (его ПОСЛЕДНЕЕ действие - чек
// после ставок). ЧАСТО это выдохшийся блеф или средняя рука без уверенности → против его
// чека можно бить тонко на велью, а его ставку ловить блефкэтчем. НО (правка Артёма) НЕ
// всегда «сдался»: на опасной/добравшей доске он так придерживает готовую руку (топ-пару)
// для контроля банка / на шоудаун. Поэтому это МЯГКИЙ сигнал - взвесь доску и тип оппонента.

// ── Донк-лид: Hero (НЕ владелец инициативы) поставил первым в агрессора ───────────────
// По фреймворку донк-лид обычно слабее, чем чек агрессору (чек-рейз/чек-колл): он
// телеграфирует руку и раздувает банк OOP без инициативы. МЯГКИЙ рид, исключение - лид на
// доске защищающегося под конкретный план.
export type DonkLeadRead = {
  street: Street;
  pot: number; // банк ДО донка
  betSize: number;
  rationale: string;
};

// Свежая ли инициатива соперника, входя в улицу `street`: было ли его агрессивное действие на
// НЕПОСРЕДСТВЕННО предыдущей улице. Правка 2026-07-17 (поймал Артём): currentAggressor отдаёт
// агрессора ЛЮБОЙ прошлой улицы, поэтому «агрессором» ривера числился тот, кто ставил на флопе,
// но ПРОЧЕКАЛ тёрн. А чек агрессора — это отказ от инициативы: ставка Hero первым на ривере тут
// уже НЕ донк, а обычный лид. Тренер писал «ты донкнул в агрессора на ривере после того, как он
// прочекал тёрн» — фраза сама себе противоречит и путает игрока в термине.
function initiativeIsFresh(snapshot: TableSnapshot, street: Street, agg: string): boolean {
  const prev: Record<string, Street | null> = { FLOP: "PREFLOP", TURN: "FLOP", RIVER: "TURN" };
  const p = prev[street];
  if (!p) return false;
  return snapshot.actions.some(
    (a) => a.street === p && a.actor === agg && (a.action === "BET" || a.action === "RAISE" || a.action === "ALL_IN"),
  );
}

export function donkLeads(snapshot: TableSnapshot): DonkLeadRead[] {
  const out: DonkLeadRead[] = [];
  for (const street of ["FLOP", "TURN", "RIVER"] as const) {
    const agg = currentAggressor(snapshot, street);
    if (!agg || agg === "Hero") continue; // Hero сам агрессор - его бет это не донк
    // Агрессор прочекал предыдущую улицу → инициативу отдал → ставка Hero первым это ЛИД, не донк.
    if (!initiativeIsFresh(snapshot, street, agg)) continue;
    const first = snapshot.actions.map((a, i) => ({ a, i })).find((x) => x.a.street === street);
    if (!first || first.a.actor !== "Hero" || first.a.action !== "BET") continue; // Hero не лидил первым

    const node = nodeStateAt(snapshot, first.i);
    const betSize = first.a.amount ?? 0;
    const pot = node.pot - betSize;
    if (pot <= 0) continue;

    out.push({
      street,
      pot,
      betSize,
      rationale: `Ты донкнул (поставил ПЕРВЫМ) в агрессора на ${STREET_RU[street]}. Обычно OOP чекают агрессору - даёшь ему c-bet, а сам играешь чек-рейз или чек-колл; донк-лид редко лучший (телеграфирует руку и раздувает банк OOP без инициативы). Исключение - лид на доске защищающегося под конкретный план/ридс.`,
    });
  }
  return out;
}

// ── Hero перед ДОНКОМ соперника (соперник лидит в Hero-агрессора) ────────────────────
// Инициатива была у Hero, но соперник поставил ПЕРВЫМ (донк в тебя). МЯГКИЙ рид, решает
// ТИП оппонента: донк любителя почти не блеф (реальная рука/дро) → не блеф-рейзь; донк
// рега на доске защищающегося - часто блеф. Без уверенного тега не геройствуй.
export type FacingDonkRead = {
  street: Street;
  donker: string;
  pot: number;
  betSize: number;
  rationale: string;
};

export function facingDonk(snapshot: TableSnapshot): FacingDonkRead[] {
  const out: FacingDonkRead[] = [];
  for (const street of ["FLOP", "TURN", "RIVER"] as const) {
    if (currentAggressor(snapshot, street) !== "Hero") continue; // инициатива не у Hero → это не донк В него
    // Hero прочекал предыдущую улицу → инициативу отдал сам → ставка соперника первым это ЛИД,
    // а не донк в тебя (симметрично donkLeads, см. initiativeIsFresh).
    if (!initiativeIsFresh(snapshot, street, "Hero")) continue;
    const first = snapshot.actions.map((a, i) => ({ a, i })).find((x) => x.a.street === street);
    if (!first || first.a.actor === "Hero" || first.a.action !== "BET") continue; // соперник не лидил первым

    const node = nodeStateAt(snapshot, first.i);
    const betSize = first.a.amount ?? 0;
    const pot = node.pot - betSize;
    if (pot <= 0) continue;

    out.push({
      street,
      donker: first.a.actor,
      pot,
      betSize,
      rationale: `Соперник ДОНКНУЛ (поставил первым) в тебя на ${STREET_RU[street]}, хотя инициатива была твоя. Донк ЛЮБИТЕЛЯ почти не блеф - реальная рука любой силы или дро: против него не блеф-рейзь, играй колл/чек с воздухом. Донк РЕГА на доске под защищающегося (низкая связная) - часто блеф. Решает ТИП оппонента: без уверенного тега не геройствуй.`,
    });
  }
  return out;
}

// ── Размер открытия соперника как рид на силу (только vs рег) ────────────────────────
export type OpenSizeRead = {
  opener: string;
  openBb: number;
  rationale: string;
};

export function openSizeRead(snapshot: TableSnapshot): OpenSizeRead | null {
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb) return null;
  let opener: string | null = null;
  let amount = 0;
  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break;
    if (a.action === "RAISE") { opener = a.actor; amount = a.amount ?? 0; break; } // первый рейз = опен (RFI)
  }
  if (!opener || opener === "Hero") return null; // рид про ОПОНЕНТА
  const openBb = Math.round((amount / bb) * 10) / 10;
  if (openBb < 2.5) return null; // 2-2.2 стандарт - не рид

  return {
    opener,
    openBb,
    rationale: `Опен ${openBb} BB - КРУПНЫЙ (стандарт 2-2.2). На вдумчивом поле крупный опен скорее сила (AQ+, иногда AK, JJ+). Оговорка: рыба на микро часто лупит крупно всем подряд - по ней этот читч ложный. Применяй ТОЛЬКО против рега.`,
  };
}

export type FadingAggressionRead = {
  villain: string;
  betStreets: Street[]; // где соперник ставил
  checkStreet: Street; // где затем прочекал (ослабил линию)
  rationale: string;
};

export function fadingAggression(snapshot: TableSnapshot): FadingAggressionRead[] {
  const bets = new Map<string, Street[]>();
  const last = new Map<string, { action: string; street: Street }>();

  for (const a of snapshot.actions) {
    if (a.actor === "Hero" || a.street === "PREFLOP") continue; // читаем ЛИНИЮ СОПЕРНИКА постфлоп
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;
    if (a.action === "BET" || a.action === "RAISE" || a.action === "ALL_IN") {
      const arr = bets.get(a.actor) ?? [];
      arr.push(a.street);
      bets.set(a.actor, arr);
    }
    last.set(a.actor, { action: a.action, street: a.street });
  }

  const out: FadingAggressionRead[] = [];
  for (const [villain, l] of last) {
    if (l.action !== "CHECK") continue; // сейчас всё ещё агрессивен - не фейд
    const betStreets = bets.get(villain);
    if (!betStreets || betStreets.length === 0) continue; // ни разу не ставил - не фейд

    out.push({
      villain,
      betStreets,
      checkStreet: l.street,
      rationale: `Соперник ставил и затем на ${STREET_RU[l.street]} прочекал - ОСЛАБИЛ линию. ЧАСТО это выдохшийся блеф или средняя рука без уверенности: против его чека можно бить тонко на велью, а его ставку ловить блефкэтчем. НО не всегда «сдался» - на опасной/добравшей доске он так придерживает готовую руку (топ-пару) для контроля банка или на шоудаун. Это МЯГКИЙ сигнал: взвесь доску и тип оппонента, жёстко не читай.`,
    });
  }

  return out;
}
