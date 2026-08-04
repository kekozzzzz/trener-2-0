import {
  getTelegramBotToken,
  getTelegramBaseUrl,
  getTelegramProxySecret,
  getTelegramCallTimeoutMs,
  getTelegramCallRetries,
} from "@/config/notify";
import { resilientFetch } from "@/infrastructure/adapters/http/resilient-fetch";

// Низкоуровневый клиент Telegram Bot API — один модуль на все вызовы (sendMessage,
// sendPhoto, ответ на нажатия кнопок, webhook). И сторож, и автопостинг ходят сюда,
// чтобы сетевая особенность была в одном месте: прод-VM из РФ до api.telegram.org
// напрямую не достаёт, поэтому на проде baseURL = релей в Казахстане, плюс заголовок
// x-proxy-secret. Доверие к серту релея задано процессу через NODE_EXTRA_CA_CERTS.
//
// Токен бота лежит в адресе запроса (так устроен Bot API) — на релее access_log для
// Telegram-прохода отключён, чтобы токен не попал в логи. Тело ошибочного ответа мы
// не печатаем целиком: Telegram при ошибке может вернуть эхо запроса.

const DEFAULT_BASE = "https://api.telegram.org";

function apiBase(): string {
  return getTelegramBaseUrl() || DEFAULT_BASE;
}

// Заголовки для релея: общий секрет (если задан) плюс что передали сверху.
function proxyHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const secret = getTelegramProxySecret();
  if (secret) headers["x-proxy-secret"] = secret;
  return headers;
}

// Inline-клавиатура: ряды кнопок. callback-кнопка несёт data (приходит в callback_query),
// url-кнопка открывает ссылку (для «✍️ Написать нам»).
export type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

// Вызов метода Bot API с JSON-телом. Бросает при HTTP-ошибке. Тело ответа не читаем:
// текущим вызовам оно не нужно, а лишний разбор делает мок в тестах хрупким. Понадобится
// message_id — заведём отдельный вариант с разбором.
export async function callTelegram(
  method: string,
  body: Record<string, unknown>,
  opts?: { token?: string; signal?: AbortSignal },
): Promise<void> {
  const token = opts?.token ?? getTelegramBotToken();
  const url = `${apiBase()}/bot${token}/${method}`;
  const init: RequestInit = {
    method: "POST",
    headers: proxyHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  };

  // Если вызывающий передал свой signal (свой таймаут/отмена) — уважаем его, один заход.
  // Иначе — устойчивый вызов через релей: таймаут (без него зависший релей держит
  // соединение ~5 мин дефолтом undici — дайджест и тревоги очереди молча виснут и
  // «теряются») + быстрый повтор при временной икоте релея. Тот же resilientFetch, что
  // у LLM-разбора и голоса. Тело у sendMessage — строка-JSON, повтор её пересоздаёт.
  const response = opts?.signal
    ? await fetch(url, { ...init, signal: opts.signal })
    : await resilientFetch(url, init, {
        timeoutMs: getTelegramCallTimeoutMs(),
        retries: getTelegramCallRetries(),
        label: "Telegram",
      });

  if (!response.ok) {
    throw new Error(`Telegram ${method} не прошёл: HTTP ${response.status}`);
  }
}

// Текстовое сообщение. С опциональной inline-клавиатурой (кнопки одобрения/контакта).
export async function sendMessage(
  chatId: string,
  text: string,
  opts?: { replyMarkup?: InlineKeyboard; token?: string },
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (opts?.replyMarkup) body.reply_markup = opts.replyMarkup;
  await callTelegram("sendMessage", body, { token: opts?.token });
}

// Картинка. photo — либо Buffer (загрузка multipart), либо строка (URL или file_id).
// caption — подпись под картинкой (текст поста), replyMarkup — кнопки под ней.
export async function sendPhoto(
  chatId: string,
  photo: Buffer | string,
  opts?: { caption?: string; replyMarkup?: InlineKeyboard; token?: string },
): Promise<void> {
  const token = opts?.token ?? getTelegramBotToken();

  // URL / file_id — обычный JSON-вызов.
  if (typeof photo === "string") {
    const body: Record<string, unknown> = { chat_id: chatId, photo };
    if (opts?.caption) body.caption = opts.caption;
    if (opts?.replyMarkup) body.reply_markup = opts.replyMarkup;
    await callTelegram("sendPhoto", body, { token });
    return;
  }

  // Загрузка файла — multipart/form-data. content-type не ставим вручную: fetch сам
  // подставит boundary. reply_markup в multipart передаётся строкой-JSON.
  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("photo", new Blob([new Uint8Array(photo)]), "card.png");
  if (opts?.caption) form.set("caption", opts.caption);
  if (opts?.replyMarkup) form.set("reply_markup", JSON.stringify(opts.replyMarkup));

  // Таймаут, чтобы зависший релей не держал загрузку ~5 мин (дефолт undici). БЕЗ повтора:
  // sendPhoto не идемпотентен — повтор после уже прошедшей публикации задвоил бы карточку
  // в канале. Автопостинг вторичен, разовый провал не критичен.
  const response = await fetch(`${apiBase()}/bot${token}/sendPhoto`, {
    method: "POST",
    headers: proxyHeaders(),
    body: form,
    signal: AbortSignal.timeout(getTelegramCallTimeoutMs()),
  });
  if (!response.ok) {
    throw new Error(`Telegram sendPhoto не прошёл: HTTP ${response.status}`);
  }
}

