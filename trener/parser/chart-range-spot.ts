import type { TableSnapshot } from "./types";
import { detectHeroBBDefense } from "./bb-defense";
import { isHeadsUp } from "./preflop-chart-fact";
import { detectHeroBvbDefense } from "./bvb-defense";
import { detectHeroResteal } from "./resteal";
import { detectHeroCallVsPush } from "./call-vs-push";
import { detectHeroVsOpen } from "./vs-open";
import { detectHeroCallVsResteal } from "./call-vs-resteal";
import { detectHeroDefVs3bet } from "./def-vs-3bet";
import { detectHeroSqueeze } from "./squeeze";
import { detectHeroSbLimp } from "./sb-limp";
import { detectHeroLimp } from "./limp";
import { detectHeroOpen } from "./open-raise";
import { detectHeroIso } from "./iso";
import { detectHeroOpenShove } from "./open-shove";
import { isOpenPosition, rfiCellState, type OpenPosition } from "@/config/poker/rfi-chart";
import { bbCellState, type OpenerPosition } from "@/config/poker/bb-defense-chart";
import { bvbCellState } from "@/config/poker/bvb-chart";
import { vsOpenCellState } from "@/config/poker/vs-open-chart";
import { fourBetCellState } from "@/config/poker/def-vs-3bet-chart";
import { isoCellState } from "@/config/poker/iso-chart";
import type { PusherGroup } from "@/config/poker/call-vs-push-chart";
import type { PushPosition, StackBand } from "@/config/poker/push-fold-chart";
import type { RestealBand, RestealOpenerGroup } from "@/config/poker/resteal-chart";

// Спот Hero для панели «эталонный диапазон для этого спота» (Артём 18.07: «везде, где чарты
// используются, их засунуть» — чтобы на вердикте «в следующий раз фолд» сразу было видно, а с чем
// тогда играть). Возвращаем ПЛОСКИЕ сериализуемые данные: уходят из серверного компонента в
// клиентскую панель как props.
//
// ⚠️ Порядок проверок ЗЕРКАЛИТ spotVerdict() из preflop-chart-fact.ts. Иначе панель показала бы
// не тот чарт, по которому тренер судил раздачу, и эталон разошёлся бы сам с собой.
// Споты без сетки (сквиз — грейдер бинарный; лимпы — диапазона нет) возвращают null и НЕ
// проваливаются в следующие детекторы: раздача уже опознана, чужой чарт там показывать нельзя.
export type ChartRangeSpot =
  | { kind: "bbdefense"; opener: OpenerPosition; heroCode: string }
  | { kind: "bvb"; heroCode: string }
  | { kind: "resteal"; openerGroup: RestealOpenerGroup; band: RestealBand; heroCode: string }
  | { kind: "callvspush"; pusherGroup: PusherGroup; pusherBand: StackBand; heroCode: string }
  | { kind: "vsopen"; heroPosition: OpenPosition; heroCode: string }
  | { kind: "callvsresteal"; openerGroup: RestealOpenerGroup; jamBand: RestealBand; heroCode: string }
  | { kind: "defvs3bet"; heroPosition: OpenPosition; heroCode: string }
  | { kind: "rfi"; position: OpenPosition; heroCode: string }
  | { kind: "iso"; heroPosition: OpenPosition; heroCode: string }
  | { kind: "openshove"; position: PushPosition; band: StackBand; heroCode: string };

