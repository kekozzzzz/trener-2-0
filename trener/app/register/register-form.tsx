"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { registerAction, type AuthFormState } from "@/features/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { TERMS_TEXT } from "@/config/legal";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          Регистрируем
          <LoadingDots />
        </>
      ) : (
        "Зарегистрироваться"
      )}
    </Button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Email
        </Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Пароль
        </Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="passwordConfirm" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Повтори пароль
        </Label>
        <Input id="passwordConfirm" name="passwordConfirm" type="password" required minLength={8} autoComplete="new-password" />
      </div>

      <label className="flex items-start gap-3 text-small text-muted-foreground">
        <input type="checkbox" name="terms" required className="mt-1 size-4 accent-primary" />
        <span>{TERMS_TEXT}</span>
      </label>

      {state.error && <p className="text-small text-destructive">{state.error}</p>}

      <SubmitButton />

      <p className="text-small text-muted-foreground">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-foreground underline">
          Войти
        </Link>
      </p>
    </form>
  );
}
