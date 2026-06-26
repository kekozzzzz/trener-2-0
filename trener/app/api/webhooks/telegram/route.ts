import { NextRequest, NextResponse } from "next/server";
import { getTelegramWebhookSecret } from "@/config/notify";
import { handleTelegramUpdate, type TgUpdate } from "@/infrastructure/posting/webhook";

// Приём обновлений Telegram (нажатия ✅/✏️, входящие сообщения). Telegram шлёт сюда POST
// и кладёт секрет в заголовок X-Telegram-Bot-Api-Secret-Token — принимаем апдейт, только
// если секрет совпал (защита от чужих запросов на открытый URL). Без настроенного
// секрета приём отключён.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = getTelegramWebhookSecret();
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    // Битое тело — не просим Telegram повторять.
    return NextResponse.json({ ok: true });
  }

  try {
    await handleTelegramUpdate(update);
  } catch (err) {
    // Логируем, но всё равно отвечаем 200: иначе Telegram будет ретраить этот апдейт.
    console.error("[webhook] ошибка обработки апдейта:", err);
  }

  return NextResponse.json({ ok: true });
}
