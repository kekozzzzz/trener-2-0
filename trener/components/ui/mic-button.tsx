"use client";

// Голосовой ввод ответа. Кнопка-микрофон рядом с полем: игрок жмёт, проговаривает
// ответ, речь распознаётся и дописывается текстом в поле.
//
// Боевой движок — Qwen3-ASR (Alibaba) через адаптер (правило 4). Здесь, на клиенте,
// мы только пишем звук через MediaRecorder и шлём blob на наш эндпоинт /api/stt,
// который зовёт адаптер и возвращает текст. Сам ключ/вендор живут на сервере —
// браузер о них не знает. (Прежний макет использовал браузерный Web Speech API,
// негодный в проде: гнал звук через Google, из РФ недостижим.)

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { blobToWav } from "@/lib/encode-wav";

type Status = "idle" | "recording" | "transcribing" | "unsupported" | "error";

function isSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined"
  );
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
  // Держим свежий колбэк в ref — запись живёт дольше одного рендера.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    if (!isSupported()) setStatus("unsupported");
    return () => {
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function releaseStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function processRecording(recorded: Blob) {
    setStatus("transcribing");
    // Движок распознавания принимает только wav/mp3, а MediaRecorder отдаёт webm —
    // перекодируем в wav прямо в браузере перед отправкой.
    let wav: Blob;
    try {
      wav = await blobToWav(recorded);
    } catch {
      setErrorMsg("Не удалось обработать запись, попробуй ещё раз");
      setStatus("error");
      return;
    }
    await sendForTranscription(wav);
  }

  async function sendForTranscription(blob: Blob) {
    try {
      const res = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
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
    } catch {
      setErrorMsg("Нет доступа к микрофону");
      setStatus("error");
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
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
        void processRecording(blob);
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

      {recording && (
        <span className="font-mono text-label uppercase tracking-label text-primary" aria-live="polite">
          Слушаю
          <LoadingDots />
        </span>
      )}
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
