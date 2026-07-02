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
      <nav className="flex items-center gap-4 font-mono text-label uppercase tracking-label">
        <Link href="/pricing" className="text-muted-foreground transition-colors hover:text-foreground">
          {t("pricing")}
        </Link>
        <Link href="/login" className="text-muted-foreground transition-colors hover:text-foreground">
          {t("login")}
        </Link>
        <Link href="/register" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          {t("register")}
        </Link>
        <LangSwitcher />
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-4 font-mono text-label uppercase tracking-label">
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
