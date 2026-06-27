import type { SttPort, TranscribeRequest, TranscribeResult } from "./types";

// Детерминированный фейк — без сети и без расходов. Дев-фоллбэк, когда не задан
// DASHSCOPE_API_KEY (index.ts), и для тестов эндпоинта. Эхом отражает размер
// присланного аудио, чтобы было видно, что blob дошёл.
export const fakeSttAdapter: SttPort = {
  async transcribe(request: TranscribeRequest): Promise<TranscribeResult> {
    return {
      text: `(фейк-распознавание ${request.audio.length} байт ${request.mimeType})`,
    };
  },

  async ping(): Promise<boolean> {
    return true;
  },
};
