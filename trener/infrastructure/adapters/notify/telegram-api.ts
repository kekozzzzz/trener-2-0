import {
  getTelegramBotToken,
  getTelegramBaseUrl,
  getTelegramProxySecret,
} from "@/config/notify";

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
  const response = await fetch(`${apiBase()}/bot${token}/${method}`, {
    method: "POST",
    headers: proxyHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body),
    signal: opts?.signal,
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

  const response = await fetch(`${apiBase()}/bot${token}/sendPhoto`, {
    method: "POST",
    headers: proxyHeaders(),
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Telegram sendPhoto не прошёл: HTTP ${response.status}`);
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
