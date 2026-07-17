"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { normalizePerPage, TOURNAMENTS_PER_PAGE_COOKIE } from "@/config/tournaments";

// Сохранить выбор «сколько турниров на странице» (баг Артёма 17.07: ставил 10 — сбрасывалось на
// 25). Раньше размер жил ТОЛЬКО в адресе (?per=N) и терялся, стоило уйти со страницы. Теперь пишем
// в cookie — выбор помнится между заходами, а редирект даёт свежий серверный рендер (заодно снимает
// вопрос клиентского кэша). Размер меняем — возвращаемся на первую страницу (иначе «стр. 6 по 10»
// на новом размере — позиция, которой уже нет).
export async function setTournamentsPerPage(formData: FormData): Promise<void> {
  const raw = Number(formData.get("per"));
  const perPage = normalizePerPage(Number.isFinite(raw) ? raw : 0);
  const store = await cookies();
  store.set(TOURNAMENTS_PER_PAGE_COOKIE, String(perPage), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // год
    sameSite: "lax",
  });
  redirect("/tournaments");
}
