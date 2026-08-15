import { getTranslations } from "next-intl/server";
import { getAppBaseUrl } from "@/config/app";
import type { SupportedRoom } from "@/config/rooms";
import { TELEGRAM_URL, INSTAGRAM_URL } from "@/config/social";
import { STEP_SHOTS } from "@/components/upload/hand-history-guide";

// Микроразметка JSON-LD (schema.org) для главной: Organization + WebSite. Помогает
// Google связать имя «Whygrid» именно с этим доменом — чтобы сайт находился по бренду,
// а не только по точному адресу https://whygrid.app.
//
// alternateName — второе имя бренда для поиска с русской раскладки: «Вайгрид»
// (и «вай грид» вразбивку). Так Google знает, что запрос «вайгрид» — это про этот же
// сайт, а не только латинское «Whygrid».
//
// sameAs — подтверждённые аккаунты бренда во внешнем вебе (только реально существующие
// и живые, не «когда-нибудь заведём»). Помогает Google связать сущность «Whygrid» с её
// присутствием за пределами домена.
const BRAND_ALT_NAMES = ["Вайгрид", "вай грид"];
const BRAND_SAME_AS = [TELEGRAM_URL, INSTAGRAM_URL];

// Без dangerouslySetInnerHTML (запрещён проектом, architecture/07-безопасность.md).
// React экранирует символы < > & в текстовом содержимом <script>, поэтому голый
// JSON.stringify(data) искажает JSON, если где-то в значениях встретится & (типичная
// беда для свободного текста — например текста шага инструкции). Чиним стандартным
// приёмом: заменяем < > & на \uXXXX-эскейпы ПОСЛЕ сериализации — это валидный JSON-
// синтаксис, React его не трогает (это уже не буквальные < > &), а JSON.parse на
// стороне краулера/браузера декодирует \uXXXX обратно. Так разметку можно безопасно
// наполнять и свободным текстом, не только именами/URL без спецсимволов.
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function StructuredData() {
  const base = getAppBaseUrl();
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Whygrid",
      alternateName: BRAND_ALT_NAMES,
      url: base,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Whygrid",
      alternateName: BRAND_ALT_NAMES,
      url: base,
      logo: `${base}/icon.png`,
      sameAs: BRAND_SAME_AS,
    },
  ];
  return <script type="application/ld+json">{safeJsonLd(data)}</script>;
}

// HowTo-разметка для страниц /how-to-export/[room] (SEO 2026-08-15): те же шаги и
// скриншоты, что рендерит RoomSteps, только как schema.org/HowTo — Google умеет
// показывать пронумерованные шаги прямо в выдаче для такой разметки. Источник шагов
// и скриншотов — тот же UploadGuide/STEP_SHOTS, что кормит саму страницу: разметка не
// может разойтись с видимым текстом.
export async function HowToStructuredData({ room }: { room: SupportedRoom }) {
  const base = getAppBaseUrl();
  const t = await getTranslations("UploadGuide");
  const steps = t.raw(`steps.${room.id}`) as string[];
  const shots = STEP_SHOTS[room.id] ?? {};

  const data = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: t(`exportTitle.${room.id}`),
    description: t(`exportDescription.${room.id}`),
    step: steps.map((text, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      text,
      ...(shots[i] ? { image: `${base}${shots[i]}` } : {}),
    })),
  };

  return <script type="application/ld+json">{safeJsonLd(data)}</script>;
}
