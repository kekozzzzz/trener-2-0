// Публичный чейнджлог продукта (/changelog) — только конкретные видимые изменения,
// без «улучшили промпт» / «стал лучше работать» без объяснения, что это дало игроку.
// Маркетинговые/трастовые страницы (about, example) сюда не идут — только сам продукт.
// Новую запись добавлять СВЕРХУ (новые первыми). Раз в 1-2 недели или при заметном
// изменении — черновик, показать Артёму на правку, потом сюда. Решение 2026-08-17,
// architecture/00-правила-проекта.md.
export type ChangelogEntry = { date: string; ru: string; en: string };

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-08-31",
    ru: "Загрузка турниров из Sisal - итальянского рума на движке PokerStars.",
    en: "Upload tournaments from Sisal - an Italian room built on the PokerStars engine.",
  },
  {
    date: "2026-08-31",
    ru: "Дневник тренера стал надёжнее: одна плохая заметка больше не роняет весь дневник.",
    en: "The coach's diary got more reliable: one bad note no longer breaks the whole diary.",
  },
  {
    date: "2026-08-19",
    ru: "Тренер точнее считает остаток стека соперника сразу после его ставки - не только между улицами.",
    en: "The coach now tracks the opponent's remaining stack right after their bet - not just between streets.",
  },
  {
    date: "2026-08-04",
    ru: "Тренер стал замечать флеш-угрозу на монотонной доске и предупреждает о ней в вердикте.",
    en: "The coach now spots a flush threat on a monotone board and calls it out in the verdict.",
  },
  {
    date: "2026-07-29",
    ru: "После первого турнира тренер коротко спрашивает, помог ли разбор.",
    en: "After your first tournament, the coach asks a short question about whether the review helped.",
  },
  {
    date: "2026-07-21",
    ru: "Разбор многосторонних (мультивей) раздач стал точнее - тренер больше не путает роли игроков на постфлопе.",
    en: "Multiway hand reviews got more accurate - the coach no longer mixes up players' roles postflop.",
  },
  {
    date: "2026-07-20",
    ru: "На /charts добавлен чарт «лимп с малого блайнда».",
    en: "Added a \"small-blind limp\" chart on /charts.",
  },
  {
    date: "2026-07-19",
    ru: "Ответ поддержки приходит прямо в тот же чат Telegram, не только на почту.",
    en: "Support replies land right in the same Telegram chat, not just by email.",
  },
  {
    date: "2026-07-18",
    ru: "Тренер стал точнее: раньше иногда путал карту игрока и соперника - исправлено.",
    en: "The coach got more accurate: it used to occasionally mix up your card with the opponent's - fixed.",
  },
  {
    date: "2026-07-11",
    ru: "Появились открытые эталонные чарты и словарь покерных терминов.",
    en: "Open reference charts and a poker-terms glossary appeared.",
  },
  {
    date: "2026-07-05",
    ru: "Тренер начал помнить твои прошлые раздачи и отмечать повторяющиеся ошибки.",
    en: "The coach started remembering your past hands and flagging repeated mistakes.",
  },
  {
    date: "2026-07-03",
    ru: "Диапазонный движок: отмечаешь диапазон соперника на сетке 13×13, тренер считает точную математику против него.",
    en: "Range engine: mark the villain's range on a 13x13 grid, the coach runs exact math against it.",
  },
  {
    date: "2026-06-29",
    ru: "Загрузка турниров из ACR/PokerKing, iPoker, 888poker, Winamax - не только GGPoker.",
    en: "Upload tournaments from ACR/PokerKing, iPoker, 888poker, Winamax - not just GGPoker.",
  },
];
