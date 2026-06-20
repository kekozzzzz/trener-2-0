"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { resetPasswordAction, type AuthFormState } from "@/features/auth/actions";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          Сохраняем
          <LoadingDots />
        </>
      ) : (
        "Сохранить пароль"
      )}
    </Button>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="token" value={token} />

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

      <SubmitButton />

      <p className="text-small text-muted-foreground">
        <Link href="/login" className="text-foreground underline">
          Вернуться ко входу
        </Link>
      </p>
    </form>
  );
}
