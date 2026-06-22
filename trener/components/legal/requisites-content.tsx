import Link from "next/link";
import { LegalSection, P, LList } from "@/components/legal-layout";
import { OPERATOR, isOperatorReady } from "@/config/legal";

// Содержимое реквизитов (раздел сводной страницы /legal) — ссылку модерация
// платёжного сервиса просит прямо в анкете. Для самозанятого достаточно: ФИО, статус
// НПД, ИНН, контакт. Банковские реквизиты публиковать не обязательно (их для оплаты
// собирает платёжный сервис). Паспорт/адрес НЕ публикуем (это ПДн).
export function RequisitesContent() {
  const ready = isOperatorReady();

  return (
    <>
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
        <Link className="text-foreground underline" href="#oferta">
          оферта
        </Link>
        ,{" "}
        <Link className="text-foreground underline" href="#privacy">
          политика конфиденциальности
        </Link>
        ,{" "}
        <Link className="text-foreground underline" href="#refund">
          политика возврата
        </Link>
        .
      </P>
    </>
  );
}
