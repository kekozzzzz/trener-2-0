"use server";

import { requireSession } from "@/features/auth/session";
import { getPlayerCharts, type PlayerChartsView } from "./queries";

// Ленивая загрузка зеркал по клику на «Твои чарты»: на странице турниров не грузим
// все руки заранее, считаем только когда игрок открыл чарты. playerId берём из
// сессии (не из клиента) — защита от IDOR: чужие чарты получить нельзя.
export async function loadPlayerChartsAction(): Promise<PlayerChartsView | null> {
  const { playerId } = await requireSession();
  return getPlayerCharts(playerId);
}
