import { Wordmark } from "@/components/ui/wordmark";

// Общий подвал сайта — один компонент, чтобы не дублировать по страницам.
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-8 font-mono text-label uppercase tracking-label text-muted-foreground">
        <Wordmark />
        <span>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
