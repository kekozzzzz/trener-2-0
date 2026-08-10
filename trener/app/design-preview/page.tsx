import { noindex } from "@/lib/seo";
import { StackChart } from "@/components/site/stack-chart";
export const metadata = noindex;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, Trash2 } from "lucide-react";
import { HandTable } from "@/components/poker/hand-table";
import { StartHereCard, SessionDoneCard } from "@/components/tournament/focus-slot";
import { RangeGrid } from "@/components/poker/range-grid";
import { OpenChartPanel } from "@/components/profile/open-chart-panel";
import { LeakTrendRows } from "@/components/profile/leak-trend-rows";
import { ReferenceChartsPanel } from "@/components/charts/reference-charts-panel";
import type { LeakDynamics } from "@/features/profile/leak-trend";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import { isOpenSignificantlyWide, type OpenPosition } from "@/config/poker/rfi-chart";
import type { OpenChartCell, OpenChartFacts } from "@/features/profile/open-chart";
import { tableStateUpTo } from "@/parser/table-state";
import type { TableSnapshot } from "@/parser/types";

// Демо-снимок: 8-max, BB=100. HJ пошёл в олл-ин, ход на Hero (CO). После Hero ещё
// живы BTN, SB, BB. Индекс [5] — пуш HJ (точка решения). Места заняты не все —
// пустые показываются по размеру стола.
const pushSnapshot: TableSnapshot = {
  tableSize: 8,
  buttonSeat: 6,
  seats: [
    { label: "Player 1", position: "EARLY", positionName: "UTG", startingStack: 4100, seatNumber: 1 },
    { label: "Player 2", position: "EARLY", positionName: "UTG+1", startingStack: 2700, seatNumber: 2 },
    { label: "Player 3", position: "EARLY", positionName: "LJ", startingStack: 5200, seatNumber: 3 },
    { label: "Player 4", position: "HJ", startingStack: 2400, seatNumber: 4 },
    { label: "Hero", position: "CO", startingStack: 2200, seatNumber: 5 },
    { label: "Player 6", position: "BTN", startingStack: 3100, seatNumber: 6 },
    { label: "Player 7", position: "SB", startingStack: 1800, seatNumber: 7 },
    { label: "Player 8", position: "BB", startingStack: 4000, seatNumber: 8 },
  ],
  heroCards: ["Ah", "Qd"],
  board: [],
  actions: [
    { street: "PREFLOP", actor: "Player 7", action: "POST_SB", amount: 50 },
    { street: "PREFLOP", actor: "Player 8", action: "POST_BB", amount: 100 },
    { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
    { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
    { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
    { street: "PREFLOP", actor: "Player 4", action: "ALL_IN", amount: 2400 },
  ],
  potTotal: 0,
};

// Демо-снимок: 8-max, реально сидят четверо. Флоп K72r, бет Hero (BTN).
// Пустые места видны. Индекс [8] — бет Hero на флопе (точка решения).
const flopSnapshot: TableSnapshot = {
  tableSize: 8,
  buttonSeat: 6,
  seats: [
    { label: "Player 1", position: "SB", startingStack: 3300, seatNumber: 1 },
    { label: "Player 4", position: "BB", startingStack: 4000, seatNumber: 4 },
    { label: "Player 5", position: "CO", startingStack: 4000, seatNumber: 5 },
    { label: "Hero", position: "BTN", startingStack: 4000, seatNumber: 6 },
  ],
  heroCards: ["As", "Ks"],
  board: ["Kd", "7h", "2c", "9s", "3d"],
  actions: [
    { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 },
    { street: "PREFLOP", actor: "Player 4", action: "POST_BB", amount: 100 },
    { street: "PREFLOP", actor: "Player 5", action: "CALL", amount: 100 },
    { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 300 },
    { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
    { street: "PREFLOP", actor: "Player 4", action: "CALL", amount: 200 },
    { street: "PREFLOP", actor: "Player 5", action: "CALL", amount: 200 },
    { street: "FLOP", actor: "Player 4", action: "CHECK" },
    { street: "FLOP", actor: "Hero", action: "BET", amount: 500 },
  ],
  potTotal: 1450,
};

// Демо-карта открываний для превью кнопки «Твои чарты». Зелёная зона (в рамках нормы)
// строится по текущему RFI-чарту, лаймовые «утечки» заданы явно — так превью не зависит
// от правок чарта в соседней сессии. Счётчики у не-широких рук не показываются.
const WIDE_DEMO: Record<OpenPosition, [string, number][]> = {
  UTG: [["K4s", 3], ["Q6s", 2], ["J6s", 2], ["A7o", 4], ["98o", 1]],
  MP: [["K4s", 3], ["Q6s", 2], ["J6s", 2], ["A8o", 4], ["98o", 1]],
  HJ: [["K6s", 3], ["J7s", 2], ["T7s", 2], ["A6o", 3], ["K8o", 1]],
  CO: [["K4s", 4], ["95s", 2], ["85s", 2], ["Q7o", 3], ["J8o", 1]],
  BTN: [["K2s", 5], ["Q4s", 3], ["J5s", 3], ["94s", 2], ["84o", 2], ["72o", 1]],
  SB: [["K3s", 3], ["Q5s", 2], ["96s", 2], ["J6o", 2], ["T7o", 1]],
};

function buildDemoPosition(pos: OpenPosition): OpenChartCell[] {
  const wide = new Set(WIDE_DEMO[pos].map(([code]) => code));
  const cells: OpenChartCell[] = [];
  const size = GRID_RANKS.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const code = cellCode(r, c);
      if (wide.has(code)) continue; // лаймовые добавим ниже
      if (!isOpenSignificantlyWide(pos, code)) cells.push({ code, count: 4, wide: false });
    }
  }
  for (const [code, count] of WIDE_DEMO[pos]) cells.push({ code, count, wide: true });
  return cells;
}

// Демо SB-лимпов: типичные руки, которыми лимпают со SB (слабые тузы, мелкие пары,
// коннекторы). Лайма нет — лимп не судим, показываем серым со счётчиком.
const demoSbLimp: OpenChartCell[] = [
  { code: "A5s", count: 6, wide: false },
  { code: "A2s", count: 4, wide: false },
  { code: "K7s", count: 3, wide: false },
  { code: "T8s", count: 3, wide: false },
  { code: "65s", count: 4, wide: false },
  { code: "54s", count: 2, wide: false },
  { code: "44", count: 3, wide: false },
  { code: "J9o", count: 2, wide: false },
  { code: "Q8o", count: 2, wide: false },
];

const demoOpenChart: OpenChartFacts = {
  raise: {
    UTG: buildDemoPosition("UTG"),
    MP: buildDemoPosition("MP"),
    HJ: buildDemoPosition("HJ"),
    CO: buildDemoPosition("CO"),
    BTN: buildDemoPosition("BTN"),
    SB: buildDemoPosition("SB"),
  },
  sbLimp: demoSbLimp,
};

// Демо-динамика ликов: окно из 5 прошлых игровых дней, первый лик «вылечен» в текущем
// дне (лаймовая подсветка), остальные два ещё повторяются.
const demoLeakTrends: LeakDynamics[] = [
  { kind: "LIMP", window: [4, 2, 3, 0, 2], current: 0, priorTotal: 11, improved: true },
  { kind: "OPEN_WIDE", window: [2, 1, 0, 3, 2], current: 3, priorTotal: 8, improved: false },
  { kind: "BB_3BET_WIDE", window: [0, 2, 1, 0, 1], current: 1, priorTotal: 4, improved: false },
];

const palette = [
  { name: "background", hex: "#0E0E0E", role: "Фон страницы" },
  { name: "card / surface", hex: "#1A1A1A", role: "Карточки, поля, модалки" },
  { name: "border", hex: "#2A2A2A", role: "Границы, разделители" },
  { name: "foreground", hex: "#F5F5F5", role: "Основной текст" },
  { name: "muted-foreground", hex: "#8C8C8C", role: "Лейблы, второстепенный текст" },
  { name: "primary / accent", hex: "#D4FF33", role: "CTA, активные состояния, ключевые числа" },
  { name: "destructive", hex: "#FF5C5C", role: "Только текст/рамка ошибки формы" },
];

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <Label
      htmlFor={htmlFor}
      className="font-mono text-label uppercase tracking-label text-muted-foreground"
    >
      {children}
    </Label>
  );
}

