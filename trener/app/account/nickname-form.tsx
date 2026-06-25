"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateNicknameAction, type NicknameFormState } from "@/features/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";

const initialState: NicknameFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? (
        <>
          Сохраняем
          <LoadingDots />
        </>
      ) : (
        "Сохранить"
      )}
    </Button>
  );
}

export function NicknameForm({ defaultNickname }: { defaultNickname: string }) {
  const [state, formAction] = useActionState(updateNicknameAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="nickname" className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Ник
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

      {state.saved === "set" && <p className="text-small text-primary">Ник сохранён.</p>}
      {state.saved === "cleared" && (
        <p className="text-small text-primary">Ник убран — в разборах снова «Hero».</p>
      )}
    </form>
  );
}
