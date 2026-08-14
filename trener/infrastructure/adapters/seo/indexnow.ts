import { INDEXNOW_KEY } from "@/config/seo-indexnow";
import { getAppBaseUrl } from "@/config/app";

// Адаптер IndexNow: сообщает Bing/Yandex/Seznam, что перечисленные страницы изменились,
// чтобы не ждать планового обхода. Вызывается вручную (scripts/ping-indexnow.ts), не из
// бизнес-логики — поэтому здесь нет полного домен-порта/container.ts, как у LLM/оплаты/
// хранилища (правило 4 соблюдено местоположением: адаптер к внешнему сервису живёт в
// infrastructure/adapters/, но не через DI — вызывающих внутри продукта у него нет).
const ENDPOINT = "https://api.indexnow.org/indexnow";

export type IndexNowResult = { ok: boolean; status: number };

export async function pingIndexNow(urls: string[]): Promise<IndexNowResult> {
  if (urls.length === 0) return { ok: true, status: 0 };

  const base = getAppBaseUrl();
  const host = new URL(base).host;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `${base}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  return { ok: res.ok, status: res.status };
}
