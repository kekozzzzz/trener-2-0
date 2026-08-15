import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/ui/wordmark";
import { TelegramIcon, InstagramIcon, TikTokIcon } from "@/components/ui/social-icons";
import { TELEGRAM_URL, INSTAGRAM_URL, TIKTOK_URL } from "@/config/social";

// Общий подвал сайта. Все юр-документы (оферта, политика ПДн, возврат, реквизиты) — на
// одной странице /legal по одной ссылке «Документы» рядом с годом (требование модерации
// платёжки и 152-ФЗ: доступны с любой страницы).
export async function SiteFooter() {
  const t = await getTranslations("Footer");

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex site-wrap flex-col gap-4 px-8 py-6 font-mono text-label uppercase tracking-label text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <div className="flex items-center gap-4">
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
          <a
            href={TIKTOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("tiktokLabel")}
            className="hover:text-foreground"
          >
            <TikTokIcon className="size-4" />
          </a>
          <Link href="/support" className="hover:text-foreground">
            {t("support")}
          </Link>
          <Link href="/legal" className="hover:text-foreground">
            {t("documents")}
          </Link>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
