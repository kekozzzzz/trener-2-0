"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { completeRegistrationAction, type AuthFormState } from "@/features/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { AI_PROCESSOR } from "@/config/legal";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("MagicLink");

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          {t("completeRegistering")}
          <LoadingDots />
        </>
      ) : (
        t("completeSubmit")
      )}
    </Button>
  );
}

export function CompleteForm() {
  const [state, formAction] = useActionState(completeRegistrationAction, initialState);
  const t = useTranslations("MagicLink");

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="nickname" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {t("nicknameLabel")} <span className="normal-case tracking-normal">{t("nicknameOptional")}</span>
        </Label>
        <Input id="nickname" name="nickname" type="text" maxLength={40} autoComplete="off" />
        <p className="text-small text-muted-foreground">
          {t("nicknameHint")}
        </p>
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

      <p className="text-small text-muted-foreground">
        {t("wrongEmail")}{" "}
        <Link href="/enter" className="text-foreground underline">
          {t("startOver")}
        </Link>
      </p>
    </form>
  );
}
