"use client";

// Кнопка оплаты/смены тарифа на странице цен. Дёргает серверный экшен (startCheckout
// для новой подписки или switchPlan для смены тарифа), который создаёт платёж в ЮKassa
// и возвращает ссылку на оплату; затем уводит браузер на форму оплаты. Деньги/ключи —
// на сервере, сюда приходит только URL или код результата.

import { useState, useTransition } from "react";
import { startCheckout, switchPlan } from "@/features/subscription/actions";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type Mode = "new" | "switch";

const ERROR_TEXT: Record<string, string> = {
  UNKNOWN_PLAN: "Тариф не найден. Обнови страницу.",
  SAME_PLAN: "Это твой текущий тариф.",
  NO_SUBSCRIPTION: "Нет активной подписки — оформи тариф заново.",
  PROVIDER_ERROR: "Не удалось открыть оплату. Попробуй ещё раз.",
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
        setMessage("Тариф повышен. Полная цена спишется при следующем продлении.");
      } else if (res.ok) {
        // Даунгрейд запланирован со следующего периода (оплата сейчас не нужна).
        setMessage("Тариф сменится со следующего периода. Текущий доступ сохраняется до конца оплаченного периода.");
      } else {
        setMessage(ERROR_TEXT[res.error] ?? "Что-то пошло не так. Попробуй ещё раз.");
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
        {pending ? "Открываем оплату…" : label}
      </button>
      {message && <p className="text-small text-muted-foreground">{message}</p>}
    </div>
  );
}
