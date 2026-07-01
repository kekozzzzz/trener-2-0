"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { updateNicknameAction, type NicknameFormState } from "@/features/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: NicknameFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  const tc = useTranslations("Common");
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? (
        <>
          {tc("saving")}
          <LoadingDots />
        </>
      ) : (
        tc("save")
      )}
    </Button>
  );
}

export function NicknameForm({ defaultNickname }: { defaultNickname: string }) {
  const [state, formAction] = useActionState(updateNicknameAction, initialState);
  const t = useTranslations("NicknameForm");

  return (
    <form action={formAction} className="mt-6 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="nickname" className="font-mono text-label uppercase tracking-label text-muted-foreground">
            {t("fieldLabel")}
          </Label>
          <Input
            id="nickname"
            name="nickname"
            type="text"
            maxLength={40}
            autoComplete="off"
            defaultValue={defaultNickname}
          />
        </div>
        <SubmitButton />
      </div>

      {state.saved === "set" && <p className="text-small text-primary">{t("savedSet")}</p>}
      {state.saved === "cleared" && (
        <p className="text-small text-primary">{t("savedCleared")}</p>
      )}
    </form>
  );
}
