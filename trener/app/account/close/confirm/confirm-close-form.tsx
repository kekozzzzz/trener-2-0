"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { confirmAccountCloseAction, type AuthFormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("CloseAccount");
  return (
    <Button type="submit" variant="outline" disabled={pending} className="w-full">
      {pending ? (
        <>
          {t("confirmClosing")}
          <LoadingDots />
        </>
      ) : (
        t("confirmSubmit")
      )}
    </Button>
  );
}

export function ConfirmCloseForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(confirmAccountCloseAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="token" value={token} />
      {state.error && <p className="text-small text-destructive">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
