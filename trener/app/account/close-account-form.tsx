"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { requestAccountClosureAction, type AuthFormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("CloseAccount");
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? (
        <>
          {t("requestSending")}
          <LoadingDots />
        </>
      ) : (
        t("requestSubmit")
      )}
    </Button>
  );
}

export function CloseAccountForm() {
  const [state, formAction] = useActionState(requestAccountClosureAction, initialState);
  const t = useTranslations("CloseAccount");

  if (state.success) {
    return (
      <p className="rounded-md border border-border bg-muted/40 p-4 text-small text-foreground">
        {t("requestSentNotice")}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <p className="text-small text-muted-foreground">
        {t("requestWarning")}
      </p>

      {state.error && <p className="text-small text-destructive">{state.error}</p>}

      <SubmitButton />
    </form>
  );
}
