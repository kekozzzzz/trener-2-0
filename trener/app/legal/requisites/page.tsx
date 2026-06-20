import Link from "next/link";
import { LegalLayout, LegalSection, P, LList } from "@/components/legal-layout";
import { OPERATOR, isOperatorReady } from "@/config/legal";

// Страница реквизитов — её ссылку модерация платёжного сервиса просит прямо в анкете.
// Для самозанятого достаточно: ФИО, статус НПД, ИНН, контакт. Банковские реквизиты
// публиковать не обязательно (их для оплаты собирает платёжный сервис).
// Паспорт/адрес НЕ публикуем (это ПДн).
export const metadata = { title: "Реквизиты — Whygrid" };

export default function RequisitesPage() {
  const ready = isOperatorReady();

  return (
    <LegalLayout title="Реквизиты">
      {!ready && (
        <P>
          <b>Реквизиты заполняются.</b> ФИО будет указано после оформления статуса
          самозанятого.
        </P>
      )}

      <LegalSection heading="Исполнитель">
        <LList
          items={[
            <>ФИО: {OPERATOR.fullName || "уточняется"}</>,
            <>Статус: {OPERATOR.status}</>,
            <>ИНН: {OPERATOR.inn}</>,
            <>Контакт: {OPERATOR.contactEmail}</>,
            <>Сайт: whygrid.app</>,
          ]}
        />
      </LegalSection>

      <P>
        Документы сервиса:{" "}
        <Link className="text-foreground underline" href="/legal/oferta">
          оферта
        </Link>
        ,{" "}
        <Link className="text-foreground underline" href="/legal/privacy">
          политика конфиденциальности
        </Link>
        ,{" "}
        <Link className="text-foreground underline" href="/legal/refund">
          политика возврата
        </Link>
        .
      </P>
    </LegalLayout>
  );
}
