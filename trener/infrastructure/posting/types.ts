// Модель одного поста в очереди канала. Хранится в queue.json на сервере.
// Жизненный цикл статуса:
//   QUEUED        — в очереди, превью ещё не отправлено
//   PREVIEW_SENT  — превью ушло Артёму, ждём нажатия ✅/✏️
//   APPROVED      — одобрено (✅), будет опубликовано в scheduledAt
//   HELD          — отложено (✏️), Артём правит; в публикацию не идёт
//   PUBLISHED     — опубликовано в канал
//   CANCELLED     — снято с публикации
export type PostStatus =
  | "QUEUED"
  | "PREVIEW_SENT"
  | "APPROVED"
  | "HELD"
  | "PUBLISHED"
  | "CANCELLED";

export interface QueuedPost {
  id: string; // стабильный id (его задаёт генератор контента), напр. "sliv-01"
  imageFile?: string; // имя файла картинки в каталоге очереди, напр. "sliv-01.png"
  // Альбом (карусель) — 2-10 файлов, отправляются одним sendMediaGroup. Если задано,
  // используется вместо imageFile. Telegram НЕ поддерживает кнопки под альбомом — их
  // при публикации шлём отдельным сообщением сразу следом (см. service.ts).
  imageFiles?: string[];
  caption: string; // текст поста (подпись под картинкой)
  scheduledAt: string; // ISO UTC — когда публиковать
  previewAt: string; // ISO UTC — когда слать превью на одобрение (обычно за день до)
  status: PostStatus;
  // Кнопка под постом (напр. «✍️ Написать нам»). Опционально.
  buttonText?: string;
  buttonUrl?: string;
  // Отметки времени переходов (для журнала и идемпотентности).
  previewSentAt?: string;
  approvedAt?: string;
  heldAt?: string;
  publishedAt?: string;
}
