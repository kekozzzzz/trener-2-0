import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Заголовки безопасности на каждый ответ (defense-in-depth поверх уже закрытого
// XSS — React экранирует текст, dangerouslySetInnerHTML запрещён,
// architecture/07-безопасность.md, раздел 2).
//
// CSP намеренно ограничивает только директивы, которые НЕ ломают Next.js:
// object-src/base-uri/frame-ancestors/form-action. script-src/style-src не
// заданы специально — инлайн-скрипты гидрации Next и инлайн-стили иначе
// потребовали бы nonce-инфраструктуры (отдельная задача); неуказанные директивы
// CSP не ограничивает, поэтому приложение работает как прежде.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // microphone=(self) — голосовой ввод ответа работает только на нашем же origin
  // (сторонним сайтам/iframe доступа нет). camera/geolocation не используем — закрыты.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  // HSTS — ТОЛЬКО в проде (там https за nginx). В dev на голом http этот заголовок
  // отравляет браузеру весь localhost: тот запоминает «только https» на год и любые
  // локальные страницы падают с ERR_SSL_PROTOCOL_ERROR (поймано 2026-07-02 на клике
  // по волшебной ссылке из письма). Лечится у поймавших: chrome://net-internals/#hsts
  // → Delete domain security policies → localhost.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
    : []),
];

const nextConfig: NextConfig = {
  // Пакетная загрузка турниров: до 100 HH-файлов в одном запросе серверного экшена.
  // Дефолтный лимит тела экшена — 1 МБ, его пробивает уже десяток файлов. Поднимаем
  // с запасом под сотню реальных HH (~190-250 КБ каждый). Точка входа залогинена и
  // ограничена часовым лимитом загрузок — вектор абуза узкий. На файл всё равно
  // действует потолок 5 МБ в обработчике (app/analyze/page.tsx).
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
  // geoip-country читает свою базу «IP → страна» файлами с диска (__dirname) —
  // бандлинг сломал бы пути. Оставляем пакет внешним: грузится из node_modules.
  serverExternalPackages: ["geoip-country"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Старые отдельные юр-страницы свели в одну /legal (UI-пачка 2026-06). Их адреса
  // успели попасть в индекс Google — редиректим на /legal, чтобы переход из старой
  // выдачи вёл на страницу, а не на 404, и поисковик консолидировал дубли.
  async redirects() {
    return [
      { source: "/legal/privacy", destination: "/legal", permanent: true },
      { source: "/legal/oferta", destination: "/legal", permanent: true },
      { source: "/legal/refund", destination: "/legal", permanent: true },
      { source: "/legal/requisites", destination: "/legal", permanent: true },
    ];
  },
};

// next-intl читает конфиг запроса из i18n/request.ts (язык из куки, сообщения из messages/).
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
