"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestAccountClosureAction, type AuthFormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? (
        <>
          Отправляем
          <LoadingDots />
        </>
      ) : (
        "Прислать ссылку для закрытия"
      )}
    </Button>
  );
}

export function CloseAccountForm() {
  const [state, formAction] = useActionState(requestAccountClosureAction, initialState);

  if (state.success) {
    return (
      <p className="rounded-md border border-border bg-muted/40 p-4 text-small text-foreground">
        Отправили на твою почту ссылку для подтверждения закрытия (проверь и «Спам»).
        Аккаунт закроется только после того, как ты перейдёшь по ней и нажмёшь кнопку.
        Ссылка действует час.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <p className="text-small text-muted-foreground">
        Закрытие необратимо: email и пароль удаляются, доступ к турнирам и разборам пропадёт
        (сами разборы остаются в базе обезличенными). Для подтверждения пришлём ссылку на почту —
        так аккаунт нельзя закрыть без доступа к ящику.
      </p>

      {state.error && <p className="text-small text-destructive">{state.error}</p>}

      <SubmitButton />
    </form>
  );
}
