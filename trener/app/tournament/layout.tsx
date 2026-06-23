import { noindex } from "@/lib/seo";

// Все страницы турнира приватны (просмотр конкретного турнира и его раздач). Запрет
// индексации задаём один раз в layout — он распространяется на все вложенные маршруты
// (/tournament/[id] и /tournament/[id]/hands/[handId]).
export const metadata = noindex;

export default function TournamentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
