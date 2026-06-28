"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setPasswordAction, type AuthFormState } from "@/features/auth/actions";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          Сохраняем
          <LoadingDots />
        </>
      ) : (
        "Задать пароль"
      )}
    </Button>
  );
}

export function SetPasswordForm() {
  const [state, formAction] = useActionState(setPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="newPassword" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Пароль
        </Label>
        <PasswordInput id="newPassword" name="newPassword" required minLength={8} autoComplete="new-password" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPasswordConfirm" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Повтори пароль
        </Label>
        <PasswordInput id="newPasswordConfirm" name="newPasswordConfirm" required minLength={8} autoComplete="new-password" />
      </div>

      {state.error && <p className="text-small text-destructive">{state.error}</p>}
      {state.success && <p className="text-small text-primary">Пароль задан. Теперь можно входить и по паролю.</p>}

      <SubmitButton />
    </form>
  );
}
