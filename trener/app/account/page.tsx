import { noindex } from "@/lib/seo";
export const metadata = noindex;
import Link from "next/link";
import { requireSession } from "@/features/auth/session";
import { getCurrentPlayer } from "@/features/auth/queries";
import { logoutAction, logoutEverywhereAction, updateNicknameAction } from "@/features/auth/actions";
import { getSubscriptionState, periodEnd } from "@/features/subscription/access";
import { cancelAutoRenew, cancelScheduledPlan } from "@/features/subscription/actions";
import { getPlan } from "@/config/plans";
import { isRecurringEnabled } from "@/config/payments";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChangePasswordForm } from "./change-password-form";
import { CloseAccountForm } from "./close-account-form";

export default async function AccountPage() {
  const { playerId } = await requireSession();
  const player = await getCurrentPlayer();
  const sub = await getSubscriptionState(playerId);
  const plan = getPlan(sub.planCode);
  const scheduledPlan = getPlan(sub.subscription?.scheduledPlanCode);
  const isCanceled = sub.subscription?.status === "CANCELED";
  // Автопродление доступно только когда у магазина ЮKassa включён рекуррент. Пока он
  // выключен, подписка не продлевается сама — текст и кнопки не должны обещать обратное.
  const recurring = isRecurringEnabled();

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
          <h2 className="text-h2">Покерный ник</h2>
          <p className="mt-2 text-small text-muted-foreground">
            Показываем его в разборах вместо «Hero». Оставь пустым — вернётся «Hero».
          </p>
          <form action={updateNicknameAction} className="mt-6 flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="nickname" className="font-mono text-label uppercase tracking-label text-muted-foreground">
                Ник
              </Label>
              <Input
                id="nickname"
                name="nickname"
                type="text"
                maxLength={40}
                autoComplete="off"
                defaultValue={player?.nickname ?? ""}
              />
            </div>
            <Button type="submit" variant="outline">
              Сохранить
            </Button>
          </form>
        </div>

        <div className="mt-12 border-t border-border pt-12">
          <h2 className="text-h2">Подписка</h2>
          {sub.hasAccess && sub.subscription && plan ? (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <p className="text-body text-foreground">Тариф «{plan.title}»</p>
                <p className="text-small text-muted-foreground">
                  {!recurring || isCanceled ? "Действует до" : "Продлится"}{" "}
                  <span className="font-mono">
                    {periodEnd(sub.subscription).toLocaleDateString("ru-RU")}
                  </span>
                  {recurring && isCanceled && " — автопродление отключено, карта отвязана"}
                  {!recurring && " — дальше продлить вручную"}
                </p>
                {scheduledPlan && (
                  <p className="text-small text-muted-foreground">
                    Со следующего периода тариф сменится на «{scheduledPlan.title}».{" "}
                    <form action={cancelScheduledPlan} className="mt-1">
                      <button
                        type="submit"
                        className="font-mono text-label uppercase tracking-label text-primary transition-colors hover:text-foreground"
                      >
                        Отменить смену →
                      </button>
                    </form>
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <Link href="/pricing" className={cn(buttonVariants({ variant: "outline" }))}>
                  Сменить тариф
                </Link>
                {recurring && !isCanceled && (
                  <form action={cancelAutoRenew}>
                    <Button type="submit" variant="outline">
                      Отключить автопродление
                    </Button>
                  </form>
                )}
              </div>
              {recurring && !isCanceled && (
                <p className="text-small text-muted-foreground">
                  Отключение остановит списания и удалит сохранённую карту. Доступ
                  сохранится до конца оплаченного периода; чтобы продолжить дальше —
                  оформишь оплату заново.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-small text-muted-foreground">
                Подписки нет. Первый турнир разбираешь бесплатно — дальше оформи тариф,
                чтобы продолжать.
              </p>
              <Link href="/pricing" className={cn(buttonVariants())}>
                Выбрать тариф
              </Link>
            </div>
          )}
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
