// Дописывает распознанный голосом фрагмент в текстовое поле, не затирая то, что
// игрок уже напечатал или надиктовал ранее. Пишем напрямую в неконтролируемое
// поле (через ref) — так не трогаем семантику отправки формы серверным экшеном.
// Между фрагментами ставим пробел, если его ещё нет.
export function appendTranscript(
  el: HTMLTextAreaElement | null,
  text: string,
): void {
  if (!el) return;
  const current = el.value;
  const separator = current && !current.endsWith(" ") ? " " : "";
  el.value = current + separator + text;
  el.focus();
}