export function heroChartRangeSpot(snapshot: TableSnapshot): ChartRangeSpot | null {
  // Хедз-ап нашими чартами не судится (см. isHeadsUp в preflop-chart-fact.ts): там баттон — он же
  // малый блайнд и открывает в разы шире. Панель обязана молчать там же, где молчит вердикт, иначе
  // игроку показали бы 6-max сетку как эталон для хедз-апа.
  if (isHeadsUp(snapshot)) return null;

  // Панель отвечает на вопрос «а как правильно» ПО РАЗОБРАННОМУ решению.
  //
  // Если раздача ушла на постфлоп и Hero там играл, разбор почти всегда про постфлоп, и префлоп-чарт
  // — шум (Артём 18.07: под разбором ривер-блефа с QTo показался чарт ОТКРЫТИЯ, «в этом смысла нет»).
  // НО есть исключение, которое Артём назвал сразу следом: если вердикт говорит «постфлоп сыграл
  // верно, а вот заходить этой рукой не стоило» — чарт как раз НУЖЕН. Поэтому на постфлоп-раздачах
  // показываем сетку не всегда, а когда САМ ВХОД был ВНЕ чарта: тогда вопрос «а с чем заходить» и
  // возникает. Стандартный вход + постфлоп-разбор = молчим.
  //
  // Пуш-споты (опен-шов, рестил, колл олл-ина) этим не задеты: они решают раздачу до флопа, у Hero
  // там постфлоп-ходов физически нет — условие всегда ложно.
  const heroPlayedPostflop = snapshot.actions.some(
    (a) =>
      a.actor === "Hero" &&
      a.street !== "PREFLOP" &&
      (a.action === "BET" || a.action === "RAISE" || a.action === "ALL_IN" || a.action === "CALL"),
  );
  // Показать спот с учётом правила выше: offChart — был ли вход Hero вне эталонного диапазона.
  const gate = <T extends ChartRangeSpot>(spot: T, offChart: boolean): T | null =>
    heroPlayedPostflop && !offChart ? null : spot;

  const bb = detectHeroBBDefense(snapshot);
  if (bb) {
    const st = bbCellState(bb.openerPosition, bb.code);
    // Защищался рукой вне чарта защиты / 3-бетил рукой вне 3-бет-части — вход спорный.
    const off =
      bb.action === "CALL"
        ? st === "FOLD"
        : bb.action === "3BET"
          ? !(st === "THREEBET" || st === "THREEBET_BLUFF")
          : false; // фолд — входа не было, префлоп-урока нет
    return gate({ kind: "bbdefense", opener: bb.openerPosition, heroCode: bb.code }, off);
  }

  const bvb = detectHeroBvbDefense(snapshot);
  if (bvb) {
    const st = bvbCellState(bvb.code);
    const off =
      bvb.action === "CALL"
        ? st === "FOLD"
        : bvb.action === "3BET"
          ? !(st === "THREEBET" || st === "THREEBET_BLUFF")
          : false;
    return gate({ kind: "bvb", heroCode: bvb.code }, off);
  }

  const rs = detectHeroResteal(snapshot);
  if (rs) return { kind: "resteal", openerGroup: rs.openerGroup, band: rs.band, heroCode: rs.code };

  const cvp = detectHeroCallVsPush(snapshot);
  if (cvp)
    return { kind: "callvspush", pusherGroup: cvp.pusherGroup, pusherBand: cvp.pusherBand, heroCode: cvp.code };

  const vo = detectHeroVsOpen(snapshot);
  if (vo) {
    // Чарт судит только 3-бет; холодный колл эталоном сознательно не грейдится — значит и «вход был
    // вне чарта» по коллу мы утверждать не можем, на постфлоп-раздачах такой спот молчит.
    const off = vo.action === "3BET" && vsOpenCellState(vo.heroPosition, vo.code) === "OUT";
    return gate({ kind: "vsopen", heroPosition: vo.heroPosition, heroCode: vo.code }, off);
  }

  const cvr = detectHeroCallVsResteal(snapshot);
  if (cvr)
    return { kind: "callvsresteal", openerGroup: cvr.openerGroup, jamBand: cvr.jamBand, heroCode: cvr.code };

  const def = detectHeroDefVs3bet(snapshot);
  if (def) {
    // Судится только 4-бет; колл 3-бета чарт сознательно не грейдит (вопрос глубины).
    const off = def.action === "4BET" && fourBetCellState(def.heroPosition, def.code) === "OUT";
    return gate({ kind: "defvs3bet", heroPosition: def.heroPosition, heroCode: def.code }, off);
  }

  // Дальше — споты, опознанные, но БЕЗ сетки: показывать нечего, и провалиться ниже нельзя.
  if (detectHeroSqueeze(snapshot)) return null;
  if (detectHeroSbLimp(snapshot)) return null;
  if (detectHeroLimp(snapshot)) return null;

  const open = detectHeroOpen(snapshot);
  if (open) {
    if (!isOpenPosition(open.position)) return null;
    // Открылся рукой вне чарта открытий — вот тогда «не стоило заходить» и чарт нужен.
    const off = rfiCellState(open.position, open.code) === "OUT";
    return gate({ kind: "rfi", position: open.position, heroCode: open.code }, off);
  }

  const iso = detectHeroIso(snapshot);
  if (iso) {
    const off = isoCellState(iso.heroPosition, iso.code) === "OUT";
    return gate({ kind: "iso", heroPosition: iso.heroPosition, heroCode: iso.code }, off);
  }

  const push = detectHeroOpenShove(snapshot);
  if (push) return { kind: "openshove", position: push.position, band: push.band, heroCode: push.code };

  return null;
}
