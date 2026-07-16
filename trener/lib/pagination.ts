// Какие номера страниц показывать: первая, последняя, текущая и её соседи; между
// разрывами — многоточие ("gap"). Так строка не растёт с числом страниц — на 40
// турнирах и на 4000 она одной ширины.
export function pageItems(page: number, totalPages: number): Array<number | "gap"> {
  const shown = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const pages = [...shown].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);

  const items: Array<number | "gap"> = [];
  let prev = 0;
  for (const n of pages) {
    if (prev && n - prev > 1) items.push("gap");
    items.push(n);
    prev = n;
  }
  return items;
}
