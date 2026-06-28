import type { TableState, SeatState, SeatAction } from "@/parser/table-state";
import { personalizeHero } from "@/lib/hero-name";
import { cn } from "@/lib/utils";

// Визуальная схема стола на момент конкретного решения — чистый рендер из снимка
// парсера (TableState). Правило 1: числа (стеки, банк, ставки, позиции) приходят
// готовыми из parser/table-state.ts, здесь только раскладка. Чистый server-компонент.
//
// Дизайн по design/design-system.md (брутализм): многоугольник по формату стола
// (N-max), карты чёрные с лаймом, рубашки живых соперников с логотипом бренда,
// единственный акцент — лайм (Hero + точка решения).

const STREET_RU: Record<TableState["street"], string> = {
  PREFLOP: "Префлоп",
  FLOP: "Флоп",
  TURN: "Тёрн",
  RIVER: "Ривер",
};

const ACTION_RU: Record<SeatAction["action"], string> = {
  POST_ANTE: "анте",
  POST_SB: "малый блайнд",
  POST_BB: "большой блайнд",
  FOLD: "фолд",
  CHECK: "чек",
  CALL: "колл",
  BET: "бет",
  RAISE: "рейз",
  ALL_IN: "олл-ин",
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

function actionLabel(a: SeatAction, bigBlind: number | null): string {
  const name = ACTION_RU[a.action];
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

export function HandTable({ state, nick }: { state: TableState; nick: string | null }) {
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
          Стол · {STREET_RU[state.street]}
        </span>
      </div>

      <div className="relative mx-auto w-full" style={{ aspectRatio: `${W} / ${H}` }}>
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

        {/* центр: борд + банк */}
        <div className="absolute left-1/2 top-1/2 w-3/5 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="mb-2 flex justify-center gap-1">
            {state.board.length > 0 ? (
              state.board.map((c, i) => <Card key={`${c}-${i}`} card={c} board />)
            ) : (
              <span className="font-mono text-label uppercase tracking-label text-muted-foreground">до флопа</span>
            )}
          </div>
          <div className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Банк <span className="text-primary">{sizeLabel(state.potSoFar, state.bigBlind)}</span>
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
                    {Math.round(state.bigBlind ? seat.startingStack / state.bigBlind : seat.startingStack)}
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
                      {actionLabel(seat.lastAction, state.bigBlind)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
