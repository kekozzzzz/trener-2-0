"use client";

// Отключение автопродления с шагом подтверждения — чтобы случайный клик не сбросил
// подписку с одного нажатия. Первый клик раскрывает вопрос «точно?»; отвязка карты и
// перевод в CANCELED (серверный экшен cancelAutoRenew) происходят только после явного
// подтверждения. revalidatePath внутри экшена обновит страницу, и блок автопродления
// исчезнет (карты больше нет).

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cancelAutoRenew } from "@/features/subscription/actions";
import { Button } from "@/components/ui/button";

export function CancelAutoRenewButton() {
  const t = useTranslations("Subscription");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
        {t("cancelAutoRenew")}
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-small text-muted-foreground">
        {t("cancelConfirmText")}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(async () => { await cancelAutoRenew(); })}
        >
          {pending ? t("cancelling") : t("cancelConfirmYes")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          {t("cancelKeep")}
        </Button>
      </div>
    </div>
  );
}
