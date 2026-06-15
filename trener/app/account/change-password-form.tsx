"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changePasswordAction, type AuthFormState } from "@/features/auth/actions";
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
        "Сменить пароль"
      )}
    </Button>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="currentPassword" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Текущий пароль
        </Label>
        <PasswordInput id="currentPassword" name="currentPassword" required autoComplete="current-password" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Новый пароль
        </Label>
        <PasswordInput id="newPassword" name="newPassword" required minLength={8} autoComplete="new-password" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPasswordConfirm" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Повтори новый пароль
        </Label>
        <PasswordInput id="newPasswordConfirm" name="newPasswordConfirm" required minLength={8} autoComplete="new-password" />
      </div>

      {state.error && <p className="text-small text-destructive">{state.error}</p>}
      {state.success && <p className="text-small text-primary">Пароль обновлён.</p>}

      <SubmitButton />
    </form>
  );
}
