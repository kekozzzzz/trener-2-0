// Промпт для GENERATE_PLAYER_CHARACTERISTIC — продуктовый контент
// (architecture/00-правила-проекта.md, «Спроси разрешения» №5). Согласован с Артёмом 2026-06-25.
//
// Правило 1: все числа (средний VPIP, распределение стилей, открывашки шире нормы)
// уже посчитаны парсером по всей дистанции (features/profile/aggregate.ts) и переданы
// готовыми — LLM их не вычисляет, только формулирует характеристику словами.
// Открывашки сверены с RFI-чартом кодом (parser/open-raise + config/poker/rfi-chart) —
// LLM называет ТОЛЬКО переданные руки и позиции, ничего не добавляя.
//
// Пометку про «надёжно примерно от N турниров» и сам счётчик рисует страница
// «Аккаунт» детерминированно — не доверяем счёт модели (правило 1).

import type { PlayerCharacteristicRequest } from "@/infrastructure/adapters/llm/types";
import type { PlayerStyle } from "@/parser/types";
import type { Locale } from "@/i18n/config";

// Подписи данных (позиция, стиль) — переводятся по locale; выбор словаря в билдере
// по request.locale. Инструкции про открывашки и тон остаются русскими.
const POSITION_RU: Record<string, string> = {
  EARLY: "ранней позиции",
  HJ: "хайджека",
  CO: "катоффа",
  BTN: "баттона",
  SB: "малого блайнда",
};
const POSITION_EN: Record<string, string> = {
  EARLY: "early position",
  HJ: "the hijack",
  CO: "the cutoff",
  BTN: "the button",
  SB: "the small blind",
};

const STYLE_RU: Record<PlayerStyle, string> = {
  LOOSE: "лузовый (заходит в банк широко)",
  TIGHT: "тайтовый (заходит в банк узко)",
  PASSIVE: "пассивный (чаще коллирует, чем ставит/рейзит)",
  AGGRESSIVE: "агрессивный (часто ставит и рейзит)",
};
const STYLE_EN: Record<PlayerStyle, string> = {
  LOOSE: "loose (enters pots wide)",
  TIGHT: "tight (enters pots narrow)",
  PASSIVE: "passive (calls more often than bets/raises)",
  AGGRESSIVE: "aggressive (bets and raises often)",
};

// Языковая секция характеристики: RU — по-русски; EN (locale "en") — естественный
// английский, «you», без КАПСА, метрики-термины прячем, формат BB. Остальные
// инструкции (открывашки, тон, формат) — русские для обеих локалей.
const CHARACTERISTIC_LANGUAGE_RU = `Язык:
- По-русски, разговорно, обращайся к игроку на "ты". Действия называй конкретно (олл-ин, колл, рейз, чек, фолд), без метафор («шов», «вызов» нельзя).
- Не вываливай термины-метрики (частоту входа в банк, SPR, пот-оддсы); объясняй простыми словами через смысл и последствие.
- НЕ называй число сыгранных турниров и не пиши, насколько характеристика точна — это добавит интерфейс отдельно.`;
const CHARACTERISTIC_LANGUAGE_EN = `Language:
- Reply in English, conversational, address the player as "you". Name actions plainly (all-in, call, raise, check, fold), no metaphors.
- Normal capitalization — never write in ALL CAPS.
- Don't dump metric terms (entry frequency, SPR, pot odds); explain in plain words through the meaning and the consequence.
- Do NOT state the number of tournaments played or how precise the characteristic is — the interface adds that separately.`;

// Системный промпт характеристики под язык игрока: инструкции по открывашкам/тону/
// формату — русские (внутренние), локализуется только секция «Язык:».
export function buildPlayerCharacteristicSystemPrompt(locale: Locale): string {
  return `Ты — сократовский тренер по покеру для игрока микролимитных турниров (MTT). Твоя задача — дать короткую честную характеристику игры человека по всем сыгранным турнирам: какой он игрок в целом и над чем стоит подумать.

Правила:
- Все числа (средний процент входа в банк, распределение стилей по турнирам, открывашки заметно шире нормы) уже рассчитаны парсером по всей дистанции и переданы тебе. Не вычисляй метрики самостоятельно и не выдумывай новых.
- Опирайся ТОЛЬКО на переданные данные — не придумывай тенденции, руки и позиции, которых нет в цифрах.

Тон и честность:
- Не натягивай вывод. Если стиль смешанный или турниров мало — скажи мягко и обтекаемо, не выдавай шаткое за факт. Где тенденция видна устойчиво — назови её прямо.

Открывашки (префлоп-дисциплина):
- Если передан список «открывашки заметно шире нормы» — отдельной фразой скажи, что такие руки с таких позиций открывать не стоит, это шире, чем нужно. Называй ТОЛЬКО переданные руки и позиции, ничего не добавляя от себя. Парсер уже отфильтровал граничные — все переданные руки действительно лишние.
- Если список пуст — про открывашки не пиши вовсе.

${locale === "en" ? CHARACTERISTIC_LANGUAGE_EN : CHARACTERISTIC_LANGUAGE_RU}

Формат:
- "characteristic" — связный текст 3–6 предложений: общий стиль игры; если есть — фраза про открывашки шире нормы с конкретными руками и позициями; на что обратить внимание. Без списков и заголовков, всё единым текстом.
- Правило 1 (architecture/00-правила-проекта.md): все числа этого блока уже рассчитаны парсером и переданы тебе. Не вычисляй метрики самостоятельно и не выводи новых чисел — бери готовые как есть; нужного числа нет — скажи словами, но не выдумывай величину.
- Если не уверен в своей рекомендации — не выдавай её категоричным советом: сформулируй как уточняющий вопрос игроку («а что если…?», «стоит ли тут…?»). Уверенная неправда дороже честного «здесь я бы уточнил».
- Ответ — ТОЛЬКО валидный JSON вида {"characteristic": "..."}, без пояснений вокруг и без markdown-код-блоков.`;
}

export function buildPlayerCharacteristicPrompt(request: PlayerCharacteristicRequest): string {
  const { avgVpip, dominantStyle, styleCounts, openLeak, locale } = request;

  // Подписи данных (стиль/позиция) — по языку игрока; инструкции блоков русские.
  const en = locale === "en";
  const STYLE = en ? STYLE_EN : STYLE_RU;
  const POSITION = en ? POSITION_EN : POSITION_RU;

  const styleDistribution = (Object.keys(styleCounts) as PlayerStyle[])
    .filter((style) => styleCounts[style] > 0)
    .map((style) => `${STYLE[style]} — ${styleCounts[style]} турн.`)
    .join("; ");

  const openLeakBlock =
    openLeak.length > 0
      ? `Открывашки заметно шире нормы по всей дистанции (называй только эти руки и позиции):\n${openLeak
          .map((o) => `  - ${o.code} с ${POSITION[o.position] ?? o.position} (${o.count} раз)`)
          .join("\n")}`
      : "Открывашек шире нормы нет — про открытия не пиши.";

  return `Сводка по всем турнирам игрока (числа уже посчитаны, используй как есть):
Преобладающий стиль: ${STYLE[dominantStyle]}.
Стили по турнирам: ${styleDistribution}.
Средний процент входа в банк: ${avgVpip}%.

${openLeakBlock}

Верни JSON строго такого вида:
{
  "characteristic": "связный текст-характеристика игры по всем турнирам"
}`;
}
