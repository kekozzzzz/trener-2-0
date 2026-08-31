// Общий каркас HTML-писем продукта (план 2026-08-31-письма-редизайн-и-возврат-игрока).
// Единственное сознательное отступление от тёмной дизайн-системы сайта (design/design-
// system.md, «Выучено на правках», 2026-08-31): письмо открывается не в браузере, а в
// Gmail/Outlook/телефоне — движки рендеринга там куда уже, свой тёмный режим может
// перекрасить уже тёмное письмо поверх. Поэтому канва письма светлая, бренд остаётся
// собой в двух точках: акцентный лайм на кнопке (точная копия кнопки сайта) и вордмарк
// «Why/grid» на тёмной плашке в подвале — там же, где сайт держит вордмарк в подвале.
//
// Шрифты — Arial/Helvetica и системный моно-стек: Inter и JetBrains Mono сайта в письмах
// НЕ грузятся (email-клиенты не поддерживают @font-face надёжно), поэтому даже не пытаемся.

export type EmailButton = { label: string; url: string };

export type EmailContent = {
  heading: string;
  // HTML-safe фрагменты (наш собственный текст, не пользовательский ввод — экранирование
  // не требуется). Каждый оборачивается в <p> слоем ниже.
  paragraphs: string[];
  button?: EmailButton;
  note?: string; // мелкая приглушённая строка под кнопкой
  footerNote?: string; // мелкая приглушённая строка в подвале рядом с лого
};

const EMAIL_BG = "#F5F5F3";
const CARD_BG = "#FFFFFF";
const CARD_BORDER = "#E4E4E0";
const HEADING_COLOR = "#0E0E0E";
const BODY_COLOR = "#4A4A4A";
const NOTE_COLOR = "#8C8C8C";
const ACCENT = "#D4FF33";
const CHIP_BG = "#0E0E0E";
const FONT_STACK = "Arial, Helvetica, sans-serif";
const MONO_STACK = '"Courier New", Courier, monospace';

export function renderEmailHtml(content: EmailContent): string {
  const paragraphsHtml = content.paragraphs
    .map((p) => `<p style="color:${BODY_COLOR};font-size:15px;line-height:1.6;margin:0 0 16px;">${p}</p>`)
    .join("");

  const buttonHtml = content.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px;">
        <tr><td bgcolor="${ACCENT}" style="background:${ACCENT};border:1px solid ${ACCENT};">
          <a href="${content.button.url}" style="display:inline-block;padding:14px 28px;font-family:${MONO_STACK};font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:${HEADING_COLOR};text-decoration:none;">${content.button.label}</a>
        </td></tr>
      </table>`
    : "";

  const noteHtml = content.note
    ? `<p style="color:${NOTE_COLOR};font-size:12.5px;line-height:1.6;margin:20px 0 0;">${content.note}</p>`
    : "";

  const footerNoteHtml = content.footerNote
    ? `<span style="color:#ABABAB;font-size:11.5px;line-height:1.5;padding-left:12px;">${content.footerNote}</span>`
    : "";

  return `<div style="background:${EMAIL_BG};padding:40px 16px;font-family:${FONT_STACK};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;margin:0 auto;">
      <tr><td bgcolor="${CARD_BG}" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};padding:40px 36px;">
        <p style="color:${HEADING_COLOR};font-size:20px;font-weight:bold;margin:0 0 16px;line-height:1.3;font-family:${FONT_STACK};">${content.heading}</p>
        ${paragraphsHtml}
        ${buttonHtml}
        ${noteHtml}
        <hr style="border:none;border-top:1px solid ${CARD_BORDER};margin:32px 0 22px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td bgcolor="${CHIP_BG}" style="background:${CHIP_BG};padding:7px 12px;font-family:${FONT_STACK};font-size:13px;font-weight:bold;"><span style="color:${ACCENT};">Why</span><span style="color:#F5F5F5;">grid</span></td>
          <td style="padding:0;">${footerNoteHtml}</td>
        </tr></table>
      </td></tr>
    </table>
  </div>`;
}

export function renderEmailText(content: EmailContent): string {
  const parts = [content.heading, "", ...content.paragraphs.map(stripHtmlForText)];
  if (content.button) parts.push("", `${content.button.label}: ${content.button.url}`);
  if (content.note) parts.push("", stripHtmlForText(content.note));
  if (content.footerNote) parts.push("", stripHtmlForText(content.footerNote));
  return parts.join("\n");
}

// Простой стриппер тегов для текстовой версии — контент целиком наш собственный
// (не пользовательский ввод), экранирование не нужно, только снять разметку.
// mailto-ссылки — отдельным правилом: label и адрес обычно совпадают («напиши нам:
// support@whygrid.app»), «label: mailto:адрес» читалось бы задвоенным мусором.
function stripHtmlForText(html: string): string {
  return html
    .replace(/<a[^>]*href="mailto:[^"]*"[^>]*>([^<]*)<\/a>/g, "$1")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g, "$2: $1")
    .replace(/<[^>]+>/g, "");
}
