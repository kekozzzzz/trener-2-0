"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { requestPasswordResetAction, type AuthFormState } from "@/features/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("ForgotPassword");

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          {t("sending")}
          <LoadingDots />
        </>
      ) : (
        t("submit")
      )}
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialState);
  const t = useTranslations("ForgotPassword");
  const tc = useTranslations("Common");

  // Ответ одинаков, есть такой email или нет, — не раскрываем существование аккаунта.
  if (state.success) {
    return (
      <div className="space-y-6">
        <p className="rounded-md border border-border bg-muted/40 p-4 text-small text-foreground">
          {t("sentNotice")}
        </p>
        <p className="text-small text-muted-foreground">
          <Link href="/login" className="text-foreground underline">
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {tc("email")}
        </Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      {state.error && <p className="text-small text-destructive">{state.error}</p>}

      <SubmitButton />

      <p className="text-small text-muted-foreground">
        {t("rememberedPassword")}{" "}
        <Link href="/login" className="text-foreground underline">
          {t("signIn")}
        </Link>
      </p>
    </form>
  );
}
