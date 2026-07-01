"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { loginAction, type AuthFormState } from "@/features/auth/actions";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("Login");

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          {t("signingIn")}
          <LoadingDots />
        </>
      ) : (
        t("signIn")
      )}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);
  const t = useTranslations("Login");
  const tc = useTranslations("Common");

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {tc("email")}
        </Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="font-mono text-label uppercase tracking-label text-muted-foreground">
            {t("password")}
          </Label>
          <Link href="/forgot-password" className="text-small text-muted-foreground underline">
            {t("forgotPassword")}
          </Link>
        </div>
        <PasswordInput id="password" name="password" required autoComplete="current-password" />
      </div>

      {state.error && <p className="text-small text-destructive">{state.error}</p>}

      <SubmitButton />

      <div className="flex items-center gap-3 text-label text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono uppercase tracking-label">{tc("or")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Link href="/enter" className="block text-center text-small text-foreground underline">
        {t("passwordlessLink")}
      </Link>

      <p className="text-small text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/register" className="text-foreground underline">
          {t("register")}
        </Link>
      </p>
    </form>
  );
}
