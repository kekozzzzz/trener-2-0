import Link from "next/link";
import { LegalLayout } from "@/components/legal-layout";
import { OfertaContent } from "@/components/legal/oferta-content";
import { PrivacyContent } from "@/components/legal/privacy-content";
import { RefundContent } from "@/components/legal/refund-content";
import { RequisitesContent } from "@/components/legal/requisites-content";
import { indexable } from "@/lib/seo";

// Сводная правовая страница: оферта, политика ПДн, возврат и реквизиты — всё на ОДНОЙ
// странице по одной ссылке (требование модерации платёжки и 152-ФЗ: документы доступны
// с любой страницы). Каждый документ — раздел с якорем (#oferta/#privacy/#refund/
// #requisites), кросс-ссылки внутри ведут на эти якоря.
export const metadata = {
  ...indexable,
  title: "Правовая информация",
  description:
    "Договор-оферта, политика конфиденциальности, политика возврата и реквизиты сервиса Whygrid — на одной странице.",
};

const DOCS = [
  { id: "oferta", title: "Договор-оферта", Content: OfertaContent },
  { id: "privacy", title: "Политика конфиденциальности", Content: PrivacyContent },
  { id: "refund", title: "Политика возврата", Content: RefundContent },
  { id: "requisites", title: "Реквизиты", Content: RequisitesContent },
];

export default function LegalPage() {
  return (
    <LegalLayout title="Правовая информация">
      {/* Оглавление — быстрый переход к нужному документу на этой же странице. */}
      <nav className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-label uppercase tracking-label text-muted-foreground">
        {DOCS.map((doc) => (
          <Link key={doc.id} href={`#${doc.id}`} className="hover:text-foreground">
            {doc.title}
          </Link>
        ))}
      </nav>

      {DOCS.map(({ id, title, Content }) => (
        <section
          key={id}
          id={id}
          className="space-y-6 scroll-mt-8 border-border pt-12 [&:not(:nth-child(2))]:border-t"
        >
          <h2 className="text-h2">{title}</h2>
          <Content />
        </section>
      ))}
    </LegalLayout>
  );
}
