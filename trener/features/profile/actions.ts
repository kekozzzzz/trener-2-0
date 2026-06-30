"use server";

import { requireSession } from "@/features/auth/session";
import { getOpenChart, type OpenChartView } from "./queries";

// Ленивая загрузка карты открываний по клику на «Твои чарты»: на странице турниров
// не грузим все руки заранее, считаем только когда игрок открыл чарт. playerId берём
// из сессии (не из клиента) — защита от IDOR: чужой чарт получить нельзя.
export async function loadOpenChartAction(): Promise<OpenChartView | null> {
  const { playerId } = await requireSession();
  return getOpenChart(playerId);
}
