"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { closeAccountAction, type AuthFormState } from "@/features/auth/actions";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? (
        <>
          Закрываем
          <LoadingDots />
        </>
      ) : (
        "Закрыть аккаунт"
      )}
    </Button>
  );
}

export function CloseAccountForm() {
  const [state, formAction] = useActionState(closeAccountAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <p className="text-small text-muted-foreground">
        Аккаунт будет закрыт, email и пароль удалены без возможности восстановления. Разборы турниров
        останутся в базе обезличенными. Подтверди паролем.
      </p>

      <div className="space-y-2">
        <Label htmlFor="password" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Пароль
        </Label>
        <PasswordInput id="password" name="password" required autoComplete="current-password" />
      </div>

      {state.error && <p className="text-small text-destructive">{state.error}</p>}

      <SubmitButton />
    </form>
  );
}
