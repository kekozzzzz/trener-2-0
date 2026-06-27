import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";
import { checkTranscribeQuota } from "@/features/usage/limit";
import { getSttMaxAudioBytes } from "@/config/stt";
import { POKER_ASR_CONTEXT } from "@/config/poker-asr-fixups";
import { getSttAdapter } from "@/infrastructure/adapters/stt";
import { applyPokerFixups } from "@/lib/apply-poker-fixups";

// Buffer/адаптер требуют Node-рантайма (не edge).
export const runtime = "nodejs";

// Принимает аудио-blob надиктовки (тело запроса = сырой звук, Content-Type = mime
// записи браузера), возвращает распознанный текст. Вход только для залогиненных,
// под часовой квотой. Звук — голос игрока про покер (не HH-файл): сырой звук не
// логируем и не храним, никнеймы не передаём.
export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!checkTranscribeQuota(session.playerId).ok) {
    return NextResponse.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 });
  }

  const mimeType = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!mimeType.startsWith("audio/")) {
    return NextResponse.json({ error: "BAD_AUDIO_TYPE" }, { status: 400 });
  }

  const audio = Buffer.from(await request.arrayBuffer());
  if (audio.length === 0) {
    return NextResponse.json({ error: "EMPTY_AUDIO" }, { status: 400 });
  }
  if (audio.length > getSttMaxAudioBytes()) {
    return NextResponse.json({ error: "AUDIO_TOO_LARGE" }, { status: 413 });
  }

  try {
    const { text } = await getSttAdapter().transcribe({
      audio,
      mimeType,
      context: POKER_ASR_CONTEXT,
    });
    return NextResponse.json({ text: applyPokerFixups(text) });
  } catch (err) {
    // Детали — в лог сервера; клиенту общий ответ, без утечки внутренностей вендора.
    console.error("[stt] распознавание не удалось:", err);
    return NextResponse.json({ error: "TRANSCRIBE_FAILED" }, { status: 502 });
  }
}
