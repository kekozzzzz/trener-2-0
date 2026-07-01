"use client";

// Кнопка оплаты/смены тарифа на странице цен. Дёргает серверный экшен (startCheckout
// для новой подписки или switchPlan для смены тарифа), который создаёт платёж в ЮKassa
// и возвращает ссылку на оплату; затем уводит браузер на форму оплаты. Деньги/ключи —
// на сервере, сюда приходит только URL или код результата.

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { startCheckout, switchPlan } from "@/features/subscription/actions";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type Mode = "new" | "switch";

// Код ошибки экшена → ключ в словаре. Неизвестный код — общий текст.
const ERROR_KEY: Record<string, string> = {
  UNKNOWN_PLAN: "errorUnknownPlan",
  SAME_PLAN: "errorSamePlan",
  NO_SUBSCRIPTION: "errorNoSubscription",
  PROVIDER_ERROR: "errorProviderError",
};

export function CheckoutButton({
  planCode,
  label,
  mode = "new",
  recurring = false,
  variant = "default",
}: {
  planCode: string;
  label: string;
  mode?: Mode;
  // recurring=true — подписка с автопродлением (сохранение карты); false — разовая оплата
  // любым способом без автосписания. Для mode="switch" не используется.
  recurring?: boolean;
  variant?: "default" | "outline";
}) {
  const t = useTranslations("Subscription");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onClick() {
    setMessage(null);
    startTransition(async () => {
      const res =
        mode === "switch" ? await switchPlan(planCode) : await startCheckout(planCode, recurring);
      if (res.ok && "confirmationUrl" in res) {
        // Апгрейд / новая подписка — уводим на оплату ЮKassa.
        window.location.href = res.confirmationUrl;
      } else if (res.ok && "applied" in res) {
        // Апгрейд применён сразу (копеечная доплата за остаток периода не списывалась).
        setMessage(t("upgradeApplied"));
      } else if (res.ok) {
        // Даунгрейд запланирован со следующего периода (оплата сейчас не нужна).
        setMessage(t("downgradeScheduled"));
      } else {
        const key = ERROR_KEY[res.error];
        setMessage(key ? t(key) : t("errorGeneric"));
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={cn(buttonVariants({ variant }), "w-full justify-center disabled:opacity-60")}
      >
        {pending ? t("openingPayment") : label}
      </button>
      {message && <p className="text-small text-muted-foreground">{message}</p>}
    </div>
  );
}
