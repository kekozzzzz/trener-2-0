"use client"

import { useFormStatus } from "react-dom"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { LoadingDots } from "@/components/ui/loading-dots"

export function SubmitButton() {
  const { pending } = useFormStatus()
  const t = useTranslations("UploadButton")

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          {t("processing")}
          <LoadingDots />
        </>
      ) : (
        t("submit")
      )}
    </Button>
  )
}
