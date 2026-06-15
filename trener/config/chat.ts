// Лимит длины сообщения в чате по раздаче — бизнес-число, живёт только в
// конфиге/.env (правило проекта №3). Основание — architecture/07-безопасность.md,
// раздел 2 «Модерация входящего текста»: «ограничение длины (~500 символов —
// вопрос по конкретной раздаче не требует романа)». Это и защита от лишних
// платных токенов, и тормоз для злоупотреблений.

const DEFAULT_CHAT_MESSAGE_MAX_LENGTH = 500;

export function getChatMessageMaxLength(): number {
  const raw = process.env.CHAT_MESSAGE_MAX_LENGTH;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CHAT_MESSAGE_MAX_LENGTH;
}
