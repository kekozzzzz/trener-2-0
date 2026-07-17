import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TOURNAMENTS_PER_PAGE_OPTIONS } from "@/config/tournaments";
import { setTournamentsPerPage } from "@/app/tournaments/actions";
import { pageItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";

// Ссылка на страницу списка. Размер (perPage) теперь живёт в cookie, а не в адресе, поэтому в URL
// остаётся только ?page — «Мои турниры» так и остаются /tournaments. Параметры сводки после
// загрузки (uploaded/dup/failed) сюда намеренно не переносим: она про только что залитую пачку.
function pageHref(page: number): string {
  return page > 1 ? `/tournaments?page=${page}` : "/tournaments";
}

const cellClass =
  "inline-flex size-8 items-center justify-center border font-mono text-label uppercase tracking-label transition-colors duration-150 ease-out";

function Arrow({
  to,
  label,
  disabled,
  children,
}: {
  to: number;
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
      href={pageHref(to)}
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
            // Форма + server action: выбор пишется в cookie (помнится между заходами) и даёт
            // свежий серверный рендер. className="contents" — форма не создаёт свой бокс, кнопка
            // остаётся в том же flex-ряду, что и раньше были ссылки.
            return (
              <form key={option} action={setTournamentsPerPage} className="contents">
                <input type="hidden" name="per" value={option} />
                <button
                  type="submit"
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    cellClass,
                    active
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
                  )}
                >
                  {option}
                </button>
              </form>
            );
          })}
        </div>
      </div>

      <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
        {t("rangeOf", { from, to, total })}
      </p>

      <div className="flex items-center gap-1">
        <Arrow to={page - 1} label={t("prevPage")} disabled={page <= 1}>
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
              href={pageHref(item)}
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

        <Arrow to={page + 1} label={t("nextPage")} disabled={page >= totalPages}>
          <ChevronRight className="size-4" />
        </Arrow>
      </div>
    </nav>
  );
}
