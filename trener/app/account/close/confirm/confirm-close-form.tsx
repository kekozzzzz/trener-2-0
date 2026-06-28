"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { confirmAccountCloseAction, type AuthFormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} className="w-full">
      {pending ? (
        <>
          Закрываем
          <LoadingDots />
        </>
      ) : (
        "Да, закрыть аккаунт навсегда"
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
