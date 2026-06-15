import Link from "next/link";
import { getCurrentPlayer } from "@/features/auth/queries";
import { logoutAction } from "@/features/auth/actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function AuthNav() {
  const player = await getCurrentPlayer();

  if (!player) {
    return (
      <nav className="flex items-center gap-4 font-mono text-label uppercase tracking-label">
        <Link href="/pricing" className="text-muted-foreground transition-colors hover:text-foreground">
          Тарифы
        </Link>
        <Link href="/login" className="text-muted-foreground transition-colors hover:text-foreground">
          Войти
        </Link>
        <Link href="/register" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Регистрация
        </Link>
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-4 font-mono text-label uppercase tracking-label">
      <Link href="/tournaments" className="text-muted-foreground transition-colors hover:text-foreground">
        Мои турниры
      </Link>
      <Link href="/pricing" className="text-muted-foreground transition-colors hover:text-foreground">
        Тарифы
      </Link>
      <Link href="/account" className="text-muted-foreground transition-colors hover:text-foreground">
        Аккаунт
      </Link>
      <form action={logoutAction}>
        <button type="submit" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          Выйти
        </button>
      </form>
    </nav>
  );
}
