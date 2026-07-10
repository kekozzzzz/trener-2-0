import type { Street, TableSnapshot } from "./types";
import { boardTexture } from "./facts";
import { boardUpToStreet } from "./table-state";
import { heroMadeHand } from "./made-hand";
import { readHeroDraw } from "./draws";

// Классификатор ФУНКЦИИ ставки/рейза Hero - объективная форма его действия по картам,
// борду и наличию дро (велью / защита / полу-блеф / блеф / неясно). Это НЕ вердикт
// «хорошо или плохо» и НЕ намерение игрока: намерение живёт в голове игрока и снимается
// сократовским вопросом («что ты этим хотел - добор, выбить, защита?»). Классификатор
// даёт тренеру объективный ЯКОРЬ, чтобы сверить его с тем, что игрок САМ назовёт, и не
// спутать велью с блефом («не тупить»). Форму считает парсер (правило 1), «зачем» - игрок.
//
// Граница: форму задают КАРТЫ Hero + текстура + дро; «доберёт ли велью / выбьет ли блеф»
// зависит от диапазона соперника (это уже за отмеченной сеткой / за типом оппонента),
// поэтому здесь только форма-намёк, а не гарантия результата и не ранжирование.

export type ActionShape =
  | "VALUE" // сильная готовая рука ставит на добор
  | "PROTECTION" // топ-пара/оверпара на дровяной доске: велью + защита от дро
  | "THIN_VALUE" // топ-пара на сухой доске: тонкий добор
  | "SEMI_BLUFF" // воздух + реальное дро: два пути к победе
  | "BLUFF" // воздух без дро: расчёт только на фолд соперника
  | "MARGINAL"; // средняя/слабая пара: форма неясна, спросить игрока

export type HeroActionRead = {
  street: Street;
  actionIndex: number;
  action: "BET" | "RAISE";
  madeHand: string; // ru из heroMadeHand
  shape: ActionShape;
  hasDraw: boolean;
  rationale: string; // почему такая форма - внутренний ориентир для тренера
};

// Дровяная доска: не радуга ИЛИ есть связность (даёт дро сопернику → нужна защита).
function isWet(board: string[]): boolean {
  const t = boardTexture(board);
  if (!t) return false;
  return t.suitedness !== "RAINBOW" || t.connected !== "DISCONNECTED";
}

export function heroActionShapes(snapshot: TableSnapshot): HeroActionRead[] {
  const out: HeroActionRead[] = [];

  for (let i = 0; i < snapshot.actions.length; i++) {
    const a = snapshot.actions[i];
    if (a.actor !== "Hero") continue;
    if (a.action !== "BET" && a.action !== "RAISE") continue; // форма только у агрессивного действия
    if (a.street === "PREFLOP") continue; // постфлоп (префлоп судят чарты)

    const board = boardUpToStreet(snapshot.board, a.street);
    if (board.length < 3) continue;
    const made = heroMadeHand(snapshot.heroCards, board);
    if (!made) continue;

    const draw = readHeroDraw(snapshot.heroCards, board);
    const hasDraw = !!draw && !draw.backdoorOnly && draw.outsRaw >= 8; // сильное дро (FD/ОЭСД)
    const wet = isWet(board);

    let shape: ActionShape;
    let rationale: string;

    switch (made.strength) {
      case "STRONG_MADE":
        shape = "VALUE";
        rationale = `сильная готовая рука (${made.ru}) - ставка добирает с того, что слабее`;
        break;
      case "STRONG_PAIR":
        shape = wet ? "PROTECTION" : "THIN_VALUE";
        rationale = wet
          ? `${made.ru} на дровяной доске - велью и защита от дро соперника`
          : `${made.ru} на сухой доске - тонкий добор`;
        break;
      case "MID_PAIR":
      case "WEAK_PAIR":
        shape = "MARGINAL";
        rationale = `${made.ru} - форма ставки неясна: спроси игрока, чего он хотел (добор? выбить? защита?)`;
        break;
      default: // AIR
        if (hasDraw && draw) {
          shape = "SEMI_BLUFF";
          rationale = `воздух + ${draw.kind} - полу-блеф: два пути к победе (фолд сейчас или доезд)`;
        } else {
          shape = "BLUFF";
          rationale = `${made.ru} - блеф: расчёт только на фолд соперника`;
        }
    }

    out.push({ street: a.street, actionIndex: i, action: a.action, madeHand: made.ru, shape, hasDraw, rationale });
  }

  return out;
}
