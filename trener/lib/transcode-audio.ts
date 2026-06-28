import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Перекодировка записи браузера (webm/opus, mp4/aac) в WAV 16кГц моно через ffmpeg
// НА СЕРВЕРЕ. Так клиент шлёт маленький сжатый звук (быстрая загрузка по медленному
// каналу через релей), а движку распознавания уходит wav, который он принимает.
// Раньше конвертация шла на клиенте и слался тяжёлый несжатый WAV — это и было узким
// местом по времени (см. замеры [stt-timing]).
//
// Вход пишем во временный файл (webm из MediaRecorder не всегда читается ffmpeg из
// пайпа — нужен сикбл-источник), wav забираем из stdout. Файл удаляем всегда.
export async function transcodeToWav(input: Buffer): Promise<Buffer> {
  const inPath = join(tmpdir(), `stt-${randomUUID()}`);
  await writeFile(inPath, input);
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inPath,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-f",
        "wav",
        "pipe:1",
      ]);
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      ff.stdout.on("data", (d: Buffer) => out.push(d));
      ff.stderr.on("data", (d: Buffer) => err.push(d));
      ff.on("error", reject); // ffmpeg не найден в PATH
      ff.on("close", (code) => {
        if (code === 0) resolve(Buffer.concat(out));
        else reject(new Error(`ffmpeg код ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`));
      });
    });
  } finally {
    void unlink(inPath).catch(() => {});
  }
}
