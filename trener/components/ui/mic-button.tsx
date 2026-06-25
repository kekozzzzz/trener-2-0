"use client";

// МАКЕТ голосового ввода ответа. Кнопка-микрофон рядом с полем: игрок жмёт,
// проговаривает ответ, речь дописывается текстом в поле.
//
// ВАЖНО: движок распознавания здесь — браузерный Web Speech API
// (webkitSpeechRecognition). Он бесплатный и работает локально в Chrome/Edge —
// этого хватает, чтобы пощупать UX на макете. В ПРОДАКШЕНЕ он не годится: звук
// идёт через серверы Google, а из РФ они недостижимы (тот же блок, из-за которого
// у нас стоит релей). Боевой движок — Yandex SpeechKit через адаптер (правило 4),
// звук остаётся в РФ-контуре. Точка замены — функция start() ниже: вместо
// SpeechRecognition там появятся запись через MediaRecorder + отправка на
// бэкенд-эндпоинт, который зовёт SpeechKit и возвращает текст.

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Status = "idle" | "listening" | "unsupported" | "error";

export function MicButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Держим свежий колбэк в ref — распознавание живёт дольше одного рендера.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    if (!getRecognitionCtor()) setStatus("unsupported");
    return () => recognitionRef.current?.stop();
  }, []);

  function start() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) onTranscriptRef.current(text);
        }
      }
    };
    recognition.onerror = (event) => {
      setErrorMsg(
        event?.error === "not-allowed" || event?.error === "service-not-allowed"
          ? "Нет доступа к микрофону"
          : "Микрофон не сработал, попробуй ещё раз",
      );
      setStatus("error");
    };
    recognition.onend = () => setStatus((s) => (s === "listening" ? "idle" : s));

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setStatus("listening");
    } catch {
      setErrorMsg("Микрофон не сработал, попробуй ещё раз");
      setStatus("error");
    }
  }

  function stop() {
    recognitionRef.current?.stop();
    setStatus("idle");
  }

  const listening = status === "listening";

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={listening ? "Остановить запись" : "Надиктовать ответ голосом"}
        title={
          status === "unsupported"
            ? "Голосовой ввод недоступен в этом браузере"
            : listening
              ? "Остановить запись"
              : "Надиктовать голосом"
        }
        disabled={disabled || status === "unsupported"}
        onClick={listening ? stop : start}
        className={listening ? "border-primary text-primary" : undefined}
      >
        {listening ? <Square fill="currentColor" /> : <Mic />}
      </Button>

      {listening && (
        <span className="font-mono text-label uppercase tracking-label text-primary" aria-live="polite">
          Слушаю
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
