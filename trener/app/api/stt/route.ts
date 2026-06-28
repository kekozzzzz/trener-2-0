import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";
import { checkTranscribeQuota } from "@/features/usage/limit";
import { getSttMaxAudioBytes } from "@/config/stt";
import { POKER_ASR_CONTEXT } from "@/config/poker-asr-fixups";
import { getSttAdapter } from "@/infrastructure/adapters/stt";
import { applyPokerFixups } from "@/lib/apply-poker-fixups";
import { transcodeToWav } from "@/lib/transcode-audio";

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

  const tStart = Date.now();
  const audio = Buffer.from(await request.arrayBuffer());
  const tBodyRead = Date.now();
  if (audio.length === 0) {
    return NextResponse.json({ error: "EMPTY_AUDIO" }, { status: 400 });
  }
  if (audio.length > getSttMaxAudioBytes()) {
    return NextResponse.json({ error: "AUDIO_TOO_LARGE" }, { status: 413 });
  }

  // Клиент шлёт сжатую запись (webm/opus) — перекодируем в wav на сервере (ffmpeg),
  // движок принимает только wav/mp3. Маленький вход = быстрая загрузка по каналу.
  let wav: Buffer;
  try {
    wav = await transcodeToWav(audio);
  } catch (err) {
    console.error("[stt] перекодировка звука не удалась:", err);
    return NextResponse.json({ error: "TRANSCODE_FAILED" }, { status: 502 });
  }
  const tConvert = Date.now();

  try {
    const { text } = await getSttAdapter().transcribe({
      audio: wav,
      mimeType: "audio/wav",
      context: POKER_ASR_CONTEXT,
    });
    // Замер: приём тела vs перекодировка vs модель (для контроля скорости).
    console.log(
      `[stt-timing] in=${audio.length}b wav=${wav.length}b body=${tBodyRead - tStart}ms convert=${tConvert - tBodyRead}ms model=${Date.now() - tConvert}ms`,
    );
    return NextResponse.json({ text: applyPokerFixups(text) });
  } catch (err) {
    // Детали — в лог сервера; клиенту общий ответ, без утечки внутренностей вендора.
    console.error("[stt] распознавание не удалось:", err);
    return NextResponse.json({ error: "TRANSCRIBE_FAILED" }, { status: 502 });
  }
}
