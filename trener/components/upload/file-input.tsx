"use client"

import * as React from "react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface FileInputProps {
  id: string
  name: string
  accept?: string
  required?: boolean
}

export function FileInput({ id, name, accept, required }: FileInputProps) {
  const [fileName, setFileName] = React.useState<string | null>(null)

  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer flex-col items-stretch gap-3 border border-border bg-card px-4 py-3 transition-[border-color] duration-100 ease-out has-focus-visible:border-primary has-focus-visible:shadow-focus sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <span
        className={cn(
          "truncate text-body",
          fileName ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {fileName ?? "Файл не выбран"}
      </span>
      <span
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full sm:w-auto sm:shrink-0")}
      >
        Выбрать файл
      </span>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        className="sr-only"
        onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
      />
    </label>
  )
}