// Демо-точки для превью линии стека: ровный подъём, обвал на 73-й раздаче, добивание.
// Формула детерминированная — картинка одинакова на сервере и в браузере.
const DEMO_STACK_POINTS = Array.from({ length: 120 }, (_, i) => {
  const bb = i < 72 ? 100 + i * 0.9 + Math.sin(i / 3) * 6 : 48 - (i - 72) * 0.25 + Math.sin(i / 4) * 3;
  // Блайнды растут по ходу турнира — поэтому фишки и BB расходятся, как в жизни.
  const blind = 100 + Math.floor(i / 12) * 150;
  return {
    handId: `demo-${i}`,
    stackChips: Math.round(bb * blind),
    stackBb: Math.round(bb),
    deltaChips: i === 72 ? -116 * blind : Math.round(Math.sin(i * 1.7) * 4 * blind),
    deltaBb: i === 72 ? -116 : Math.round(Math.sin(i * 1.7) * 40) / 10,
    number: i + 1,
    hasReview: i % 9 === 0,
    cards: i % 2 === 0 ? ["As", "Kd"] : ["7h", "7c"],
  };
});

export default function DesignPreviewPage() {
  return (
    <main className="mx-auto site-wrap space-y-16 px-8 py-16">
      <header className="space-y-3">
        <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Design Preview
        </p>
        <h1 className="text-display">Whygrid</h1>
        <p className="max-w-2xl text-body text-muted-foreground">
          Витрина компонентов shadcn/ui на токенах из{" "}
          <span className="font-mono text-small">design/design-system.md</span>. Сверяем стиль
          здесь. Наведи, кликни и протаби интерактивные элементы — hover/active/focus реальные.
        </p>
      </header>

      {/* Палитра */}
      {/* Верхний слот страницы турнира: «Начни отсюда» и «Сессия разобрана» */}
      <section className="space-y-4">
        <h2 className="text-h2">Верхний слот турнира</h2>
        <p className="max-w-2xl text-body text-muted-foreground">
          Слот под шапкой страницы турнира (план 2026-07-03). Пока есть непройденные
          раздачи — «Начни отсюда» с самой дорогой из них; когда все сократовские
          диалоги дошли до вердикта — финишная черта «Сессия разобрана». Реальные
          компоненты на демо-данных (mt-12 у блоков — из вёрстки страницы турнира).
        </p>
        <StartHereCard
          tournamentId="00000000-0000-0000-0000-000000000000"
          hand={{ id: "00000000-0000-0000-0000-000000000000", chipResult: -2200, tableData: pushSnapshot }}
        />
        <SessionDoneCard count={3} />
      </section>

      <section className="space-y-4">
        <h2 className="text-h2">Палитра</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {palette.map((c) => (
            <div key={c.name} className="space-y-2">
              <div className="h-16 border border-border" style={{ background: c.hex }} />
              <div className="text-small">{c.name}</div>
              <div className="font-mono text-label uppercase text-muted-foreground">{c.hex}</div>
              <div className="text-small text-muted-foreground">{c.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Типографика */}
      <section className="space-y-4">
        <h2 className="text-h2">Типографика</h2>
        <div className="space-y-4">
          <p className="text-display">Аа Бб 64 — Display</p>
          <h1 className="text-h1">Заголовок страницы — H1 40</h1>
          <h2 className="text-h2">Заголовок секции — H2 28</h2>
          <h3 className="font-sans text-h3">Подзаголовок карточки — H3 20</h3>
          <p className="text-body">
            Основной текст диалога. VPIP <span className="font-mono">24.5%</span>, потеря{" "}
            <span className="font-mono">-12.0 BB</span> в раздаче — body 16.
          </p>
          <p className="text-small text-muted-foreground">Вторичный текст — small 14.</p>
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Лейбл поля — label 12
          </p>
        </div>
      </section>

      {/* Кнопки */}
      <section className="space-y-4">
        <h2 className="text-h2">Кнопки</h2>
        <div className="flex flex-wrap items-center gap-4">
          <Button>Загрузить турнир</Button>
          <Button variant="outline">Отмена</Button>
          <Button variant="ghost">Без обводки</Button>
          <Button disabled>Недоступно</Button>
        </div>
      </section>

      {/* Поле формы */}
      <section className="space-y-4">
        <h2 className="text-h2">Поле формы</h2>
        <div className="grid max-w-md gap-6">
          <div className="grid gap-2">
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" placeholder="you@example.com" />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="nick">Никнейм</FieldLabel>
            <Input id="nick" defaultValue="Hero" />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="broken">С ошибкой</FieldLabel>
            <Input id="broken" aria-invalid defaultValue="не число" />
            <p className="text-small text-destructive">Ожидалось число</p>
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="ro">Недоступно</FieldLabel>
            <Input id="ro" disabled defaultValue="Заблокировано" />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="focus">В фокусе</FieldLabel>
            <Input
              id="focus"
              defaultValue="Активное поле"
              className="border-ring ring-3 ring-ring/50"
            />
          </div>
        </div>
      </section>

      {/* Карточка */}
      <section className="space-y-4">
        <h2 className="text-h2">Карточка</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Турнир #4821</CardTitle>
              <CardDescription>$1.10 NLH, 1024 игрока</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-display text-primary">+3.2</p>
              <p className="text-small text-muted-foreground">BB за турнир</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle>Кликабельная карточка</CardTitle>
              <CardDescription>Наведи — рамка становится акцентной</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-body">Переход к разбору раздачи →</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Таблица */}
      <section className="space-y-4">
        <h2 className="text-h2">Таблица</h2>
        <Table>
          <TableCaption>Раздачи турнира #4821</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Раздача</TableHead>
              <TableHead>Улица</TableHead>
              <TableHead>Важность</TableHead>
              <TableHead className="text-right">Результат, BB</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-mono">#142</TableCell>
              <TableCell>Ривер</TableCell>
              <TableCell>CRITICAL</TableCell>
              <TableCell className="text-right font-mono text-destructive">-18.0</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono">#118</TableCell>
              <TableCell>Флоп</TableCell>
              <TableCell>STRONG</TableCell>
              <TableCell className="text-right font-mono">+6.5</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono">#097</TableCell>
              <TableCell>Префлоп</TableCell>
              <TableCell>MEDIUM</TableCell>
              <TableCell className="text-right font-mono text-primary">+2.0</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      {/* Диалог */}
      <section className="space-y-4">
        <h2 className="text-h2">Диалог</h2>
        <Dialog>
          <DialogTrigger render={<Button variant="outline">Открыть диалог</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Почему именно колл?</DialogTitle>
              <DialogDescription>
                Сократовский вопрос перед оценкой — стадия question диалога.
              </DialogDescription>
            </DialogHeader>
            <p className="text-body">
              На ривере банк 1200, ставка villain 600. Какие пот-оддсы у героя?
            </p>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Закрыть</Button>} />
              <Button>Ответить</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      {/* Стол раздачи */}
      <section className="space-y-4">
        <h2 className="text-h2">Стол раздачи</h2>
        <p className="max-w-2xl text-body text-muted-foreground">
          Схема стола над вопросом разбора. Точка решения подсвечена акцентом «▸».
        </p>

        <div className="space-y-2">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Момент: соперник пошёл в олл-ин (вопрос — какой диапазон под колл пуша)
          </p>
          <HandTable state={tableStateUpTo(pushSnapshot, 5)} nick="kekoz" />
        </div>

        <div className="space-y-2">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Момент: бет Hero на флопе
          </p>
          <HandTable state={tableStateUpTo(flopSnapshot, 8)} nick="kekoz" />
        </div>
      </section>

      {/* Сетка диапазонов */}
      <section className="space-y-4">
        <h2 className="text-h2">Сетка диапазонов</h2>
        <p className="max-w-2xl text-body text-muted-foreground">
          Форма ответа в диалоге: игрок отмечает руки, которые даёт оппоненту. Показана рядом с
          текстом вопроса, чтобы сверить масштаб.
        </p>

        <div className="space-y-2">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Вопрос 2
          </p>
          <p className="text-h3 text-foreground">
            Соперник пошёл в олл-ин с BB. Какой диапазон рук ты ему даёшь под этот пуш?
          </p>
          <RangeGrid />
        </div>
      </section>

      {/* Чарт открываний игрока («Твои чарты») */}
      <section className="space-y-4">
        <h2 className="text-h2">Чарт открываний игрока</h2>
        <p className="max-w-2xl text-body text-muted-foreground">
          Зеркало «как ты открываешься» под профилем на «Мои турниры». Переключи позиции —
          лаймом горят руки, которые игрок открывает широко (со счётчиком), серым — обычный
          опен, пусто — не открывает. Базовый чарт как «эталон» не показан.
        </p>
        <div className="border border-border bg-card p-6">
          <OpenChartPanel chart={demoOpenChart} tournamentsCounted={42} />
        </div>
      </section>

      {/* Динамика ликов (лик-трекер) — демо-данные */}
      <section className="space-y-4">
        <h2 className="text-h2">Динамика ликов</h2>
        <p className="max-w-2xl text-body text-muted-foreground">
          Блок «Динамика» на странице турнира и «Динамика ошибок» на «Моих турнирах»
          (топ-3). Числа — счётчики лика по прошлым игровым дням в хронологии, справа —
          текущий день. «В этот день ни разу» — лаймовая рамка (прогресс).
        </p>
        <LeakTrendRows trends={demoLeakTrends} />
      </section>

      {/* Эталонный чарт открытий (страница /charts) — на живом конфиге */}
      <section className="space-y-4">
        <h2 className="text-h2">Эталонный чарт открытий</h2>
        <p className="max-w-2xl text-body text-muted-foreground">
          Панель страницы /charts (норма, не зеркало): сплошной лайм — «всегда»,
          контур — «иногда», серый — граница допуска. Считается из того же конфига,
          которым судит детектор.
        </p>
        <div className="border border-border bg-card p-6">
          <ReferenceChartsPanel />
        </div>
      </section>

      {/* Цель на сессию (мокап, план 2026-07-03) — два состояния */}
      <section className="space-y-4">
        <h2 className="text-h2">Цель на сессию</h2>
        <p className="max-w-2xl text-body text-muted-foreground">
          Блок на «Моих турнирах» над «Динамикой ошибок». Одна цель из главного
          системного лика; после загрузки турниров вечера — детерминированная проверка.
          Ссылка «норма» ведёт на эталонный чарт спота. Два состояния: прошлая сессия
          выполнена / нарушено.
        </p>
        <div className="border border-primary bg-card p-6">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Цель на сессию
          </p>
          <p className="mt-2 text-h3 text-foreground">Ни одного открытия лимпом</p>
          <p className="mt-2 text-small text-muted-foreground">
            Твой самый частый лик: в 4 из 5 прошлых сессий, всего 11 раз.{" "}
            <span className="cursor-pointer text-foreground underline">Посмотреть норму открытий</span>
          </p>
          <p className="mt-4 flex items-center gap-2 font-mono text-label uppercase tracking-label text-primary">
            Прошлая сессия: цель достигнута ✓
          </p>
        </div>
        <div className="border border-border bg-card p-6">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Цель на сессию
          </p>
          <p className="mt-2 text-h3 text-foreground">Не открывайся шире нормы с ранних позиций</p>
          <p className="mt-2 text-small text-muted-foreground">
            Твой самый частый лик: в 4 из 5 прошлых сессий, всего 8 раз.{" "}
            <span className="cursor-pointer text-foreground underline">Посмотреть норму открытий</span>
          </p>
          <p className="mt-4 font-mono text-label uppercase tracking-label text-muted-foreground">
            Прошлая сессия: нарушено 3 раза — цель остаётся
          </p>
        </div>
      </section>

      {/* Выпадающее меню */}
      <section className="space-y-4">
        <h2 className="text-h2">Выпадающее меню</h2>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline">
                Турнир #4821 <ChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Действия</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Открыть карточку</DropdownMenuItem>
              <DropdownMenuItem>Экспорт HH</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Trash2 /> Удалить турнир
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </section>
      {/* Интерактивная линия стека — заказ Артёма 2026-08-09. Данные демонстрационные:
          страница разбора требует логина, а посмотреть поведение надо без него. */}
      <section className="space-y-4">
        <h2 className="text-h2">Линия стека — наведение и переход</h2>
        <p className="text-small text-muted-foreground">
          Веди мышью вдоль линии: под курсором показывается раздача. Клик по точке с разбором
          открывает её (здесь ссылки-заглушки). Стрелки ← → работают с клавиатуры.
        </p>
        <div className="border border-border bg-card p-6">
          <StackChart
            points={DEMO_STACK_POINTS}
            currentIndex={72}
            hrefBase="#hand-"
            labels={{
              hand: "Раздача {number}",
              chips: "{chips} фишек",
              stack: "{stack} BB в стеке",
              delta: "{sign}{delta} за раздачу",
              open: "Открыть разбор",
              noReview: "Эту раздачу не разбирали",
              current: "ты здесь",
              legend: "Точки на линии - разобранные раздачи, по ним можно кликнуть",
            }}
          />
        </div>
      </section>
    </main>
  );
}
