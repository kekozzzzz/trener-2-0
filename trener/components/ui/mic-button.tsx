"use client";

// Голосовой ввод ответа. Кнопка-микрофон рядом с полем: игрок жмёт, проговаривает
// ответ, речь распознаётся и дописывается текстом в поле.
//
// Боевой движок — Voxtral (через OpenRouter→КЗ-релей) за адаптером (правило 4). Здесь,
// на клиенте, мы только пишем звук через MediaRecorder и шлём blob на наш эндпоинт /api/stt,
// который зовёт адаптер и возвращает текст. Сам ключ/вендор живут на сервере —
// браузер о них не знает. (Прежний макет использовал браузерный Web Speech API,
// негодный в проде: гнал звук через Google, из РФ недостижим.)
//
// Пока идёт запись — рисуем живую звуковую дорожку (бары по громкости через Web Audio
// AnalyserNode), чтобы было видно, что голос слышат (как в голосовом вводе ChatGPT).
// Расшифровка всё равно идёт ПОСЛЕ записи (потоковый набор по ходу речи требует движка,
// которого у нас из РФ нет), но дорожка убирает ощущение «мёртвой кнопки».

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

type Status = "idle" | "recording" | "transcribing" | "unsupported" | "error";

function isSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined"
  );
}

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

// Выбираем формат записи, который умеет браузер. Chrome — webm/opus, Safari — mp4.
function pickMimeType(): string {
  const candidates = ["audio/webm", "audio/mp4", "audio/ogg"];
  for (const type of candidates) {
    if (window.MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

export function MicButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Web Audio для живой дорожки записи.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Держим свежий колбэк в ref — запись живёт дольше одного рендера.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    if (!isSupported()) setStatus("unsupported");
    return () => {
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      stopVisualizer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── Живая звуковая дорожка (бары по частотам) ──────────────────────────────
  function setupVisualizer(stream: MediaStream) {
    const Ctor = audioContextCtor();
    if (!Ctor) return; // визуализация необязательна
    try {
      const ac = new Ctor();
      const source = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 64; // мало бинов — бары отзывчивые
      source.connect(analyser);
      audioCtxRef.current = ac;
      analyserRef.current = analyser;
      drawBars();
    } catch {
      /* без дорожки запись всё равно работает */
    }
  }

  function drawBars() {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bins = analyser.frequencyBinCount;
    const data = new Uint8Array(bins);
    const W = canvas.width;
    const H = canvas.height;
    const BARS = Math.min(24, bins);
    const color = getComputedStyle(canvas).color || "#a3e635";
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;
      const bw = W / BARS;
      for (let i = 0; i < BARS; i++) {
        const v = data[Math.floor((i / BARS) * bins)] / 255;
        const bh = Math.max(2, v * H);
        ctx.fillRect(i * bw + 1, (H - bh) / 2, Math.max(1, bw - 2), bh);
      }
    };
    tick();
  }

  function stopVisualizer() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function releaseStream() {
    stopVisualizer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function sendForTranscription(blob: Blob) {
    setStatus("transcribing");
    // Шлём сырую сжатую запись как есть — в wav её перекодирует сервер (ffmpeg).
    // Раньше конвертили в тяжёлый wav на клиенте и слали его — это тормозило загрузку.
    try {
      const res = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      if (!res.ok) {
        setErrorMsg(
          res.status === 429
            ? "Слишком много надиктовок, подожди немного"
            : "Не удалось распознать, попробуй ещё раз",
        );
        setStatus("error");
        return;
      }
      const data = (await res.json()) as { text?: string };
      const text = data.text?.trim() ?? "";
      if (text) onTranscriptRef.current(text);
      setStatus("idle");
    } catch {
      setErrorMsg("Не удалось распознать, попробуй ещё раз");
      setStatus("error");
    }
  }

  async function start() {
    if (!isSupported()) {
      setStatus("unsupported");
      return;
    }
    setErrorMsg("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // Различаем причину — иначе игрок не понимает, что чинить. Имена ошибок
      // getUserMedia стандартные (DOMException.name).
      const name = (err as { name?: string })?.name ?? "";
      setErrorMsg(
        name === "NotFoundError" || name === "DevicesNotFoundError"
          ? "Микрофон не найден - проверь, что он подключён и включён в системе"
          : name === "NotReadableError" || name === "TrackStartError"
            ? "Микрофон занят другой программой - закрой её и попробуй снова"
            : name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError"
              ? "Доступ к микрофону запрещён - разреши его в настройках браузера и Windows"
              : "Не удалось включить микрофон - проверь его подключение и разрешения",
      );
      setStatus("error");
      return;
    }
    streamRef.current = stream;
    setupVisualizer(stream);

    const mimeType = pickMimeType();
    // Низкий битрейт — для речи 32 кбит/с с запасом хватает, а файл в разы меньше:
    // быстрее грузится по медленному каналу через релей.
    const options: MediaRecorderOptions = { audioBitsPerSecond: 32000 };
    if (mimeType) options.mimeType = mimeType;
    const recorder = new MediaRecorder(stream, options);
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      releaseStream();
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (blob.size > 0) {
        void sendForTranscription(blob);
      } else {
        setStatus("idle");
      }
    };

    recorderRef.current = recorder;
    try {
      recorder.start();
      setStatus("recording");
    } catch {
      releaseStream();
      setErrorMsg("Микрофон не сработал, попробуй ещё раз");
      setStatus("error");
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop(); // дальше — onstop → отправка
    } else {
      setStatus("idle");
    }
  }

  const recording = status === "recording";
  const transcribing = status === "transcribing";

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={recording ? "Остановить запись" : "Надиктовать ответ голосом"}
        title={
          status === "unsupported"
            ? "Голосовой ввод недоступен в этом браузере"
            : recording
              ? "Остановить запись"
              : "Надиктовать голосом"
        }
        disabled={disabled || transcribing || status === "unsupported"}
        onClick={recording ? stop : start}
        className={recording ? "border-primary text-primary" : undefined}
      >
        {recording ? <Square fill="currentColor" /> : <Mic />}
      </Button>

      {/* Дорожка всегда в DOM (ref стабилен), показываем только при записи. */}
      <span
        className={recording ? "inline-flex items-center gap-2 text-primary" : "hidden"}
        aria-live="polite"
      >
        <canvas ref={canvasRef} width={140} height={24} aria-hidden="true" className="text-primary" />
        <span className="font-mono text-label uppercase tracking-label">Слушаю</span>
      </span>

      {transcribing && (
        <span className="font-mono text-label uppercase tracking-label text-muted-foreground" aria-live="polite">
          Распознаю
          <LoadingDots />
        </span>
      )}
      {status === "error" && (
        <span className="text-small text-muted-foreground" aria-live="polite">
          {errorMsg}
        </span>
      )}
    </span>
  );
}
