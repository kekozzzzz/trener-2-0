// Порт распознавания речи (правило проекта №4): бизнес-логика и эндпоинт зовут
// этот интерфейс, не зная о вендоре. Вход — аудио и его mime-тип, выход — текст.

export type TranscribeRequest = {
  // Сырое аудио как пришло от браузера (MediaRecorder).
  audio: Buffer;
  // MIME записи, например "audio/webm" или "audio/mp4" — нужен адаптеру для
  // корректной упаковки в data-URI.
  mimeType: string;
  // Подсказка термины-словарь для смещения распознавания (поле «контекст» Qwen).
  // Необязательно: без него движок работает как обычно.
  context?: string;
};

export type TranscribeResult = {
  text: string;
};

export interface SttPort {
  transcribe(request: TranscribeRequest): Promise<TranscribeResult>;
  // Лёгкая проверка доступности для /api/health (без расхода) — по аналогии с llm.
  ping(): Promise<boolean>;
}