// Альбом из нескольких фото (карусель) — одним сообщением, свайпается в клиенте
// Telegram. Подпись показываем только на первом фото (Telegram сам растягивает её
// на всё сообщение). ВАЖНО: у sendMediaGroup нет reply_markup вообще — Bot API этого
// не поддерживает, кнопки (одобрение/CTA) шлём отдельным sendMessage сразу следом.
export async function sendMediaGroup(
  chatId: string,
  photos: Buffer[],
  opts?: { caption?: string; token?: string },
): Promise<void> {
  const token = opts?.token ?? getTelegramBotToken();
  const media = photos.map((_, i) => ({
    type: "photo",
    media: `attach://photo${i}`,
    ...(i === 0 && opts?.caption ? { caption: opts.caption } : {}),
  }));

  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("media", JSON.stringify(media));
  photos.forEach((buf, i) => {
    form.set(`photo${i}`, new Blob([new Uint8Array(buf)]), `photo${i}.png`);
  });

  const response = await fetch(`${apiBase()}/bot${token}/sendMediaGroup`, {
    method: "POST",
    headers: proxyHeaders(),
    body: form,
    signal: AbortSignal.timeout(getTelegramCallTimeoutMs()),
  });
  if (!response.ok) {
    throw new Error(`Telegram sendMediaGroup не прошёл: HTTP ${response.status}`);
  }
}

// Подтверждение нажатия inline-кнопки: убирает «часики» на кнопке у пользователя.
// Тихо игнорируем ошибку — это косметика, ядро действия уже отработало.
export async function answerCallbackQuery(
  callbackQueryId: string,
  opts?: { text?: string; token?: string },
): Promise<void> {
  try {
    const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
    if (opts?.text) body.text = opts.text;
    await callTelegram("answerCallbackQuery", body, { token: opts?.token });
  } catch {
    // не критично
  }
}

// Проверка доступности канала для /api/health: getMe тем же путём (релей + серт +
// токен), без отправки сообщения. GET, как было исторически. НЕ бросает наружу.
export async function getMe(opts?: { signal?: AbortSignal; token?: string }): Promise<boolean> {
  try {
    const token = opts?.token ?? getTelegramBotToken();
    const response = await fetch(`${apiBase()}/bot${token}/getMe`, {
      method: "GET",
      headers: proxyHeaders(),
      signal: opts?.signal,
    });
    if (!response.ok) return false;
    const data = (await response.json().catch(() => null)) as { ok?: boolean } | null;
    return data?.ok === true;
  } catch {
    return false;
  }
}

// Сырое обновление из getUpdates: update_id + поля апдейта (callback_query/message),
// которые понимает общий обработчик webhook.ts.
export type RawUpdate = { update_id: number } & Record<string, unknown>;

// Опрос обновлений (getUpdates) — для среды, где Telegram НЕ достукивается до нас вебхуком
// (вход на релей КЗ глух по таймауту), а ИСХОДЯЩЕЕ через релей работает. Мы сами тянем
// нажатия ✅/✏️ и входящие тем же рабочим каналом. offset = update_id последнего
// обработанного + 1 (подтверждает приём прошлой пачки, Telegram её больше не отдаст).
// ВАЖНО: вебхук и getUpdates взаимоисключающи — перед опросом вебхук должен быть снят
// (deleteWebhook), иначе Telegram отвечает 409.
export async function getUpdates(
  offset: number,
  opts?: { token?: string; timeoutSec?: number; signal?: AbortSignal },
): Promise<RawUpdate[]> {
  const token = opts?.token ?? getTelegramBotToken();
  const pollSec = opts?.timeoutSec ?? 0;
  const params = new URLSearchParams({
    offset: String(offset),
    timeout: String(pollSec),
    allowed_updates: JSON.stringify(["callback_query", "message"]),
  });
  const url = `${apiBase()}/bot${token}/getUpdates?${params.toString()}`;
  const timeoutMs = pollSec * 1000 + getTelegramCallTimeoutMs();

  // Таймаут ОБЯЗАТЕЛЕН: без него зависший релей держит опрос дефолтом undici ~5 мин, а
  // страж крона poll-telegram (isRunning) всё это время отдаёт 429 → кнопки ✅/✏️ и входящие
  // замирают до перезапуска. Даём запас на long-poll (timeoutSec) сверх обычного предела.
  //
  // ОДИН быстрый повтор на таймаут (регресс 2026-07-19): в отличие от sendMessage,
  // getUpdates дерётся раз в минуту крон-опросом на одном и том же долгоживущем
  // процессе — пул соединений undici к релею успевает протухнуть между заходами
  // (соединение выглядит живым, но зависает на первом же байте). Проверено вручную:
  // сам релей отвечает <1с, повторный заход почти всегда получает свежее соединение
  // и проходит с первого раза — входящие иначе НЕ принимались вовсе (см. retrospectives
  // 2026-07-19). Второй заход тоже таймаутом — отдаём ошибку наверх как раньше.
  async function attempt(signal: AbortSignal): Promise<Response> {
    return fetch(url, { method: "GET", headers: proxyHeaders(), signal });
  }

  let response: Response;
  try {
    response = await attempt(opts?.signal ?? AbortSignal.timeout(timeoutMs));
  } catch (err) {
    if (opts?.signal || !(err instanceof DOMException) || err.name !== "TimeoutError") throw err;
    response = await attempt(AbortSignal.timeout(timeoutMs));
  }

  if (!response.ok) {
    throw new Error(`Telegram getUpdates не прошёл: HTTP ${response.status}`);
  }
  const data = (await response.json().catch(() => null)) as
    | { ok?: boolean; result?: RawUpdate[] }
    | null;
  if (!data?.ok || !Array.isArray(data.result)) return [];
  return data.result;
}

// Снять вебхук — нужно перед переходом на опрос getUpdates (иначе 409). Идемпотентно.
export async function deleteWebhook(opts?: { token?: string }): Promise<void> {
  await callTelegram("deleteWebhook", { drop_pending_updates: false }, { token: opts?.token });
}
