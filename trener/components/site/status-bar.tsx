import { getTranslations } from "next-intl/server";
import { LangSwitcher } from "@/components/lang-switcher";

// Верхняя статус-строка — design-system.md §4.1 п. 1.
// Тонкая полоса над шапкой: раздел слева, главное обещание продукта по центру,
// переключатель языка справа. Даёт странице тон приборной панели, а не буклета.
//
// Обещание «числа считает парсер» стоит здесь не для красоты: это правило 1 проекта,
// и оно должно быть видно на каждой странице, а не только на лендинге.
export async function StatusBar({ section }: { section?: string }) {
  const t = await getTranslations("StatusBar");

  return (
    <div className="border-b border-border bg-[#0B0B0B]">
      <div className="mx-auto flex site-wrap flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-2 font-mono text-[0.6875rem] uppercase tracking-label text-muted-foreground sm:px-8">
        <span className="flex items-center gap-2">
          <i aria-hidden className="block size-1.5 bg-primary" />
          {section ? t("sectionPrefix", { section }) : t("brand")}
        </span>
        <span className="hidden sm:inline">{t("promise")}</span>
        <LangSwitcher />
      </div>
    </div>
  );
}
