// Кривая стека по ходу турнира — линия, на которой видно, где именно посыпался стек.
// Заказ Артёма 2026-08-08: приём с лендинга («стек по ходу турнира») внедряем в сам разбор.
// Продолжение 2026-08-09: линия интерактивная — «стек ровный-ровный, потом упал; а что я
// такого сделал?». Наведение показывает раздачу, клик ведёт в её разбор.
//
// Правило 1 проекта: числа считает код, не модель. Здесь ровно это — стек героя на
// начало каждой раздачи, переведённый в большие блайнды по BB той же раздачи.
// В BB, а не в фишках: в турнире блайнды растут, и 20 000 фишек на десятом уровне и
// на первом — это принципиально разные стеки. Одна и та же линия в фишках соврала бы.

export type StackCurveRow = {
  handId: string;
  /** Стек героя на начало раздачи, в фишках. */
  stack: number | null;
  /** Большой блайнд той же раздачи, в фишках. */
  bigBlind: number | null;
  /** Итог раздачи в фишках (посчитал парсер). */
  chipResult: number | null;
  /** Есть ли у раздачи готовый разбор — только на такие точки можно кликнуть. */
  hasReview: boolean;
  /** Карты героя строкой из снимка: «5s 5h». */
  heroCards: string | null;
};

export type StackPoint = {
  handId: string;
  /** Стек на начало раздачи, в больших блайндах. */
  stackBb: number;
  /** Сколько раздача принесла или забрала, в BB. */
  deltaBb: number | null;
  /** Порядковый номер раздачи в турнире, с единицы. */
  number: number;
  hasReview: boolean;
  cards: string[];
};

export type StackCurve = {
  points: StackPoint[];
  /** Позиция текущей раздачи в points; null — раздачи нет в линии. */
  currentIndex: number | null;
};

// Линия рисуется, только если точек хватает на осмысленную форму. Две точки — это
// отрезок, он ничего не рассказывает про ход турнира.
const MIN_POINTS = 4;

// Достаём из снимков несколько чисел на раздачу, а не весь table_data: снимок с
// действиями весит килобайты, и на турнире в полторы сотни раздач тащить его целиком
// ради одной линии — расточительство. Считает Postgres, наружу выходят готовые числа.
//
// Порядок — как игралось: played_at, а у старых записей без него — created_at
// (раздачи создаются одной пачкой в порядке парсера).
export async function fetchStackCurveRows(
  db: { $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T> },
  tournamentId: string
): Promise<StackCurveRow[]> {
  return db.$queryRaw<StackCurveRow[]>`
    SELECT h.id AS "handId",
           h.chip_result AS "chipResult",
           (h.analysis IS NOT NULL OR d.id IS NOT NULL) AS "hasReview",
           (SELECT (s->>'startingStack')::float8
              FROM jsonb_array_elements(h.table_data->'seats') AS s
             WHERE s->>'label' = 'Hero'
             LIMIT 1) AS "stack",
           (SELECT MAX((a->>'amount')::float8)
              FROM jsonb_array_elements(h.table_data->'actions') AS a
             WHERE a->>'action' = 'POST_BB') AS "bigBlind",
           (SELECT string_agg(c #>> '{}', ' ')
              FROM jsonb_array_elements(h.table_data->'heroCards') AS c) AS "heroCards"
      FROM hands h
      LEFT JOIN dialogues d ON d.hand_id = h.id
     WHERE h.tournament_id = ${tournamentId}::uuid
     ORDER BY h.played_at ASC NULLS LAST, h.created_at ASC
  `;
}

export function buildStackCurve(rows: StackCurveRow[], currentHandId: string): StackCurve | null {
  const points: StackPoint[] = [];

  rows.forEach((row, index) => {
    // Раздача без BB (нет POST_BB в снимке) не сравнима с остальными в больших
    // блайндах — пропускаем точку, а не подмешиваем фишки к BB.
    if (row.stack == null || !row.bigBlind) return;
    points.push({
      handId: row.handId,
      stackBb: Math.round(row.stack / row.bigBlind),
      deltaBb: row.chipResult == null ? null : Math.round((row.chipResult / row.bigBlind) * 10) / 10,
      // Номер по исходному порядку, а не по оставшимся точкам: игрок ищет свою
      // раздачу в турнире, и пропуск пары несравнимых не должен сдвигать нумерацию.
      number: index + 1,
      hasReview: Boolean(row.hasReview),
      cards: row.heroCards ? row.heroCards.split(" ").filter(Boolean) : [],
    });
  });

  if (points.length < MIN_POINTS) return null;

  const index = points.findIndex((p) => p.handId === currentHandId);
  return { points, currentIndex: index === -1 ? null : index };
}
