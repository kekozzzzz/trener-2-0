"use client"

import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { LoadingDots } from "@/components/ui/loading-dots"

export function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          Обработка
          <LoadingDots />
        </>
      ) : (
        "Загрузить"
      )}
    </Button>
  )
}
