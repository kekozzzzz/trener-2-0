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
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const t = useTranslations("FileInput")

  // Подпись по числу выбранных: 0 — заглушка, 1 — имя файла, много — счётчик.
  const selectionLabel = (): string => {
    if (names.length === 0) return t("noFile")
    if (names.length === 1) return names[0]
    return t("selectedCount", { count: names.length })
  }

  const syncNames = (files: FileList | null) =>
    setNames(files ? Array.from(files, (f) => f.name) : [])

  // Перетаскивание (обратная связь тестера 2026-07-08): брошенные файлы перекладываем
  // в сам <input type=file> через DataTransfer, иначе форма (server action, multipart)
  // их не увидит — она читает именно input.files, а не событие drop.
  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer?.files
    if (!dropped || dropped.length === 0) return
    const transfer = new DataTransfer()
    Array.from(dropped)
      .slice(0, multiple ? dropped.length : 1)
      .forEach((file) => transfer.items.add(file))
    if (inputRef.current) {
      inputRef.current.files = transfer.files
      syncNames(transfer.files)
    }
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-stretch gap-3 border bg-card px-4 py-3 transition-[border-color] duration-100 ease-out has-focus-visible:border-primary has-focus-visible:shadow-focus sm:flex-row sm:items-center sm:justify-between sm:gap-4",
          dragging ? "border-primary" : "border-border"
        )}
      >
        <span
          className={cn(
            "truncate text-body",
            dragging || names.length > 0 ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {dragging ? t("dropNow") : selectionLabel()}
        </span>
        <span
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full sm:w-auto sm:shrink-0")}
        >
          {multiple ? t("chooseFiles") : t("chooseFile")}
        </span>
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept={accept}
          required={required}
          multiple={multiple}
          className="sr-only"
          onChange={(event) => syncNames(event.target.files)}
        />
      </label>

      {/* Подсказка про перетаскивание — тихая моно-строка в стиле лейблов. */}
      <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
        {t("dropHint")}
      </p>

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
