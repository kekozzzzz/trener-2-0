import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/config/app";

// Карта сайта (/sitemap.xml) — только публичные страницы, которые мы хотим в поиске.
// Приватные адреса сюда не попадают; их индексацию закрывает noindex (lib/seo.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppBaseUrl();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/charts`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/range`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/push-fold`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/hand-review`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/how-to-export`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/legal`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
