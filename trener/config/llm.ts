// Конфигурация LLM-провайдера — модель и ключ живут только здесь и в .env,
// бизнес-логика и адаптеры их не хардкодят (правило проекта №3).

const DEFAULT_MODEL = "claude-sonnet-4-6";

export function getAnthropicApiKey(): string {
  return process.env.ANTHROPIC_API_KEY ?? "";
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}
