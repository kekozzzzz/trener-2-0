"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { requestPasswordResetAction, type AuthFormState } from "@/features/auth/actions";
import { Input } from "@/components/ui/input";
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
          Отправляем
          <LoadingDots />
        </>
      ) : (
        "Прислать ссылку"
      )}
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialState);

  // Ответ одинаков, есть такой email или нет, — не раскрываем существование аккаунта.
  if (state.success) {
    return (
      <div className="space-y-6">
        <p className="rounded-md border border-border bg-muted/40 p-4 text-small text-foreground">
          Если аккаунт с таким email существует, мы отправили на него ссылку для сброса пароля.
          Проверь почту (и папку «Спам»). Ссылка действует час.
        </p>
        <p className="text-small text-muted-foreground">
          <Link href="/login" className="text-foreground underline">
            Вернуться ко входу
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Email
        </Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      {state.error && <p className="text-small text-destructive">{state.error}</p>}

      <SubmitButton />

      <p className="text-small text-muted-foreground">
        Вспомнил пароль?{" "}
        <Link href="/login" className="text-foreground underline">
          Войти
        </Link>
      </p>
    </form>
  );
}
