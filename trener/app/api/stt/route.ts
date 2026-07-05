import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";
import { checkTranscribeQuota } from "@/features/usage/limit";
import { getSttMaxAudioBytes } from "@/config/stt";
import { POKER_ASR_CONTEXT } from "@/config/poker-asr-fixups";
import { getSttAdapter } from "@/infrastructure/adapters/stt";
import { recordLlmUsage } from "@/features/usage/llm-usage";
import { applyPokerFixups } from "@/lib/apply-poker-fixups";
import { transcodeToWav } from "@/lib/transcode-audio";

// Buffer/адаптер требуют Node-рантайма (не edge).
export const runtime = "nodejs";

// Модель иногда вместо дословного текста возвращает ОТКАЗ («Извините, не могу
// распознать аудиозапись…») — раньше он вставлялся в поле как будто это речь игрока
// (правка Артёма 2026-07-04). Ловим типовые формулы отказа и отвечаем ошибкой:
// кнопка покажет «не удалось распознать», а поле останется чистым.
const REFUSAL_RE =
  /не могу (распознать|обработать|прослушать|помочь)|предоставь(?:те)? текст|аудиозапись (пуста|не содержит)|задайте другой вопрос|cannot (transcribe|process)|unable to (transcribe|process)|i'?m sorry/i;

function looksLikeRefusal(text: string): boolean {
  return REFUSAL_RE.test(text);
}

// Модель иногда возвращает ЭХОМ сам словарь-подсказку (POKER_ASR_CONTEXT) вместо
// расшифровки — обычно на короткой или неразборчивой фразе (правка Артёма 2026-07-05:
// сказал «выкидывать надо», в поле вставился весь список терминов). Ловим двумя
// проверками: текст — дословный кусок подсказки, либо в нём встретилась неправдоподобно
// большая доля словарных терминов разом (живая фраза столько не содержит).
const normalizeForEcho = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, " ").trim();

function looksLikeContextEcho(text: string): boolean {
  const t = normalizeForEcho(text);
  if (!t) return false;
  if (t.length > 30 && normalizeForEcho(POKER_ASR_CONTEXT).includes(t)) return true;
  const terms = POKER_ASR_CONTEXT.split(/[:,.]/).map(normalizeForEcho).filter((w) => w.length > 3);
  const hits = terms.filter((w) => t.includes(w)).length;
  return hits >= 10;
}

// Модель иногда оборачивает распознанное в кавычки («…», "…") — игроку в поле
// нужны его слова, а не цитата. Срезаем обрамляющие пары, пока они есть.
const QUOTE_PAIRS: Array<[string, string]> = [
  ["«", "»"],
  ["„", "“"],
  ["“", "”"],
  ['"', '"'],
  ["'", "'"],
];

// Иногда модель добавляет вводную («Конечно, вот дословный текст речи:») перед
// цитатой — срезаем известные преамбулы, дальше кавычки снимет stripWrappingQuotes.
const PREAMBLE_RE =
  /^(?:конечно[,.!]?\s*)?(?:вот\s+)?(?:дословн\w+\s+)?(?:текст|расшифровк\w|транскрипци\w)(?:\s+(?:речи|записи|аудио))?\s*:\s*/i;

function stripPreamble(text: string): string {
  return text.replace(PREAMBLE_RE, "").trim();
}

function stripWrappingQuotes(text: string): string {
  let out = text.trim();
  for (let guard = 0; guard < 3; guard++) {
    const pair = QUOTE_PAIRS.find(([o, c]) => out.startsWith(o) && out.endsWith(c) && out.length > 1);
    if (!pair) break;
    out = out.slice(pair[0].length, -pair[1].length).trim();
  }
  return out;
}

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
    const { text, model, usage } = await getSttAdapter().transcribe({
      audio: wav,
      mimeType: "audio/wav",
      context: POKER_ASR_CONTEXT,
    });
    // Учёт затрат микрофона в общую отчётность (решение Артёма 2026-07-04): шаг STT
    // в LlmUsage, цена точная от провайдера (usage.cost). Мягко: без usage не пишем.
    if (usage) {
      void recordLlmUsage({
        playerId: session.playerId,
        step: "STT",
        model: model ?? "stt",
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
        },
        costUsd: usage.costUsd,
      });
    }
    // Замер: приём тела vs перекодировка vs модель (для контроля скорости).
    console.log(
      `[stt-timing] in=${audio.length}b wav=${wav.length}b body=${tBodyRead - tStart}ms convert=${tConvert - tBodyRead}ms model=${Date.now() - tConvert}ms`,
    );
    if (looksLikeRefusal(text)) {
      console.warn("[stt] модель вернула отказ вместо распознавания:", text.slice(0, 120));
      return NextResponse.json({ error: "TRANSCRIBE_FAILED" }, { status: 502 });
    }
    if (looksLikeContextEcho(text)) {
      console.warn("[stt] модель вернула эхо словаря-подсказки вместо распознавания:", text.slice(0, 120));
      return NextResponse.json({ error: "TRANSCRIBE_FAILED" }, { status: 502 });
    }
    return NextResponse.json({ text: applyPokerFixups(stripWrappingQuotes(stripPreamble(text))) });
  } catch (err) {
    // Детали — в лог сервера; клиенту общий ответ, без утечки внутренностей вендора.
    console.error("[stt] распознавание не удалось:", err);
    return NextResponse.json({ error: "TRANSCRIBE_FAILED" }, { status: 502 });
  }
}
