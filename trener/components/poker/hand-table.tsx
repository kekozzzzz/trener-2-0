import type { TableState, SeatState, SeatAction } from "@/parser/table-state";
import { getTranslations } from "next-intl/server";
import { personalizeHero } from "@/lib/hero-name";
import { cn } from "@/lib/utils";

// Визуальная схема стола на момент конкретного решения — чистый рендер из снимка
// парсера (TableState). Правило 1: числа (стеки, банк, ставки, позиции) приходят
// готовыми из parser/table-state.ts, здесь только раскладка. Чистый server-компонент.
//
// Дизайн по design/design-system.md (брутализм): многоугольник по формату стола
// (N-max), карты чёрные с лаймом, рубашки живых соперников с логотипом бренда,
// единственный акцент — лайм (Hero + точка решения).

// Подписи улиц/действий берём из словаря (язык интерфейса игрока). Ключи фиксированы,
// значения — переведённые термины.
type TableLabels = {
  street: Record<TableState["street"], string>;
  action: Record<SeatAction["action"], string>;
  table: string;
  beforeFlop: string;
  pot: string;
};

const SUIT_GLYPH: Record<string, string> = { c: "♣", d: "♦", h: "♥", s: "♠" };

// Размер геометрии стола (px); контейнер держит тот же аспект, позиции — в процентах.
const W = 720;
const H = 540;
const CX = W / 2;
const CY = H / 2;
const SEAT_RX = 0.45 * W;
const SEAT_RY = 0.35 * H;
const FELT_RX = 0.4 * W;
const FELT_RY = 0.27 * H;

function sizeLabel(amount: number, bigBlind: number | null): string {
  if (bigBlind && bigBlind > 0) {
    const bb = amount / bigBlind;
    return `${bb >= 10 ? Math.round(bb) : bb.toFixed(1)}BB`;
  }
  return `${amount}`;
}

function actionLabel(a: SeatAction, bigBlind: number | null, labels: TableLabels): string {
  const name = labels.action[a.action];
  if (a.amount != null && (a.action === "BET" || a.action === "RAISE" || a.action === "CALL" || a.action === "ALL_IN")) {
    return `${name} ${sizeLabel(a.amount, bigBlind)}`;
  }
  return name;
}

function Card({ card, board }: { card: string; board?: boolean }) {
  const rank = card[0]?.toUpperCase() ?? "?";
  const suit = SUIT_GLYPH[card[1]?.toLowerCase() ?? ""] ?? card[1] ?? "";
  return (
    <span
      className={cn(
        "inline-flex flex-col items-center justify-center border border-primary bg-background font-mono font-bold leading-none text-primary",
        board ? "h-12 w-9" : "h-11 w-8"
      )}
    >
      <span className={board ? "text-[17px]" : "text-[15px]"}>{rank}</span>
      <span className={board ? "text-[15px]" : "text-[13px]"}>{suit}</span>
    </span>
  );
}

