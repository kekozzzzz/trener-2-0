import { requireSession } from "@/features/auth/session";
import { getCurrentPlayer } from "@/features/auth/queries";
import { logoutAction, logoutEverywhereAction } from "@/features/auth/actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "./change-password-form";
import { CloseAccountForm } from "./close-account-form";

export default async function AccountPage() {
  await requireSession();
  const player = await getCurrentPlayer();

  return (
    <main>
      <PageHeader />
      <section className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="text-h1">Аккаунт</h1>

        <div className="mt-8 space-y-2">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">Email</p>
          <p className="text-body text-foreground">{player?.email ?? "—"}</p>
        </div>

        <div className="mt-12 border-t border-border pt-12">
          <h2 className="text-h2">Сменить пароль</h2>
          <p className="mt-2 text-small text-muted-foreground">
            {player?.passwordChangedAt
              ? `Пароль менялся: ${player.passwordChangedAt.toLocaleDateString("ru-RU")}`
              : "Пароль ещё не менялся с момента регистрации."}
          </p>
          <div className="mt-6">
            <ChangePasswordForm />
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-12 space-y-6">
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Выйти
            </Button>
          </form>

          <div>
            <form action={logoutEverywhereAction}>
              <Button type="submit" variant="outline">
                Выйти на всех устройствах
              </Button>
            </form>
            <p className="mt-2 text-small text-muted-foreground">
              Завершит сессии на всех устройствах, включая это. Пригодится, если
              заходил с чужого компьютера или подозреваешь, что доступ у кого-то ещё.
            </p>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-12">
          <h2 className="text-h2">Закрыть аккаунт</h2>
          <div className="mt-6">
            <CloseAccountForm />
          </div>
        </div>
      </section>
    </main>
  );
}
