import type { TableSnapshot } from "./types";
import { detectHeroOpenShove } from "./open-shove";
import { detectHeroResteal } from "./resteal";
import type { PushPosition, StackBand } from "@/config/poker/push-fold-chart";
import type { RestealOpenerGroup, RestealBand } from "@/config/poker/resteal-chart";

// Спот пуша Hero для панели «эталонный диапазон для этого спота» (Артём 18.07: «глянь чарты, что
// можно пушить именно в твоей ситуации»). Переиспользуем готовые детекторы: опен-шов (первым в банк
// на коротком стеке) и рестил (олл-ин поверх чужого опена). Возвращаем ПЛОСКИЕ данные — они уходят
// из серверного компонента в клиентскую панель как props, поэтому только сериализуемые поля.
export type PushRangeSpot =
  | { kind: "openshove"; band: StackBand; position: PushPosition; heroCode: string }
  | { kind: "resteal"; band: RestealBand; openerGroup: RestealOpenerGroup; heroCode: string };

export function heroPushRangeSpot(snapshot: TableSnapshot): PushRangeSpot | null {
  const shove = detectHeroOpenShove(snapshot);
  if (shove) return { kind: "openshove", band: shove.band, position: shove.position, heroCode: shove.code };

  const resteal = detectHeroResteal(snapshot);
  if (resteal) return { kind: "resteal", band: resteal.band, openerGroup: resteal.openerGroup, heroCode: resteal.code };

  return null;
}
