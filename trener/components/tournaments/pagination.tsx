import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TOURNAMENTS_PER_PAGE_OPTIONS, TOURNAMENTS_PER_PAGE_DEFAULT } from "@/config/tournaments";
import { pageItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";

// Ссылка на страницу списка. Дефолты из адреса убираем — «Мои турниры» должны
// оставаться /tournaments, а не /tournaments?page=1&per=25. Параметры сводки после
// загрузки (uploaded/dup/failed) сюда намеренно не переносим: она про только что
// залитую пачку, а не про страницу, на которую игрок ушёл листать.
function pageHref(page: number, perPage: number): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (perPage !== TOURNAMENTS_PER_PAGE_DEFAULT) params.set("per", String(perPage));
  const query = params.toString();
  return query ? `/tournaments?${query}` : "/tournaments";
}

const cellClass =
  "inline-flex size-8 items-center justify-center border font-mono text-label uppercase tracking-label transition-colors duration-150 ease-out";

function Arrow({
  to,
  perPage,
  label,
  disabled,
  children,
}: {
  to: number;
  perPage: number;
  label: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  // На краях списка — не мёртвая ссылка на саму себя, а явно погашенный элемент.
  if (disabled) {
    return (
      <span aria-hidden className={cn(cellClass, "border-border text-muted-foreground opacity-35")}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={pageHref(to, perPage)}
      aria-label={label}
      className={cn(cellClass, "border-border text-foreground hover:border-primary hover:text-primary")}
    >
      {children}
    </Link>
  );
}

export async function TournamentsPagination({
  page,
  perPage,
  total,
  totalPages,
}: {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}) {
  const t = await getTranslations("Tournaments");
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <nav
      aria-label={t("paginationLabel")}
      className="mt-8 flex flex-wrap items-center justify-between gap-6 border-t border-border pt-6"
    >
      {/* Сколько турниров на странице. Смена размера возвращает на первую страницу:
          иначе «страница 6 по 10» на размере 100 — это позиция, которой уже нет. */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {t("perPage")}
        </span>
        <div className="flex items-center gap-1">
          {TOURNAMENTS_PER_PAGE_OPTIONS.map((option) => {
            const active = option === perPage;
            return (
              <Link
                key={option}
                href={pageHref(1, option)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  cellClass,
                  active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
                )}
              >
                {option}
              </Link>
            );
          })}
        </div>
      </div>

      <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
        {t("rangeOf", { from, to, total })}
      </p>

      <div className="flex items-center gap-1">
        <Arrow to={page - 1} perPage={perPage} label={t("prevPage")} disabled={page <= 1}>
          <ChevronLeft className="size-4" />
        </Arrow>

        {pageItems(page, totalPages).map((item, i) =>
          item === "gap" ? (
            <span
              key={`gap-${i}`}
              aria-hidden
              className="inline-flex size-8 items-center justify-center font-mono text-label text-muted-foreground"
            >
              …
            </span>
          ) : (
            <Link
              key={item}
              href={pageHref(item, perPage)}
              aria-label={t("pageNumber", { n: item })}
              aria-current={item === page ? "page" : undefined}
              className={cn(
                cellClass,
                item === page
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
              )}
            >
              {item}
            </Link>
          ),
        )}

        <Arrow to={page + 1} perPage={perPage} label={t("nextPage")} disabled={page >= totalPages}>
          <ChevronRight className="size-4" />
        </Arrow>
      </div>
    </nav>
  );
}
