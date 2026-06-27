import { POKER_ASR_FIXUPS } from "@/config/poker-asr-fixups";

// Границы слова через Unicode-свойство «буква» (\p{L}): не даём правке зацепить
// часть другого слова. Встроенный \b использовать нельзя — в JS он опознаёт только
// латиницу и для кириллицы не срабатывает.
const COMPILED = POKER_ASR_FIXUPS.map(
  ([source, replacement]) =>
    [new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, "giu"), replacement] as const,
);

// Прогоняет распознанный текст через словарь авто-правок (config/poker-asr-fixups).
// Чистая функция без побочных эффектов — применяется к выходу STT перед возвратом
// клиенту.
export function applyPokerFixups(text: string): string {
  let result = text;
  for (const [pattern, replacement] of COMPILED) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
