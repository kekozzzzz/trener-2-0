import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/config/app";

// robots.txt отдаётся Next'ом по /robots.txt. Пускаем поисковик на весь сайт, кроме
// API: приватные страницы НЕ блокируем здесь специально — иначе бот не дойдёт до них
// и не увидит noindex (lib/seo.ts). Так уже проиндексированные приватные адреса
// корректно выпадут из выдачи. Карта сайта — только публичные страницы (sitemap.ts).
export default function robots(): MetadataRoute.Robots {
  const base = getAppBaseUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
