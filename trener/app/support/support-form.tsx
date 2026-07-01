"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { sendSupportMessageAction, type SupportFormState } from "@/features/support/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: SupportFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("Support");

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

// defaultEmail — почта залогиненного пользователя (подставляем, чтобы не вводил вручную).
// supportEmail — адрес поддержки из конфига (config/legal), для фолбэка «или напишите на».
export function SupportForm({
  defaultEmail,
  supportEmail,
}: {
  defaultEmail?: string;
  supportEmail: string;
}) {
  const [state, formAction] = useActionState(sendSupportMessageAction, initialState);
  const t = useTranslations("Support");

  if (state.success) {
    return (
      <div className="space-y-6">
        <p className="border border-border bg-muted/40 p-4 text-small text-foreground">
          {t("sentNotice")}
        </p>
        <p className="text-small text-muted-foreground">
          <Link href="/" className="text-foreground underline">
            {t("backHome")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label
          htmlFor="email"
          className="font-mono text-label uppercase tracking-label text-muted-foreground"
        >
          {t("emailLabel")}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaultEmail}
          placeholder={t("emailPlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="message"
          className="font-mono text-label uppercase tracking-label text-muted-foreground"
        >
          {t("messageLabel")}
        </Label>
        <Textarea id="message" name="message" required rows={6} placeholder={t("messagePlaceholder")} />
      </div>

      {/* Honeypot: скрытое поле-ловушка для ботов. Человек его не видит и не заполняет.
          aria-hidden + tabIndex=-1 + autoComplete off — вне поля зрения и клавиатуры. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.error && <p className="text-small text-destructive">{state.error}</p>}

      <SubmitButton />

      <p className="text-small text-muted-foreground">
        {t("orEmail")}{" "}
        <a href={`mailto:${supportEmail}`} className="text-foreground underline">
          {supportEmail}
        </a>
      </p>
    </form>
  );
}
