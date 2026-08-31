// Румы, чьи HH-файлы читает парсер. Единый источник правды для двух мест:
// гайда «Как выгрузить руки» (components/upload/hand-history-guide.tsx) и ленты
// на главной. Появился новый парсер — правим только здесь, и витрина не разъезжается
// с тем, что продукт умеет на самом деле.
//
// name — как в гайде: по узнаваемому клиенту/скину, а не по сети (игрок знает свой
// скин, а не имя сети). short — брендовое имя для ленты, капсом и без «/».

export type SupportedRoom = {
  id: string;
  /** Полное имя со скинами — для гайда загрузки. */
  name: string;
  /** Короткое имя для ленты на главной. */
  short: string;
  hasTag?: boolean;
  hasPaths?: boolean;
  hasNote?: boolean;
};

export const SUPPORTED_ROOMS: SupportedRoom[] = [
  { id: "ggpoker", name: "GGPoker", short: "GGPoker", hasNote: true },
  { id: "pokerstars", name: "PokerStars", short: "PokerStars", hasPaths: true, hasNote: true },
  // PokerPlanets — преемник PokerStars Sochi (формат = клон PokerStars).
  {
    id: "pokerplanets",
    name: "PokerPlanets",
    short: "PokerPlanets",
    hasTag: true,
    hasPaths: true,
    hasNote: true,
  },
  // Sisal — итальянский лицензированный рум на движке PokerStars (формат = клон PokerStars).
  { id: "sisal", name: "Sisal", short: "Sisal", hasPaths: true, hasNote: true },
  { id: "winamax", name: "Winamax", short: "Winamax", hasPaths: true, hasNote: true },
  { id: "888poker", name: "888poker", short: "888poker", hasPaths: true },
  {
    id: "acr",
    name: "ACR / PokerKing / Black Chip",
    short: "ACR",
    hasTag: true,
    hasPaths: true,
  },
  {
    id: "ipoker",
    name: "Red Star / Betfair / Betsson",
    short: "Red Star",
    hasTag: true,
    hasPaths: true,
    hasNote: true,
  },
  {
    id: "chico",
    name: "BetOnline / TigerGaming / SportsBetting",
    short: "BetOnline",
    hasTag: true,
    hasPaths: true,
    hasNote: true,
  },
];

/** Короткие имена для ленты и строки под кнопками hero. */
export const ROOM_SHORT_NAMES = SUPPORTED_ROOMS.map((room) => room.short);
