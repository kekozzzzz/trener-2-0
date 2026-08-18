import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/ui/wordmark";
import { TelegramIcon, InstagramIcon } from "@/components/ui/social-icons";
import { TELEGRAM_URL, INSTAGRAM_URL } from "@/config/social";
import { cn } from "@/lib/utils";

// Общий подвал сайта. Все юр-документы (оферта, политика ПДн, возврат, реквизиты) — на
// одной странице /legal по одной ссылке «Документы» рядом с годом (требование модерации
// платёжки и 152-ФЗ: доступны с любой страницы).
// hideWordmark — для страниц, где прямо над подвалом уже стоит BigWordmark (§4.1 п. 11):
// без него бренд повторялся дважды подряд на одном экране.
export async function SiteFooter({ hideWordmark = false }: { hideWordmark?: boolean } = {}) {
  const t = await getTranslations("Footer");

  return (
    <footer className="border-t border-border">
      <div
        className={cn(
          "mx-auto flex site-wrap flex-col gap-4 px-8 py-6 font-mono text-label uppercase tracking-label text-muted-foreground sm:flex-row sm:items-center",
          hideWordmark ? "sm:justify-center" : "sm:justify-between"
        )}
      >
        {!hideWordmark && <Wordmark />}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("telegramLabel")}
            className="hover:text-foreground"
          >
            <TelegramIcon className="size-4" />
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("instagramLabel")}
            className="hover:text-foreground"
          >
            <InstagramIcon className="size-4" />
          </a>
          <Link href="/about" className="whitespace-nowrap hover:text-foreground">
            {t("about")}
          </Link>
          <Link href="/changelog" className="whitespace-nowrap hover:text-foreground">
            {t("changelog")}
          </Link>
          <Link href="/uptime" className="whitespace-nowrap hover:text-foreground">
            {t("uptime")}
          </Link>
          <Link href="/support" className="whitespace-nowrap hover:text-foreground">
            {t("support")}
          </Link>
          <Link href="/legal" className="whitespace-nowrap hover:text-foreground">
            {t("documents")}
          </Link>
          <span className="whitespace-nowrap">© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
