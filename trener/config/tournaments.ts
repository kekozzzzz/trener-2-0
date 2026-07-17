// Постраничный список «Мои турниры». Правило 3: варианты выбора и значение по
// умолчанию — в конфиге, не в вёрстке и не в запросе.
//
// 25 по умолчанию — окно игрового дня целиком (Артём грузит турниры пачками),
// при этом страница не превращается в бесконечную ленту.
export const TOURNAMENTS_PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
export const TOURNAMENTS_PER_PAGE_DEFAULT = 25;

// Cookie, где помним выбор игрока (баг 17.07: размер жил только в адресе и терялся при уходе со
// страницы). Читаем как дефолт, пишем из server action app/tournaments/actions.ts.
export const TOURNAMENTS_PER_PAGE_COOKIE = "tPerPage";

// Нормализация «сколько на странице» из адресной строки: чужое/битое значение
// молча превращается в дефолт, а не роняет страницу.
export function normalizePerPage(value: number): number {
  return (TOURNAMENTS_PER_PAGE_OPTIONS as readonly number[]).includes(value)
    ? value
    : TOURNAMENTS_PER_PAGE_DEFAULT;
}
