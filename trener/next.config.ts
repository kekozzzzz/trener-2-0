import type { NextConfig } from "next";

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
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
