import { getAppBaseUrl } from "@/config/app";

// Микроразметка JSON-LD (schema.org) для главной: Organization + WebSite. Помогает
// Google связать имя «Whygrid» именно с этим доменом — чтобы сайт находился по бренду,
// а не только по точному адресу https://whygrid.app.
//
// Без dangerouslySetInnerHTML (запрещён проектом, architecture/07-безопасность.md).
// React экранирует символы < > & в текстовом содержимом <script>, поэтому в разметке
// используем ТОЛЬКО безопасные значения (имя бренда, URL, ссылка на логотип) — там
// этих символов нет, и JSON-LD доходит до поисковика в исходном виде. Свободный текст
// (описания) сюда не кладём специально: он мог бы содержать & и исказить JSON.
export function StructuredData() {
  const base = getAppBaseUrl();
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Whygrid",
      url: base,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Whygrid",
      url: base,
      logo: `${base}/icon.png`,
    },
  ];
  return <script type="application/ld+json">{JSON.stringify(data)}</script>;
}
