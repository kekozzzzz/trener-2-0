"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { registerAction, type AuthFormState } from "@/features/auth/actions";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { AI_PROCESSOR } from "@/config/legal";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("Register");

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          {t("registering")}
          <LoadingDots />
        </>
      ) : (
        t("submit")
      )}
    </Button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, initialState);
  const t = useTranslations("Register");
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
        <Label htmlFor="nickname" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {t("nicknameLabel")} <span className="normal-case tracking-normal">{t("nicknameOptional")}</span>
        </Label>
        <Input id="nickname" name="nickname" type="text" maxLength={40} autoComplete="off" />
        <p className="text-small text-muted-foreground">
          {t("nicknameHint")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {t("password")}
        </Label>
        <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="passwordConfirm" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {t("passwordConfirm")}
        </Label>
        <PasswordInput id="passwordConfirm" name="passwordConfirm" required minLength={8} autoComplete="new-password" />
      </div>

      <label className="flex items-start gap-3 text-small text-muted-foreground">
        <input type="checkbox" name="terms" required className="mt-1 size-4 accent-primary" />
        <span>
          {t("termsAccept")}{" "}
          <Link href="/legal#oferta" className="text-foreground underline">
            {t("termsOffer")}
          </Link>{" "}
          {t("termsAnd")}{" "}
          <Link href="/legal#privacy" className="text-foreground underline">
            {t("termsPrivacy")}
          </Link>{" "}
          {t("termsConsent", {
            processorName: AI_PROCESSOR.name,
            processorCountry: AI_PROCESSOR.country,
          })}
        </span>
      </label>

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
        {t("hasAccount")}{" "}
        <Link href="/login" className="text-foreground underline">
          {t("signIn")}
        </Link>
      </p>
    </form>
  );
}
