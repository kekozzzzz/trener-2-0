import Link from "next/link";
import { BlurFade } from "@/components/ui/blur-fade";
import { Wordmark } from "@/components/ui/wordmark";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;

  return (
    <main>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <Link href="/">
            <Wordmark />
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <BlurFade direction="up" offset={8} blur="0px" duration={0.3}>
          <div className="mx-auto max-w-md space-y-8">
            <div className="space-y-2 text-center">
              <h1 className="text-h1">Вход</h1>
              <p className="text-body text-muted-foreground">Войди, чтобы увидеть свои турниры.</p>
            </div>
            {reset === "1" && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-center text-small text-foreground">
                Пароль обновлён. Войди с новым паролем.
              </p>
            )}
            <LoginForm />
          </div>
        </BlurFade>
      </section>
    </main>
  );
}
