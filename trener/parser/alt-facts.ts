import type { Street, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import {
  alternativeRaises,
  checkBetAlternatives,
  cbetSpots,
  probeBetSpots,
  facingRaiseAlternatives,
} from "./alternatives";
import { gaveBackInitiative, fadingAggression, donkLeads, facingDonk, openSizeRead } from "./initiative";
import { heroActionShapes } from "./action-shape";
import { preflopAlternatives } from "./preflop-alternatives";
import { preflopCallDepth } from "./preflop-depth";

// Один чистый заход движка альтернативных веток в промпт (план 2026-07-11, гейтованный
// шаг из плана 2026-07-09): текстовый блок «ветки, которые Hero не сыграл, и риды линий»
// рядом с renderHandFacts. Отдельный модуль, а не facts.ts, — иначе циклический импорт
// (движок сам берёт boardTexture из facts).
//
// Граница (решения Артёма в плане веток): парсер даёт ЧИСЛА непройденной ветки и ФОРМУ
// действия, но НЕ вердикт «так лучше» — ранжирование веток = солвер, а мы сознательно
// не солвер. foldsNeededPct — ДОЛЯ ДИАПАЗОНА соперника, которая должна сброситься,
// НЕ «частота раз»; голый процент игроку не показывается, тренер переводит словами.
//
// Против каши: каждый детектор движка уже гейтован (пусто, когда спот не сработал),
// здесь только рендер готовых строк — 0-2 строки на детектор, без повторов.

const STREET_RU: Record<Street, string> = {
  PREFLOP: "префлопе",
  FLOP: "флопе",
  TURN: "тёрне",
  RIVER: "ривере",
};

export function renderAltFacts(snapshot: TableSnapshot): string {
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb) return "";
  const inBb = (chips: number) => `${Math.round((chips / bb) * 10) / 10} BB`;
  const lines: string[] = [];

  // Непройденная префлоп-ветка по эталонным чартам (лимп→рейз, джем по Nash, рестил…).
  const pre = preflopAlternatives(snapshot);
  if (pre) lines.push(`Непройденная префлоп-ветка (по эталонному чарту): ${pre.rationale}.`);

  // Глубина колла рейза префлоп: живы ли имплайды — делает спекулятивный колл конкретным.
  const depth = preflopCallDepth(snapshot);
  if (depth)
    lines.push(
      `Глубина колла префлоп (${depth.level === "OPEN" ? "колл опена" : depth.level === "3BET" ? "колл 3-бета" : "колл 4-бета"}): банк после колла ≈${depth.potBb} BB, эффективный остаток ≈${depth.effectiveStackBb} BB, проектный SPR флопа ≈${depth.projectedFlopSpr} — ${
        depth.impliedOddsAlive
          ? "глубоко, у спекулятивной руки есть что добрать при попадании"
          : "мелко, имплайд-оддсы мертвы: соперник доложит остаток на любом флопе, добирать нечего"
      }.`,
    );

  // Непройденный постфлоп-рейз (велью / полу-блеф / дешёвый) — числа ветки, не вердикт.
  for (const r of alternativeRaises(snapshot)) {
    const played = r.actualAction === "CALL" ? "колла" : "фолда";
    const head = `Непройденная ветка на ${STREET_RU[r.street]}: рейз до ${inBb(r.raiseTo)} вместо ${played}`;
    if (r.reason === "VALUE_RAISE") {
      lines.push(
        `${head} с ${r.madeHand} (кандидат на велью-рейз); при колле банк ≈${inBb(r.potIfCalled)}; как чистая атака окупается, если сбросится ≥${r.foldsNeededPct}% диапазона соперника.`,
      );
    } else if (r.reason === "SEMI_BLUFF_DRAW") {
      lines.push(
        `${head} как полу-блеф с ${r.drawKind} (${r.outsRaw} аутов${r.outsClean !== undefined && r.outsClean < (r.outsRaw ?? 0) ? `, чистых ${r.outsClean}` : ""}${r.drawEquityRawPct !== undefined ? `, эквити ≈${r.drawEquityCleanPct ?? r.drawEquityRawPct}–${r.drawEquityRawPct}%` : ""}): два пути к победе — сбросится ≥${r.foldsNeededPct}% диапазона соперника, либо при колле банк ≈${inBb(r.potIfCalled)} на доезд.`,
      );
    } else {
      lines.push(
        `${head}: соперник поставил мелко, у Hero ${r.madeHand}${r.drawKind ? ` + ${r.drawKind}` : ""} — дешёвый рейз давит его слабый сайзинг; окупается, если сбросится ≥${r.foldsNeededPct}% его диапазона.`,
      );
    }
  }

  // Упущенный бет после чека (недобор / полу-блеф) — улица прочекана насквозь.
  for (const c of checkBetAlternatives(snapshot)) {
    lines.push(
      `Непройденная ветка на ${STREET_RU[c.street]}: ${c.rationale}; при колле банк ≈${inBb(c.potIfCalled)}${c.foldsNeededPct !== undefined ? `, как атака окупается при сбросе ≥${c.foldsNeededPct}% диапазона соперника` : ""}.`,
    );
  }

  // Инициатива: упущенный c-bet на своей доске / упущенная проба / сдал лид.
  for (const s of cbetSpots(snapshot)) lines.push(`Спот c-bet (флоп): ${s.rationale}`);
  for (const s of probeBetSpots(snapshot)) lines.push(`Спот пробы (тёрн): ${s.rationale}`);
  for (const s of gaveBackInitiative(snapshot)) lines.push(`Инициатива: ${s.rationale}`);

  // Пассивный колл рейза слабой рукой на тёрне/ривере — упущенный фолд (мягко).
  for (const f of facingRaiseAlternatives(snapshot)) lines.push(`Колл против рейза: ${f.rationale}`);

  // Объективная ФОРМА агрессии Hero — якорь для сверки с намерением игрока, не намерение.
  const shapes = heroActionShapes(snapshot);
  if (shapes.length > 0) {
    const parts = shapes.map(
      (s) => `${s.action === "BET" ? "ставка" : "рейз"} на ${STREET_RU[s.street]} — ${s.rationale}`,
    );
    lines.push(
      `Форма агрессии Hero по картам и борду (объективный якорь, НЕ его намерение — намерение спрашивай у игрока и сверяй с формой): ${parts.join("; ")}.`,
    );
  }

  // Мягкие риды линий соперника и донков — сигналы, не приговоры.
  for (const r of fadingAggression(snapshot)) lines.push(`Линия соперника (${r.villain}): ${r.rationale}`);
  for (const d of donkLeads(snapshot)) lines.push(`Донк-лид Hero: ${d.rationale}`);
  for (const d of facingDonk(snapshot)) lines.push(`Донк в Hero (${d.donker}): ${d.rationale}`);
  const open = openSizeRead(snapshot);
  if (open) lines.push(`Размер опена (${open.opener}): ${open.rationale}`);

  if (lines.length === 0) return "";
  return [
    "Ветки, которые Hero не сыграл, и риды линий (посчитано парсером). Это ЧИСЛА и ФОРМА, не вердикт «надо было иначе»: используй как материал для сократовского вопроса и сверки с тем, что игрок скажет сам. Пороги окупаемости здесь — ДОЛЯ ДИАПАЗОНА соперника, которая должна сброситься, а не «как часто он сбрасывает»; игроку голые проценты не показывай, переводи словами:",
    ...lines,
  ].join("\n");
}
