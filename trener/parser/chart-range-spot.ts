import type { TableSnapshot } from "./types";
import { detectHeroBBDefense } from "./bb-defense";
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
import { isOpenPosition, type OpenPosition } from "@/config/poker/rfi-chart";
import type { OpenerPosition } from "@/config/poker/bb-defense-chart";
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
  const bb = detectHeroBBDefense(snapshot);
  if (bb) return { kind: "bbdefense", opener: bb.openerPosition, heroCode: bb.code };

  const bvb = detectHeroBvbDefense(snapshot);
  if (bvb) return { kind: "bvb", heroCode: bvb.code };

  const rs = detectHeroResteal(snapshot);
  if (rs) return { kind: "resteal", openerGroup: rs.openerGroup, band: rs.band, heroCode: rs.code };

  const cvp = detectHeroCallVsPush(snapshot);
  if (cvp)
    return { kind: "callvspush", pusherGroup: cvp.pusherGroup, pusherBand: cvp.pusherBand, heroCode: cvp.code };

  const vo = detectHeroVsOpen(snapshot);
  if (vo) return { kind: "vsopen", heroPosition: vo.heroPosition, heroCode: vo.code };

  const cvr = detectHeroCallVsResteal(snapshot);
  if (cvr)
    return { kind: "callvsresteal", openerGroup: cvr.openerGroup, jamBand: cvr.jamBand, heroCode: cvr.code };

  const def = detectHeroDefVs3bet(snapshot);
  if (def) return { kind: "defvs3bet", heroPosition: def.heroPosition, heroCode: def.code };

  // Дальше — споты, опознанные, но БЕЗ сетки: показывать нечего, и провалиться ниже нельзя.
  if (detectHeroSqueeze(snapshot)) return null;
  if (detectHeroSbLimp(snapshot)) return null;
  if (detectHeroLimp(snapshot)) return null;

  const open = detectHeroOpen(snapshot);
  if (open) return isOpenPosition(open.position) ? { kind: "rfi", position: open.position, heroCode: open.code } : null;

  const iso = detectHeroIso(snapshot);
  if (iso) return { kind: "iso", heroPosition: iso.heroPosition, heroCode: iso.code };

  const push = detectHeroOpenShove(snapshot);
  if (push) return { kind: "openshove", position: push.position, band: push.band, heroCode: push.code };

  return null;
}
