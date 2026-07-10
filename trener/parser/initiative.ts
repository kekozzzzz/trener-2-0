import type { Street, TableSnapshot } from "./types";
import { nodeStateAt } from "./alternatives";
import { bigBlindFromSnapshot } from "./big-blind";

// Инициатива на постфлопе: держит тот, кто сделал ПОСЛЕДНЕЕ агрессивное действие
// (бет/рейз/олл-ин) на предыдущих улицах. Форсы (блайнды/анте) и чек/колл/фолд инициативу
// НЕ дают. Инициатива сдвигается: чек-рейз или донк её забирают. Правило 1: факт считает
// парсер по снимку. Сквозная нить через c-bet, пробу и барели. НЕ вплетено в промпт.

const STREET_ORDER: Record<Street, number> = { PREFLOP: 0, FLOP: 1, TURN: 2, RIVER: 3 };
const STREET_RU: Record<Street, string> = { PREFLOP: "префлопе", FLOP: "флопе", TURN: "тёрне", RIVER: "ривере" };

// Кто держит инициативу, ВХОДЯ в улицу `street` = актор последнего агрессивного действия
// на предыдущих улицах. null — до этой улицы никто не был агрессивен (напр. лимп-банк).
export function currentAggressor(snapshot: TableSnapshot, street: Street): string | null {
  const target = STREET_ORDER[street];
  let aggressor: string | null = null;
  for (const a of snapshot.actions) {
    if (STREET_ORDER[a.street] >= target) break; // только предыдущие улицы
    if (a.action === "BET" || a.action === "RAISE" || a.action === "ALL_IN") aggressor = a.actor;
  }
  return aggressor;
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

export function donkLeads(snapshot: TableSnapshot): DonkLeadRead[] {
  const out: DonkLeadRead[] = [];
  for (const street of ["FLOP", "TURN", "RIVER"] as const) {
    const agg = currentAggressor(snapshot, street);
    if (!agg || agg === "Hero") continue; // Hero сам агрессор - его бет это не донк
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
