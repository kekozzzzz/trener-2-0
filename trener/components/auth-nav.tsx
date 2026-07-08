import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentPlayer } from "@/features/auth/queries";
import { logoutAction } from "@/features/auth/actions";
import { isAdminEmail } from "@/config/admin";
import { buttonVariants } from "@/components/ui/button";
import { LangSwitcher } from "@/components/lang-switcher";
import { cn } from "@/lib/utils";

export async function AuthNav() {
  const player = await getCurrentPlayer();
  const t = await getTranslations("Nav");

  if (!player) {
    return (
      <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 font-mono text-label uppercase tracking-label [&_a]:whitespace-nowrap">
        <Link href="/pricing" className="text-muted-foreground transition-colors hover:text-foreground">
          {t("pricing")}
        </Link>
        {/* Чарты публичные (решение Артёма 2026-07-06) — гость видит их из шапки. */}
        <Link href="/charts" className="text-muted-foreground transition-colors hover:text-foreground">
          {t("charts")}
        </Link>
        {/* Обе двери ведут на /enter — вход по ссылке первым; пароль и классическая
            регистрация остаются доступны по ссылкам с самой формы. Обе — полноценные
            кнопки (не текст-ссылки): гость на лендинге сразу видит, куда нажать
            (обратная связь тестера 2026-07-08). «Войти» — рамка, «Регистрация» —
            залитая акцентом (главное действие входа). */}
        <Link href="/enter" className={cn(buttonVariants({ variant: "outline" }))}>
          {t("login")}
        </Link>
        <Link href="/enter" className={cn(buttonVariants())}>
          {t("register")}
        </Link>
        <LangSwitcher />
      </nav>
    );
  }

  return (
    <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 font-mono text-label uppercase tracking-label [&_a]:whitespace-nowrap">
      {/* «Разбор» (загрузка) убран из меню — загрузить турнир можно со страницы «Мои
          турниры». «Тарифы» убраны — смена/выбор тарифа живёт в «Аккаунте». */}
      {/* Вкладка владельца: видна только админ-аккаунту (config/admin.ts). */}
      {isAdminEmail(player.email) && (
        <Link href="/admin" className="text-muted-foreground transition-colors hover:text-foreground">
          {t("admin")}
        </Link>
      )}
      <Link href="/tournaments" className="text-muted-foreground transition-colors hover:text-foreground">
        {t("myTournaments")}
      </Link>
      <Link href="/charts" className="text-muted-foreground transition-colors hover:text-foreground">
        {t("charts")}
      </Link>
      <Link href="/account" className="text-muted-foreground transition-colors hover:text-foreground">
        {t("account")}
      </Link>
      <form action={logoutAction}>
        <button type="submit" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          {t("logout")}
        </button>
      </form>
      <LangSwitcher />
    </nav>
  );
}
