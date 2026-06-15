import Link from "next/link";
import { BlurFade } from "@/components/ui/blur-fade";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <main>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <Link href="/" className="font-mono text-label uppercase tracking-label text-foreground">
            Тренер 2.0
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <BlurFade direction="up" offset={8} blur="0px" duration={0.3}>
          <div className="mx-auto max-w-md space-y-8">
            <div className="space-y-2">
              <h1 className="text-h1">Регистрация</h1>
              <p className="text-body text-muted-foreground">
                Создай аккаунт, чтобы загружать турниры и проходить разбор.
              </p>
            </div>
            <RegisterForm />
          </div>
        </BlurFade>
      </section>
    </main>
  );
}
