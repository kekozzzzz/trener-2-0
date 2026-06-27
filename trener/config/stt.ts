// Конфигурация распознавания речи (STT) — ключи, адреса, модель и лимиты живут
// только здесь и в .env, адаптеры их не хардкодят (правило проекта №3).
//
// Движок — Qwen3-ASR-Flash. Боевой путь (решение 2026-06-27): через OpenRouter
// (аккаунт уже оплачен) поверх КЗ-релея — потому что с боевого сервера на Yandex
// Cloud прямой доступ к Alibaba/OpenRouter нестабилен (рвётся пачками), а маршрут
// через релей в Казахстане надёжен (20/20). Запасной путь — DashScope напрямую
// (адаптер qwen.ts), если когда-нибудь прямой доступ станет стабильным.

const DEFAULT_LANGUAGE = "ru";
const DEFAULT_TIMEOUT_MS = 30_000;
// Потолок размера присылаемого аудио. У моделей лимит ~10 МБ; держим чуть ниже,
// чтобы base64-обёртка (×4/3) с запасом влезала. Запись ответа — секунды.
const DEFAULT_MAX_AUDIO_BYTES = 7 * 1024 * 1024;

// ── Общие параметры (одинаковы для обоих провайдеров) ───────────────────────

// Язык распознавания. Пусто/"auto" — автоопределение; по умолчанию русский.
export function getSttLanguage(): string {
  return process.env.STT_LANGUAGE || DEFAULT_LANGUAGE;
}

// Нормализация чисел («двадцать пять» → «25»). У нас речь с числами блайндов.
export function getSttEnableItn(): boolean {
  return process.env.STT_ENABLE_ITN !== "false";
}

export function getSttTimeoutMs(): number {
  const raw = Number(process.env.STT_TIMEOUT_MS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

export function getSttMaxAudioBytes(): number {
  const raw = Number(process.env.STT_MAX_AUDIO_BYTES);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_AUDIO_BYTES;
}

// Секрет для КЗ-релея (заголовок x-proxy-secret) — тот же, которым подписываются
// запросы к Claude (ANTHROPIC_PROXY_SECRET). Пусто — заголовок не шлём (прямой путь
// без релея). Релей без верного секрета отвечает 403.
export function getSttProxySecret(): string {
  return process.env.STT_PROXY_SECRET ?? "";
}

// ── OpenRouter (боевой путь) ────────────────────────────────────────────────

export function getOpenrouterApiKey(): string {
  return process.env.OPENROUTER_API_KEY ?? "";
}

// Базовый адрес OpenRouter. На проде указывает на КЗ-релей
// (https://<релей>/openrouter), в деве можно оставить прямой адрес. SDK не
// используем — путь /api/v1/... дописывает адаптер.
export function getOpenrouterBaseUrl(): string {
  return process.env.OPENROUTER_BASE_URL || "https://openrouter.ai";
}

// Боевая модель — Voxtral (Mistral): на сравнении 2026-06-27 лучшая по русскому
// покерному жаргону (взяла олл-ин, оверпару, ICM, SPR, сквиз) и самая дешёвая по
// входу. Qwen3-ASR на OpenRouter недоступна (нет в списке моделей аккаунта).
export function getOpenrouterModel(): string {
  return process.env.STT_MODEL || "mistralai/voxtral-small-24b-2507";
}

// Инструкция модели: чат-формату нужен явный приказ «распознай дословно», иначе
// мультимодальная модель может пересказать или прокомментировать. В конфиге
// (правило 3) — можно подправить через .env без передеплоя.
export function getSttInstruction(): string {
  return (
    process.env.STT_INSTRUCTION ||
    "Распознай эту аудиозапись на русском и верни ТОЛЬКО дословный текст речи, без своих комментариев."
  );
}

// ── DashScope (запасной прямой путь, адаптер qwen.ts) ───────────────────────

export function getDashscopeApiKey(): string {
  return process.env.DASHSCOPE_API_KEY ?? "";
}

export function getSttBaseUrl(): string {
  return process.env.STT_BASE_URL || "https://dashscope-intl.aliyuncs.com";
}

export function getSttModel(): string {
  return process.env.STT_MODEL || "qwen3-asr-flash";
}
