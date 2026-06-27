// Перекодировка записи браузера (webm/opus, mp4/aac — что отдал MediaRecorder) в
// WAV 16 кГц моно прямо в браузере, без серверного ffmpeg. Нужно потому, что движок
// распознавания (Voxtral через OpenRouter) принимает только wav/mp3, а MediaRecorder
// wav не умеет. Декодируем через Web Audio, ресемплим OfflineAudioContext, пишем
// 16-битный PCM WAV.

const TARGET_RATE = 16000;

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

// Поддерживается ли перекодировка в текущем браузере.
export function canEncodeWav(): boolean {
  return getAudioContextCtor() !== null && typeof OfflineAudioContext !== "undefined";
}

function encodeWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // длина fmt-блока
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // моно
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // байт/сек
  view.setUint16(32, 2, true); // байт на сэмпл
  view.setUint16(34, 16, true); // бит на сэмпл
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// Декодирует blob записи и возвращает WAV 16 кГц моно. Бросает, если браузер не умеет
// перекодировать (вызывающий должен проверить canEncodeWav заранее).
export async function blobToWav(blob: Blob): Promise<Blob> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) throw new Error("Web Audio недоступен");

  const arrayBuf = await blob.arrayBuffer();
  const decodeCtx = new Ctor();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuf);
  } finally {
    void decodeCtx.close();
  }

  // OfflineAudioContext сам сводит в моно (1 канал) и ресемплит до TARGET_RATE.
  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  return encodeWavBlob(rendered.getChannelData(0), TARGET_RATE);
}
