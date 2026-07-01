"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { requestMagicLinkAction, type AuthFormState } from "@/features/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("MagicLink");

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

export function EnterForm() {
  const [state, formAction] = useActionState(requestMagicLinkAction, initialState);
  const t = useTranslations("MagicLink");
  const tc = useTranslations("Common");

  // Ответ одинаков, есть такой аккаунт или нет, — не раскрываем существование почты.
  if (state.success) {
    return (
      <div className="space-y-6">
        <p className="rounded-md border border-border bg-muted/40 p-4 text-small text-foreground">
          {t("sentNotice")}
        </p>
        <p className="text-small text-muted-foreground">
          <Link href="/login" className="text-foreground underline">
            {t("signInWithPassword")}
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
        {t("preferPassword")}{" "}
        <Link href="/login" className="text-foreground underline">
          {t("signInWithPassword")}
        </Link>
      </p>
    </form>
  );
}
