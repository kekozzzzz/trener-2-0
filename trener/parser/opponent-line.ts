import type { Street, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { sizeClass, SIZE_CLASS_RU } from "./facts";

// Факты-v2, фаза 5: линия каждого соперника ОДНОЙ строкой по улицам, чтобы модель не
// реконструировала хронологию из сырого списка «Действия по улицам» (источник каши и у
// быстрых моделей, и у старой). Правило 1: размеры и классы ставок считает парсер.
//
// Показываем только соперников, реально ВЛОЖИВШИХСЯ добровольно (рейз/бет/колл/олл-ин) —
// префлоп-фолды без денег не засоряют. Один игрок = одна строка «Линия X: … → … → …».

const STREET_RU: Record<Street, string> = {
  PREFLOP: "префлоп",
  FLOP: "флоп",
  TURN: "тёрн",
  RIVER: "ривер",
};

type Phrase = { street: Street; text: string };

export function renderOpponentLines(snapshot: TableSnapshot): string {
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb) return "";
  const inBb = (chips: number) => `${Math.round((chips / bb) * 10) / 10} BB`;

  let pot = 0;
  let currentBet = 0;
  let street: Street = "PREFLOP";
  const committed = new Map<string, number>();
  const invested = new Map<string, boolean>(); // вкладывался ли добровольно (для отбора)
  const phrases = new Map<string, Phrase[]>();

  const push = (actor: string, p: Phrase) => {
    const arr = phrases.get(actor) ?? [];
    arr.push(p);
    phrases.set(actor, arr);
  };

  for (const a of snapshot.actions) {
    if (a.street !== street) {
      street = a.street;
      currentBet = 0;
      committed.clear();
    }
    const prev = committed.get(a.actor) ?? 0;
    const isHero = a.actor === "Hero";

    switch (a.action) {
      case "POST_ANTE":
        pot += a.amount ?? 0;
        break;
      case "POST_SB":
      case "POST_BB":
        committed.set(a.actor, prev + (a.amount ?? 0));
        pot += a.amount ?? 0;
        currentBet = Math.max(currentBet, prev + (a.amount ?? 0));
        break;
      case "CHECK":
        if (!isHero) push(a.actor, { street, text: "чек" });
        break;
      case "FOLD":
        if (!isHero && invested.get(a.actor)) push(a.actor, { street, text: "фолд" });
        break;
      case "CALL": {
        const amt = a.amount ?? 0;
        committed.set(a.actor, prev + amt);
        pot += amt;
        if (!isHero) {
          invested.set(a.actor, true);
          push(a.actor, { street, text: "колл" });
        }
        break;
      }
      case "BET": {
        const amt = a.amount ?? 0;
        if (!isHero) {
          invested.set(a.actor, true);
          if (street === "PREFLOP") {
            push(a.actor, { street, text: `бет ${inBb(amt)}` });
          } else if (pot > 0) {
            const pctv = Math.round((amt / pot) * 100);
            push(a.actor, { street, text: `бет ${pctv}% банка (${SIZE_CLASS_RU[sizeClass(pctv)]})` });
          } else {
            push(a.actor, { street, text: `бет ${inBb(amt)}` });
          }
        }
        committed.set(a.actor, prev + amt);
        pot += amt;
        currentBet = prev + amt;
        break;
      }
      case "RAISE":
      case "ALL_IN": {
        const raw = a.amount ?? 0;
        const isRaise = a.action === "RAISE" || raw > currentBet;
        const allIn = a.action === "ALL_IN";
        if (isRaise) {
          const delta = Math.max(raw - prev, 0);
          if (!isHero) {
            invested.set(a.actor, true);
            const wasFirstIn = currentBet <= (street === "PREFLOP" ? bb : 0);
            let text: string;
            if (allIn) text = `олл-ин ${inBb(raw)}`;
            else if (street === "PREFLOP")
              text = `${wasFirstIn ? "опен" : "рейз"} ${inBb(raw)}`;
            else {
              const pctv = pot > 0 ? Math.round((delta / pot) * 100) : 0;
              text = `рейз ${pctv}% банка (${SIZE_CLASS_RU[sizeClass(pctv)]})`;
            }
            push(a.actor, { street, text });
          }
          pot += delta;
          committed.set(a.actor, raw);
          currentBet = raw;
        } else {
          // олл-ин как колл-дельта
          if (!isHero) {
            invested.set(a.actor, true);
            push(a.actor, { street, text: `олл-ин ${inBb(raw)} (колл)` });
          }
          committed.set(a.actor, prev + raw);
          pot += raw;
        }
        break;
      }
    }
  }

  const lines: string[] = [];
  for (const seat of snapshot.seats) {
    if (seat.label === "Hero") continue;
    if (!invested.get(seat.label)) continue; // добровольно не вкладывался — пропускаем
    const ps = phrases.get(seat.label);
    if (!ps || ps.length === 0) continue;

    // Собираем по улицам: «префлоп опен 2.5 BB → флоп чек → тёрн бет 45% (стандарт)».
    const byStreet = new Map<Street, string[]>();
    for (const p of ps) {
      const arr = byStreet.get(p.street) ?? [];
      arr.push(p.text);
      byStreet.set(p.street, arr);
    }
    const chunks: string[] = [];
    for (const s of ["PREFLOP", "FLOP", "TURN", "RIVER"] as const) {
      const arr = byStreet.get(s);
      if (arr && arr.length) chunks.push(`${STREET_RU[s]} ${arr.join(", ")}`);
    }
    if (chunks.length) lines.push(`Линия ${seat.positionName ?? seat.position} (${seat.label}): ${chunks.join(" → ")}.`);
  }

  if (lines.length === 0) return "";
  return ["Линии соперников по улицам (посчитал парсер - не собирай хронологию из сырого списка сам):", ...lines].join("\n");
}
