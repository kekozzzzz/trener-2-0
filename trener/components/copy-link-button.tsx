"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// Кнопка «скопировать ссылку» для меченых ссылок в /admin (блок «Источники»).
// Подпись меняется на 2 секунды после успешного копирования — без модалок и тостов.
export function CopyLinkButton({
  link,
  copyLabel,
  copiedLabel,
}: {
  link: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? copiedLabel : copyLabel}
    </Button>
  );
}