// Рубашка живого соперника — карта с логотипом бренда (grid-знак).
function CardBack() {
  return (
    <span className="inline-flex h-11 w-8 items-center justify-center border border-[#4D4D4D] bg-[#141414]">
      <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
        <rect x="1.5" y="1.5" width="9" height="9" className="fill-none stroke-foreground" strokeWidth="1.5" />
        <rect x="13.5" y="1.5" width="9" height="9" className="fill-primary" />
        <rect x="1.5" y="13.5" width="9" height="9" className="fill-none stroke-foreground" strokeWidth="1.5" />
        <rect x="13.5" y="13.5" width="9" height="9" className="fill-none stroke-foreground" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

export async function HandTable({ state, nick }: { state: TableState; nick: string | null }) {
  const t = await getTranslations("HandTable");
  const labels: TableLabels = {
    street: {
      PREFLOP: t("preflop"),
      FLOP: t("flop"),
      TURN: t("turn"),
      RIVER: t("river"),
    },
    action: {
      POST_ANTE: t("actionAnte"),
      POST_SB: t("actionSb"),
      POST_BB: t("actionBb"),
      FOLD: t("actionFold"),
      CHECK: t("actionCheck"),
      CALL: t("actionCall"),
      BET: t("actionBet"),
      RAISE: t("actionRaise"),
      ALL_IN: t("actionAllIn"),
    },
    table: t("table"),
    beforeFlop: t("beforeFlop"),
    pot: t("pot"),
  };
  const bySeat = new Map(state.seats.map((s) => [s.seatNumber, s]));
  const heroSeat = state.seats.find((s) => s.isHero)?.seatNumber ?? 1;
  const maxSeatNo = Math.max(...state.seats.map((s) => s.seatNumber));
  const n = Math.max(state.tableSize, maxSeatNo, state.seats.length);

  // вершина для физического места i (1..n): смещение от Hero, Hero внизу
  const vertex = (i: number, rx: number, ry: number) => {
    const off = (((i - heroSeat) % n) + n) % n;
    const a = Math.PI / 2 + (off / n) * 2 * Math.PI;
    return { x: CX + rx * Math.cos(a), y: CY + ry * Math.sin(a), a };
  };

  // вершины сукна (все n мест) в порядке угла — для многоугольника
  const feltVerts = Array.from({ length: n }, (_, k) => k + 1)
    .map((i) => ({ off: (((i - heroSeat) % n) + n) % n, p: vertex(i, FELT_RX, FELT_RY) }))
    .sort((a, b) => a.off - b.off)
    .map((v) => v.p);
  const poly = feltVerts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const innerPoly = Array.from({ length: n }, (_, k) => k + 1)
    .map((i) => ({ off: (((i - heroSeat) % n) + n) % n, p: vertex(i, FELT_RX * 0.82, FELT_RY * 0.76) }))
    .sort((a, b) => a.off - b.off)
    .map((p) => `${p.p.x.toFixed(1)},${p.p.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="border border-border bg-card p-3">
      <div className="mb-2">
        <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {labels.table} · {labels.street[state.street]}
        </span>
      </div>

      {/* Боксы мест и карты — в фиксированных px, поэтому на телефоне стол не сжимаем,
          а прокручиваем по горизонтали (min-w) — иначе плашки наезжали друг на друга
          (QA 2026-07-05, пункт 6). */}
      <div className="overflow-x-auto">
      <div className="relative mx-auto w-full min-w-[560px]" style={{ aspectRatio: `${W} / ${H}` }}>
        {/* сукно-многоугольник по формату стола */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <polygon points={poly} className="fill-[#151515] stroke-border" strokeWidth="1" />
          <polygon points={innerPoly} className="fill-none stroke-border opacity-45" strokeWidth="1" />
        </svg>

        {/* правый верхний угол: уровень блайндов — стадия турнира (правка Артёма
            2026-07-04). Номер уровня есть не везде (старые раздачи) — тогда только блайнды. */}
        {state.bigBlind != null && (
          <div className="absolute right-0 top-0 z-10 text-right font-mono text-[10px] uppercase tracking-label text-muted-foreground">
            {state.level != null && <span>L{state.level} · </span>}
            {state.smallBlind != null ? `${state.smallBlind.toLocaleString("ru-RU")}/` : ""}
            {state.bigBlind.toLocaleString("ru-RU")}
            {state.ante != null && state.ante > 0 && ` (анте ${state.ante.toLocaleString("ru-RU")})`}
          </div>
        )}

        {/* центр: борд + банк */}
        <div className="absolute left-1/2 top-1/2 w-3/5 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="mb-2 flex justify-center gap-1">
            {state.board.length > 0 ? (
              state.board.map((c, i) => <Card key={`${c}-${i}`} card={c} board />)
            ) : (
              <span className="font-mono text-label uppercase tracking-label text-muted-foreground">{labels.beforeFlop}</span>
            )}
          </div>
          <div className="font-mono text-label uppercase tracking-label text-muted-foreground">
            {labels.pot} <span className="text-primary">{sizeLabel(state.potSoFar, state.bigBlind)}</span>
          </div>
        </div>

        {/* места по физическому кольцу 1..n */}
        {Array.from({ length: n }, (_, k) => k + 1).map((i) => {
          const seat = bySeat.get(i);
          const sp = vertex(i, SEAT_RX, SEAT_RY);

          if (!seat) {
            // пустое место за столом
            return (
              <div
                key={`empty-${i}`}
                className="absolute h-[18px] w-[30px] -translate-x-1/2 -translate-y-1/2 border border-border opacity-35"
                style={pct(sp.x, sp.y)}
              />
            );
          }

          const accent = seat.isHero || seat.isCurrent;
          const name = personalizeHero(seat.label, nick);
          const fp = vertex(i, FELT_RX, FELT_RY);
          const chip = { x: CX + (fp.x - CX) * 0.54, y: CY + (fp.y - CY) * 0.54 };

          return (
            <div key={`seat-${i}`}>
              {/* фишки ставки на этой улице */}
              {seat.streetBet > 0 && !seat.folded && (
                <div
                  className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5"
                  style={pct(chip.x, chip.y)}
                >
                  <span
                    className={cn(
                      "h-3 w-3 border",
                      seat.isCurrent ? "border-primary bg-primary/15" : "border-muted-foreground bg-border"
                    )}
                  />
                  <span className={cn("font-mono text-[10px]", seat.isCurrent ? "text-primary" : "text-foreground")}>
                    {sizeLabel(seat.streetBet, state.bigBlind)}
                  </span>
                </div>
              )}

              {/* кнопка дилера — сбоку от баттона (буква лаймом, рамка белая) */}
              {state.buttonSeat === seat.seatNumber && (
                <div
                  className="absolute z-30 flex h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-foreground bg-background font-mono text-[10px] font-bold text-primary"
                  style={{
                    ...pct(sp.x, sp.y),
                    transform: `translate(-50%, -50%) translate(${(-Math.sin(sp.a) * 64).toFixed(1)}px, ${(Math.cos(sp.a) * 64).toFixed(1)}px)`,
                  }}
                >
                  D
                </div>
              )}

              {/* бокс игрока (центрирован на месте); карты — дочерний элемент,
                  висят строго над боксом по центру и не «уезжают» при ресайзе */}
              <div
                className="absolute z-20 w-[104px] -translate-x-1/2 -translate-y-1/2"
                style={pct(sp.x, sp.y)}
              >
                {!seat.folded && (
                  <div className="absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 gap-1">
                    {seat.isHero && state.heroCards.length > 0 ? (
                      state.heroCards.map((c, idx) => <Card key={`${c}-${idx}`} card={c} />)
                    ) : (
                      <>
                        <CardBack />
                        <CardBack />
                      </>
                    )}
                  </div>
                )}

                <div
                  className={cn(
                    "border bg-card px-2 py-1 text-center",
                    accent ? "border-primary" : "border-border",
                    seat.folded && !accent && "opacity-40",
                    seat.isCurrent && "shadow-[0_0_22px_rgba(212,255,51,0.22)]"
                  )}
                >
                  <div
                    className={cn(
                      "font-mono text-[9px] font-medium uppercase tracking-label",
                      accent ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {seat.positionName}
                  </div>
                  <div className="truncate text-[12px] leading-tight text-foreground" title={name}>
                    {name}
                  </div>
                  <div className="font-mono text-[10px] text-foreground">
                    {Math.round(state.bigBlind ? seat.remainingStack / state.bigBlind : seat.remainingStack)}
                    <span className="text-muted-foreground"> bb</span>
                  </div>
                  {seat.lastAction && (
                    <div
                      className={cn(
                        "mt-0.5 font-mono text-[9px] font-medium uppercase tracking-label",
                        seat.isCurrent ? "text-primary" : seat.isHero ? "text-primary" : "text-foreground"
                      )}
                    >
                      {seat.isCurrent ? "▸ " : ""}
                      {actionLabel(seat.lastAction, state.bigBlind, labels)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
