import { getAppBaseUrl } from "@/config/app";
import { getPlans, formatUsd } from "@/config/plans";
import { ROOM_SHORT_NAMES } from "@/config/rooms";
import { REFERENCE_CHART_COUNT } from "@/config/poker/reference-charts";

// llms.txt — краткая справка о продукте для ИИ-краулеров (ChatGPT, Perplexity и т.п.),
// неофициальный стандарт llmstxt.org. Не влияет на обычный поиск (это не robots/sitemap) —
// отдельный текстовый файл, который читают LLM-агенты при обходе сайта. Цифры и цены —
// из тех же конфигов, что и витрина (design-system.md: «на витрине живёт только то, что
// можно проверить»), чтобы этот файл не разошёлся с сайтом при следующей смене тарифа.
export const dynamic = "force-dynamic";

export async function GET() {
  const base = getAppBaseUrl();
  const priceFrom = formatUsd(Math.min(...getPlans().map((p) => p.priceUsd)));

  const body = `# Whygrid

> Сократовский AI-тренер для турнирных игроков микролимитов (MTT). Загружаешь HH-файл
> сыгранного турнира — детерминированный парсер считает метрики (VPIP, pot odds, SPR,
> эквити, позиция), а AI-тренер разбирает самые спорные раздачи вопросами «почему ты так
> сыграл», прежде чем дать оценку — а не готовым советом.

Все покерные числа считает код (парсер), а не языковая модель — ИИ ничего не вычисляет
и не выдумывает, только объясняет уже посчитанное. Тренер не солвер и не выдаёт
GTO-решения — это разбор сыгранных раздач относительно открытых эталонных чартов
(${REFERENCE_CHART_COUNT} чартов на ${base}/charts).

Поддерживаемые румы (${ROOM_SHORT_NAMES.length}): ${ROOM_SHORT_NAMES.join(", ")}.
Цена: от ${priceFrom} в месяц. Первый турнир разбирается бесплатно.

## Основное
- [Главная](${base}/): что делает продукт и как это выглядит
- [Тарифы](${base}/pricing): цены и лимиты подписки
- [Эталонные чарты](${base}/charts): открытые чарты (RFI, пуш-фолд, защита BB и др.)
- [Как выгрузить историю раздач](${base}/how-to-export): инструкция по румам

## Подробнее
Полное описание методики — ${base}/llms-full.txt
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
