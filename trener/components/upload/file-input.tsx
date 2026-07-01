"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface FileInputProps {
  id: string
  name: string
  accept?: string
  required?: boolean
  multiple?: boolean
}

export function FileInput({ id, name, accept, required, multiple }: FileInputProps) {
  const [names, setNames] = React.useState<string[]>([])
  const t = useTranslations("FileInput")

  // Подпись по числу выбранных: 0 — заглушка, 1 — имя файла, много — счётчик.
  const selectionLabel = (): string => {
    if (names.length === 0) return t("noFile")
    if (names.length === 1) return names[0]
    return t("selectedCount", { count: names.length })
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="flex cursor-pointer flex-col items-stretch gap-3 border border-border bg-card px-4 py-3 transition-[border-color] duration-100 ease-out has-focus-visible:border-primary has-focus-visible:shadow-focus sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <span
          className={cn(
            "truncate text-body",
            names.length > 0 ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {selectionLabel()}
        </span>
        <span
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full sm:w-auto sm:shrink-0")}
        >
          {multiple ? t("chooseFiles") : t("chooseFile")}
        </span>
        <input
          id={id}
          name={name}
          type="file"
          accept={accept}
          required={required}
          multiple={multiple}
          className="sr-only"
          onChange={(event) =>
            setNames(event.target.files ? Array.from(event.target.files, (f) => f.name) : [])
          }
        />
      </label>

      {names.length > 1 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-left font-mono text-label text-muted-foreground">
          {names.map((fileName, i) => (
            <li key={`${fileName}-${i}`} className="truncate">
              {fileName}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
