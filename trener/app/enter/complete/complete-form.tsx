"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { completeRegistrationAction, type AuthFormState } from "@/features/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { AI_PROCESSOR } from "@/config/legal";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          Создаём аккаунт
          <LoadingDots />
        </>
      ) : (
        "Готово, войти"
      )}
    </Button>
  );
}

export function CompleteForm() {
  const [state, formAction] = useActionState(completeRegistrationAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="nickname" className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Покерный ник <span className="normal-case tracking-normal">(необязательно)</span>
        </Label>
        <Input id="nickname" name="nickname" type="text" maxLength={40} autoComplete="off" />
        <p className="text-small text-muted-foreground">
          Будем показывать его в разборах вместо «Hero». Можно добавить позже в аккаунте.
        </p>
      </div>

      <label className="flex items-start gap-3 text-small text-muted-foreground">
        <input type="checkbox" name="terms" required className="mt-1 size-4 accent-primary" />
        <span>
          Принимаю{" "}
          <Link href="/legal#oferta" className="text-foreground underline">
            оферту
          </Link>{" "}
          и{" "}
          <Link href="/legal#privacy" className="text-foreground underline">
            политику конфиденциальности
          </Link>{" "}
          и даю согласие на обработку моих данных, включая передачу обезличенных
          данных для анализа во внешнюю ИИ-модель {AI_PROCESSOR.name} (
          {AI_PROCESSOR.country}).
        </span>
      </label>

      {state.error && <p className="text-small text-destructive">{state.error}</p>}

      <SubmitButton />

      <p className="text-small text-muted-foreground">
        Ошиблись почтой?{" "}
        <Link href="/enter" className="text-foreground underline">
          Начать заново
        </Link>
      </p>
    </form>
  );
}
